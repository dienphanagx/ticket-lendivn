import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStatus, PaymentSource } from '../../src/db/enums.js';
import type { Order, User } from '../../src/db/types.js';
import {
  buildQuerydrRequest,
  buildQuerydrResponseSignData,
  createQuerydrClient,
  interpretQuerydrResponse,
  QuerydrFailure,
  QuerydrStatus,
} from '../../src/features/payments/vnpay-querydr.js';
import { buildTestApp } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { countLedgerTransactions, countPaymentTransactions } from '../support/ledger.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import {
  buildQuerydrResponse,
  buildVnpParams,
  createFakeQuerydrGateway,
  ipnUrl,
  QUERYDR_REQUEST_FIELDS,
  signParams,
  signPipe,
  signQuerydrResponse,
  TEST_HASH_SECRET,
  TEST_QUERY_URL,
  TEST_TMN_CODE,
  TEST_VNPAY_CONFIG,
  type FakeQuerydrGateway,
  type VnpParams,
} from '../support/vnpay.js';

const GATEWAY = { tmnCode: TEST_TMN_CODE, hashSecret: TEST_HASH_SECRET, queryUrl: TEST_QUERY_URL };
const QUERY_ORDER = { orderId: '261029ABCDEFGH12', vnpCreateDate: '20261029150000' };

describe('querydr signatures', () => {
  it('should build the response sign data in the documented field order with | separators', () => {
    // Arrange
    const response = {
      vnp_ResponseId: 'R1',
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_Message: 'OK',
      vnp_TmnCode: 'TMN',
      vnp_TxnRef: 'REF',
      vnp_Amount: '100',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261029153000',
      vnp_TransactionNo: '14',
      vnp_TransactionType: '01',
      vnp_TransactionStatus: '00',
      vnp_OrderInfo: 'Thanh toan don REF',
      vnp_PromotionCode: '',
      vnp_SecureHash: 'ignored',
    };

    // Act
    const data = buildQuerydrResponseSignData(response);

    // Assert: vnp_PromotionAmount thiếu → chuỗi rỗng ở cuối
    expect(data).toBe(
      'R1|querydr|00|OK|TMN|REF|100|NCB|20261029153000|14|01|00|Thanh toan don REF||',
    );
  });

  it('should sign the request over the documented fields with the stored create date', () => {
    // Act
    const request = buildQuerydrRequest(
      GATEWAY,
      QUERY_ORDER,
      new Date('2026-10-29T08:30:05.900Z'),
      'a'.repeat(32),
    );

    // Assert
    expect(request).toMatchObject({
      vnp_RequestId: 'a'.repeat(32),
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: TEST_TMN_CODE,
      vnp_TxnRef: QUERY_ORDER.orderId,
      vnp_TransactionDate: QUERY_ORDER.vnpCreateDate,
      vnp_CreateDate: '20261029153005',
      vnp_OrderInfo: `Thanh toan don ${QUERY_ORDER.orderId}`,
    });
    expect(request.vnp_SecureHash).toBe(signPipe(QUERYDR_REQUEST_FIELDS, request));
  });

  it('should reject a signed final result whose vnp_TxnRef is another order', () => {
    // Arrange
    const response = signQuerydrResponse(
      buildQuerydrResponse({ id: 'ZZZZZZZZZZZZZZZZ', buyer_total: 1_100_000 }),
    );

    // Act
    const result = interpretQuerydrResponse(response, QUERY_ORDER, TEST_HASH_SECRET);

    // Assert
    expect(result).toEqual({
      status: QuerydrStatus.FAILED,
      reason: QuerydrFailure.TXN_REF_MISMATCH,
    });
  });

  it('should generate a new 32-character hex request id for every query', async () => {
    // Arrange
    const gateway = createFakeQuerydrGateway();
    const query = createQuerydrClient(GATEWAY, { fetch: gateway.fetch });

    // Act
    await query(QUERY_ORDER);
    await query(QUERY_ORDER);

    // Assert
    const [first, second] = gateway.requests.map((request) => request.vnp_RequestId);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });

  it('should give up with TIMEOUT when the gateway does not answer within the budget', async () => {
    // Arrange: fetch treo tới khi signal abort
    const hanging = ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      })) as typeof fetch;
    const query = createQuerydrClient(GATEWAY, { fetch: hanging, timeoutMs: 50 });

    // Act
    const result = await query(QUERY_ORDER);

    // Assert
    expect(result).toMatchObject({ status: QuerydrStatus.FAILED, reason: QuerydrFailure.TIMEOUT });
  });
});

describe('GET /api/v1/orders/:orderId — querydr', () => {
  const db = createTestDb();

  let app: FastifyInstance;
  let gateway: FakeQuerydrGateway;
  let buyer: User;
  let order: Order;

  beforeEach(async () => {
    await resetDatabase(db);
    gateway = createFakeQuerydrGateway();
    app = await buildTestApp({ db, fetch: gateway.fetch }, TEST_VNPAY_CONFIG);
    const seller = await insertUser(db);
    buyer = await insertUser(db);
    const event = await insertEvent(db);
    const listing = await insertListing(db, { event_id: event.id, seller_id: seller.id });
    order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/payment-url`,
      payload: { clientIp: '203.0.113.7' },
    });
    expect(res.statusCode).toBe(200);
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await db.destroy();
  });

  interface OrderBody {
    data: { status: string; paymentUrl: string | null; retryAfterSeconds: number | null };
  }

  const getOrder = async (target: FastifyInstance = app) => {
    const res = await target.inject({ method: 'GET', url: `/api/v1/orders/${order.id}` });
    expect(res.statusCode).toBe(200);
    return res.json<OrderBody>().data;
  };

  const replyWith = (overrides: VnpParams = {}) =>
    gateway.reply({ body: signQuerydrResponse(buildQuerydrResponse(order, overrides)) });

  async function expectStillPending(): Promise<void> {
    const data = await getOrder();
    expect(data.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(data.retryAfterSeconds).toBe(3);
    expect(data.paymentUrl).not.toBeNull();
    expect(await countPaymentTransactions(db)).toBe(0);
    expect(await countLedgerTransactions(db)).toBe(0);
  }

  it('should query the gateway with the stored vnp_create_date as vnp_TransactionDate', async () => {
    // Arrange
    replyWith({ vnp_ResponseCode: '91', vnp_TransactionStatus: '' });

    // Act
    await getOrder();

    // Assert
    const stored = await db
      .selectFrom('orders')
      .select(['vnp_create_date', 'payment_url'])
      .where('id', '=', order.id)
      .executeTakeFirstOrThrow();
    const signedCreateDate = new URL(stored.payment_url ?? '').searchParams.get('vnp_CreateDate');
    expect(gateway.requests).toHaveLength(1);
    const [request] = gateway.requests;
    expect(request?.vnp_TransactionDate).toBe(stored.vnp_create_date);
    expect(request?.vnp_TransactionDate).toBe(signedCreateDate);
    expect(request?.vnp_TxnRef).toBe(order.id);
    expect(request?.vnp_SecureHash).toBe(signPipe(QUERYDR_REQUEST_FIELDS, request ?? {}));
  });

  it('should send the stored vnp_create_date, not the query time, for a URL created earlier', async () => {
    // Arrange: URL tạo từ trước, ngày đã lưu khác hẳn giờ tra cứu
    const storedCreateDate = '20261029080000';
    const earlier = await insertOrder(
      db,
      buildOrder(
        await db.selectFrom('listings').selectAll().executeTakeFirstOrThrow(),
        buyer.id,
        1,
        {
          payment_url: 'https://sandbox.vnpay.test/paymentv2/vpcpay.html?vnp_TxnRef=x',
          vnp_create_date: storedCreateDate,
          payment_url_created_at: sql<Date>`now()`,
        },
      ),
    );
    gateway.reply({ error: new TypeError('fetch failed') });

    // Act
    await app.inject({ method: 'GET', url: `/api/v1/orders/${earlier.id}` });

    // Assert
    expect(gateway.requests.at(-1)?.vnp_TransactionDate).toBe(storedCreateDate);
  });

  it('should record PAID from querydr when ResponseCode 00 and TransactionStatus 00', async () => {
    // Arrange
    replyWith();

    // Act
    const data = await getOrder();

    // Assert
    expect(data.status).toBe(OrderStatus.PAID);
    expect(data.retryAfterSeconds).toBeNull();
    const payment = await db
      .selectFrom('payment_transactions')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(payment.source).toBe(PaymentSource.QUERYDR);
    expect(await countLedgerTransactions(db)).toBe(1);
  });

  it('should record FAILED from querydr when TransactionStatus is 02', async () => {
    // Arrange
    replyWith({ vnp_TransactionStatus: '02', vnp_TransactionNo: '0' });

    // Act
    const data = await getOrder();

    // Assert
    expect(data.status).toBe(OrderStatus.FAILED);
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should treat a later IPN of the transaction recorded by querydr as a duplicate', async () => {
    // Arrange
    const txnNo = '14001234';
    replyWith({ vnp_TransactionNo: txnNo });
    await getOrder();

    // Act
    const res = await app.inject({
      method: 'GET',
      url: ipnUrl(signParams(buildVnpParams(order, { vnp_TransactionNo: txnNo }))),
    });

    // Assert
    expect(res.json<{ RspCode: string }>().RspCode).toBe('02');
    expect(await countLedgerTransactions(db)).toBe(1);
  });

  it('should keep the order pending when TransactionStatus is 01 (not final)', async () => {
    // Arrange
    replyWith({ vnp_TransactionStatus: '01' });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending when the gateway answers 91 (no transaction)', async () => {
    // Arrange
    gateway.reply({
      body: signQuerydrResponse({
        vnp_ResponseId: 'r91',
        vnp_Command: 'querydr',
        vnp_ResponseCode: '91',
        vnp_Message: 'Transaction not found',
        vnp_TmnCode: TEST_TMN_CODE,
        vnp_TxnRef: order.id,
      }),
    });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending on 91 even when the response echoes transaction fields', async () => {
    // Arrange
    replyWith({ vnp_ResponseCode: '91', vnp_TransactionStatus: '00' });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending on a network error', async () => {
    // Arrange
    gateway.reply({ error: new TypeError('fetch failed') });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending when the query times out', async () => {
    // Arrange
    gateway.reply({ error: new DOMException('The operation was aborted', 'TimeoutError') });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending on an HTTP error or a non-JSON object body', async () => {
    // Arrange
    gateway.reply({ status: 500, body: { error: 'down' } });
    await expectStillPending();
    gateway.reply({ body: ['not', 'an', 'object'] });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending when the response signature is wrong', async () => {
    // Arrange
    gateway.reply({
      body: signQuerydrResponse(buildQuerydrResponse(order), 'ANOTHER_SECRET'),
    });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending when a signed field was changed after signing', async () => {
    // Arrange
    const signed = signQuerydrResponse(
      buildQuerydrResponse(order, { vnp_TransactionStatus: '01' }),
    );
    gateway.reply({ body: { ...signed, vnp_TransactionStatus: '00' } });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep the order pending when the signed amount differs from the order total', async () => {
    // Arrange
    replyWith({ vnp_Amount: String(order.buyer_total * 100 + 100) });

    // Act + Assert
    await expectStillPending();
  });

  it('should keep both orders pending when the response references another existing order', async () => {
    // Arrange: đơn khác cùng tin bán, cùng số lượng → cùng buyer_total, chỉ check TxnRef chặn được
    const listing = await db.selectFrom('listings').selectAll().executeTakeFirstOrThrow();
    const other = await insertOrder(db, buildOrder(listing, buyer.id, 2));
    expect(other.buyer_total).toBe(order.buyer_total);
    replyWith({ vnp_TxnRef: other.id });

    // Act + Assert
    await expectStillPending();
    const otherStatus = await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', other.id)
      .executeTakeFirstOrThrow();
    expect(otherStatus.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await countPaymentTransactions(db)).toBe(0);
  });

  it('should return the recorded state when an IPN lands while querydr is in flight', async () => {
    // Arrange: cổng giữ response querydr; IPN cùng giao dịch ghi nhận trước
    const txnNo = '14005678';
    const held = gateway.holdNext();
    const pending = app.inject({ method: 'GET', url: `/api/v1/orders/${order.id}` });
    await held.requested;
    const ipn = await app.inject({
      method: 'GET',
      url: ipnUrl(signParams(buildVnpParams(order, { vnp_TransactionNo: txnNo }))),
    });
    expect(ipn.json<{ RspCode: string }>().RspCode).toBe('00');

    // Act: querydr trả cùng giao dịch → record() ra DUPLICATE
    held.release({
      body: signQuerydrResponse(buildQuerydrResponse(order, { vnp_TransactionNo: txnNo })),
    });
    const res = await pending;

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<OrderBody>().data).toMatchObject({
      status: OrderStatus.PAID,
      paymentUrl: null,
      retryAfterSeconds: null,
    });
    expect(await countLedgerTransactions(db)).toBe(1);
  });

  it('should answer 200 with the current state when recording the querydr result fails', async () => {
    // Arrange: lỗi DB thật khi ghi payment_transactions (trigger tạm trên DB test)
    await sql`
      CREATE FUNCTION test_fail_payment_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated database failure'; END; $$`.execute(db);
    await sql`
      CREATE TRIGGER test_fail_payment_insert BEFORE INSERT ON payment_transactions
      FOR EACH ROW EXECUTE FUNCTION test_fail_payment_insert()`.execute(db);
    replyWith();

    try {
      // Act + Assert: transaction ghi nhận rollback, không có bút toán nửa chừng
      await expectStillPending();
    } finally {
      await sql`DROP TRIGGER test_fail_payment_insert ON payment_transactions`.execute(db);
      await sql`DROP FUNCTION test_fail_payment_insert()`.execute(db);
    }
  });

  it('should not query the gateway for an order without a payment URL', async () => {
    // Arrange
    const fresh = await insertOrder(
      db,
      buildOrder(
        await db.selectFrom('listings').selectAll().executeTakeFirstOrThrow(),
        buyer.id,
        1,
      ),
    );

    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/orders/${fresh.id}` });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(gateway.requests).toHaveLength(0);
  });

  it('should not query the gateway once the order left PENDING_PAYMENT', async () => {
    // Arrange
    await db
      .updateTable('orders')
      .set({ status: OrderStatus.FAILED, failed_at: sql<Date>`now()` })
      .where('id', '=', order.id)
      .execute();

    // Act
    const data = await getOrder();

    // Assert
    expect(data.status).toBe(OrderStatus.FAILED);
    expect(gateway.requests).toHaveLength(0);
  });

  it('should skip querydr when VNPAY_QUERY_URL is not configured', async () => {
    // Arrange
    const unconfigured = await buildTestApp(
      { db, fetch: gateway.fetch },
      { ...TEST_VNPAY_CONFIG, VNPAY_QUERY_URL: undefined },
    );

    // Act
    const data = await getOrder(unconfigured);
    await unconfigured.close();

    // Assert
    expect(data.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(gateway.requests).toHaveLength(0);
  });
});
