import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStatus } from '../../src/db/enums.js';
import type { Listing, Order, User } from '../../src/db/types.js';
import { verifyVnpaySignature } from '../../src/features/payments/vnpay-signature.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { countLedgerTransactions } from '../support/ledger.js';
import { buildOverdueOrder, waitForLockWaiters } from '../support/orders.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import {
  TEST_HASH_SECRET,
  TEST_PAYMENT_URL,
  TEST_RETURN_URL_BASE,
  TEST_TMN_CODE,
  TEST_VNPAY_CONFIG,
} from '../support/vnpay.js';

const db = createTestDb();

const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
const CLIENT_IP = '203.0.113.7';

let app: FastifyInstance;
let buyer: User;
let listing: Listing;
let order: Order;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db }, TEST_VNPAY_CONFIG);
  const seller = await insertUser(db);
  buyer = await insertUser(db);
  const event = await insertEvent(db);
  listing = await insertListing(db, { event_id: event.id, seller_id: seller.id });
  order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

interface PaymentUrlBody {
  data: { paymentUrl: string; expiresAt: string };
}

const postPaymentUrl = (
  orderId: string,
  payload: Record<string, unknown> = { clientIp: CLIENT_IP },
  target: FastifyInstance = app,
) => target.inject({ method: 'POST', url: `/api/v1/orders/${orderId}/payment-url`, payload });

/** `yyyyMMddHHmmss` GMT+7, tính độc lập với code app. */
const toGmt7Compact = (date: Date): string => {
  const shifted = new Date(date.getTime() + GMT7_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    String(shifted.getUTCFullYear()) +
    pad(shifted.getUTCMonth() + 1) +
    pad(shifted.getUTCDate()) +
    pad(shifted.getUTCHours()) +
    pad(shifted.getUTCMinutes()) +
    pad(shifted.getUTCSeconds())
  );
};

const readOrder = (orderId = order.id) =>
  db.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();

describe('POST /api/v1/orders/:orderId/payment-url — success', () => {
  it('should return a signed VNPay URL with the protocol parameters of the order', async () => {
    // Act
    const res = await postPaymentUrl(order.id);

    // Assert
    expect(res.statusCode).toBe(200);
    const { data } = res.json<PaymentUrlBody>();
    const url = new URL(data.paymentUrl);
    expect(`${url.origin}${url.pathname}`).toBe(TEST_PAYMENT_URL);
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: TEST_TMN_CODE,
      vnp_Amount: String(order.buyer_total * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: order.id,
      vnp_OrderInfo: `Thanh toan don ${order.id}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: `${TEST_RETURN_URL_BASE}/${order.id}`,
      vnp_IpAddr: CLIENT_IP,
      vnp_ExpireDate: toGmt7Compact(order.hold_expires_at),
    });
    expect(params.vnp_OrderInfo).toMatch(/^[A-Za-z0-9 ]+$/);
    expect(data.expiresAt).toBe(order.hold_expires_at.toISOString());
  });

  it('should sign the URL so that the gateway signature check accepts it', async () => {
    // Act
    const { data } = (await postPaymentUrl(order.id)).json<PaymentUrlBody>();

    // Assert
    const params = Object.fromEntries(new URL(data.paymentUrl).searchParams);
    expect(params.vnp_SecureHash).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyVnpaySignature(params, TEST_HASH_SECRET)).toBe(true);
    expect(verifyVnpaySignature({ ...params, vnp_Amount: '1' }, TEST_HASH_SECRET)).toBe(false);
  });

  it('should store the URL, the exact signed vnp_CreateDate and the creation time once', async () => {
    // Arrange
    const before = Date.now();

    // Act
    const { data } = (await postPaymentUrl(order.id)).json<PaymentUrlBody>();

    // Assert
    const stored = await readOrder();
    const createDate = new URL(data.paymentUrl).searchParams.get('vnp_CreateDate');
    expect(stored.payment_url).toBe(data.paymentUrl);
    expect(stored.vnp_create_date).toBe(createDate);
    expect(createDate).toMatch(/^\d{14}$/);
    expect((stored.vnp_create_date ?? '') >= toGmt7Compact(new Date(before - 1000))).toBe(true);
    expect(stored.payment_url_created_at).not.toBeNull();
    expect(stored.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should return the same stored URL on later calls without a new session', async () => {
    // Arrange
    const first = (await postPaymentUrl(order.id)).json<PaymentUrlBody>();
    const stored = await readOrder();

    // Act
    const second = await postPaymentUrl(order.id, { clientIp: '198.51.100.9', locale: 'en' });

    // Assert
    expect(second.statusCode).toBe(200);
    expect(second.json<PaymentUrlBody>().data.paymentUrl).toBe(first.data.paymentUrl);
    expect((await readOrder()).vnp_create_date).toBe(stored.vnp_create_date);
  });

  it('should return the stored URL to both callers when two first calls race', async () => {
    // Arrange: giữ khoá hàng của đơn để cả 2 request cùng đọc "chưa có URL" rồi đứng chờ ở UPDATE
    let requests: Promise<Awaited<ReturnType<typeof postPaymentUrl>>[]> | undefined;
    await db.transaction().execute(async (trx) => {
      await trx.selectFrom('orders').select('id').where('id', '=', order.id).forUpdate().execute();
      // Act: tham số khác nhau → URL tự dựng của 2 bên khác nhau, chỉ 1 được lưu
      requests = Promise.all([
        postPaymentUrl(order.id, { clientIp: CLIENT_IP }),
        postPaymentUrl(order.id, { clientIp: '198.51.100.9', locale: 'en' }),
      ]);
      await waitForLockWaiters(db, 2);
    });
    const [a, b] = (await requests) ?? [];
    if (a === undefined || b === undefined) {
      throw new Error('race requests did not start');
    }

    // Assert
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const stored = (await readOrder()).payment_url;
    expect(stored).not.toBeNull();
    expect(a.json<PaymentUrlBody>().data.paymentUrl).toBe(stored);
    expect(b.json<PaymentUrlBody>().data.paymentUrl).toBe(stored);
  });

  it('should pass the requested locale and accept an IPv6 client address', async () => {
    // Act
    const res = await postPaymentUrl(order.id, { clientIp: '2001:db8::1', locale: 'en' });

    // Assert
    const params = new URL(res.json<PaymentUrlBody>().data.paymentUrl).searchParams;
    expect(params.get('vnp_Locale')).toBe('en');
    expect(params.get('vnp_IpAddr')).toBe('2001:db8::1');
  });
});

describe('POST /api/v1/orders/:orderId/payment-url — rejections', () => {
  it('should return 404 ORDER_NOT_FOUND for an unknown order', async () => {
    // Act
    const res = await postPaymentUrl('ZZZZZZZZZZZZZZZZ');

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('ORDER_NOT_FOUND');
  });

  it('should expire an overdue order in place and return 409 ORDER_NOT_PAYABLE EXPIRED', async () => {
    // Arrange
    const overdue = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));

    // Act
    const res = await postPaymentUrl(overdue.id);

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>()).toMatchObject({
      code: 'ORDER_NOT_PAYABLE',
      details: { status: 'EXPIRED' },
    });
    const stored = await readOrder(overdue.id);
    expect(stored.status).toBe(OrderStatus.EXPIRED);
    expect(stored.payment_url).toBeNull();
  });

  it.each([
    [OrderStatus.PAID, { paid_at: sql<Date>`now()` }],
    [OrderStatus.FAILED, { failed_at: sql<Date>`now()` }],
    [OrderStatus.REFUND_REQUIRED, { refund_required_at: sql<Date>`now()` }],
  ])('should return 409 ORDER_NOT_PAYABLE for an order in %s', async (status, timestamps) => {
    // Arrange
    const settled = await insertOrder(
      db,
      buildOrder(listing, buyer.id, 1, { status, ...timestamps }),
    );

    // Act
    const res = await postPaymentUrl(settled.id);

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>()).toMatchObject({ code: 'ORDER_NOT_PAYABLE', details: { status } });
  });

  it.each([
    ['VNPAY_TMN_CODE', { VNPAY_TMN_CODE: undefined }],
    ['VNPAY_HASH_SECRET', { VNPAY_HASH_SECRET: undefined }],
    ['VNPAY_PAYMENT_URL', { VNPAY_PAYMENT_URL: undefined }],
    ['VNPAY_RETURN_URL_BASE', { VNPAY_RETURN_URL_BASE: undefined }],
  ])('should return 503 PAYMENT_GATEWAY_UNAVAILABLE without %s', async (_name, missing) => {
    // Arrange
    const unconfigured = await buildTestApp({ db }, { ...TEST_VNPAY_CONFIG, ...missing });

    // Act
    const res = await postPaymentUrl(order.id, { clientIp: CLIENT_IP }, unconfigured);
    await unconfigured.close();

    // Assert
    expect(res.statusCode).toBe(503);
    expect(res.json<ErrorBody>()).toEqual({
      code: 'PAYMENT_GATEWAY_UNAVAILABLE',
      message: 'Payment gateway is not configured',
    });
    expect((await readOrder()).payment_url).toBeNull();
  });

  it.each([
    ['clientIp is missing', {}, 'clientIp'],
    ['clientIp is not an IP address', { clientIp: 'not-an-ip' }, 'clientIp'],
    ['clientIp is longer than 45 characters', { clientIp: `${'1'.repeat(46)}` }, 'clientIp'],
    ['locale is not vn or en', { clientIp: CLIENT_IP, locale: 'fr' }, 'locale'],
  ])('should return 400 VALIDATION_FAILED when %s', async (_case, payload, field) => {
    // Act
    const res = await postPaymentUrl(order.id, payload);

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.details ?? {})).toEqual([field]);
  });

  it('should return 400 VALIDATION_FAILED for a malformed orderId', async () => {
    // Act
    const res = await postPaymentUrl('bad-id');

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().details).toHaveProperty('orderId');
  });
});
