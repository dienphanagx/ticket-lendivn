import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LedgerAccountType, OrderStatus } from '../../src/db/enums.js';
import type { Listing, Order, User } from '../../src/db/types.js';
import { buildTestApp, createUnreachableDb } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import {
  accountBalance,
  availableBalance,
  countLedgerTransactions,
  countPaymentTransactions,
  ledgerTotals,
  pendingBalance,
} from '../support/ledger.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import {
  buildVnpParams,
  IPN_URL,
  ipnUrl,
  signParams,
  TEST_HASH_SECRET,
  type VnpParams,
} from '../support/vnpay.js';

const db = createTestDb();

let app: FastifyInstance;
let seller: User;
let buyer: User;
let listing: Listing;
let order: Order;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db }, { VNPAY_HASH_SECRET: TEST_HASH_SECRET });
  seller = await insertUser(db);
  buyer = await insertUser(db);
  const event = await insertEvent(db);
  listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { unit_price: 500_000, quantity_total: 2 },
  );
  order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

interface IpnBody {
  RspCode: string;
  Message: string;
}

async function sendIpn(target: FastifyInstance, url: string): Promise<IpnBody> {
  const res = await target.inject({ method: 'GET', url });
  // Giao thức VNPay: luôn HTTP 200, kể cả khi từ chối
  expect(res.statusCode).toBe(200);
  return res.json<IpnBody>();
}

const ipn = (params: VnpParams) => sendIpn(app, ipnUrl(params));

const orderStatus = async (orderId = order.id) =>
  (
    await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirstOrThrow()
  ).status;

async function expectNothingRecorded(): Promise<void> {
  expect(await orderStatus()).toBe(OrderStatus.PENDING_PAYMENT);
  expect(await countPaymentTransactions(db)).toBe(0);
  expect(await countLedgerTransactions(db)).toBe(0);
}

describe('GET /api/v1/payments/vnpay/ipn — 00 / 02', () => {
  it('should confirm a valid payment with 00 and post it to escrow', async () => {
    // Act
    const body = await ipn(signParams(buildVnpParams(order)));

    // Assert
    expect(body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(await orderStatus()).toBe(OrderStatus.PAID);
    expect(await pendingBalance(db, seller.id)).toBe(order.seller_net);
    expect(await ledgerTotals(db)).toEqual({ debit: order.buyer_total, credit: order.buyer_total });
  });

  it('should verify a signature whose spaces were sent as %20 instead of +', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));
    const url = `${IPN_URL}?${Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&')}`;
    expect(url).toContain('Thanh%20toan');

    // Act
    const body = await sendIpn(app, url);

    // Assert
    expect(body.RspCode).toBe('00');
  });

  it('should ignore params without the vnp_ prefix', async () => {
    // Act
    const body = await ipn({
      ...signParams(buildVnpParams(order)),
      utm_source: 'mail',
      orderId: 'x',
    });

    // Assert
    expect(body.RspCode).toBe('00');
  });

  it('should answer 02 when the same IPN is delivered again, without posting twice', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));
    await ipn(params);

    // Act
    const body = await ipn(params);

    // Assert
    expect(body).toEqual({ RspCode: '02', Message: 'Order already confirmed' });
    expect(await countLedgerTransactions(db)).toBe(1);
    expect(await countPaymentTransactions(db)).toBe(1);
  });

  it('should answer 02 for a failure reaching an order that already left PENDING_PAYMENT', async () => {
    // Arrange
    await ipn(signParams(buildVnpParams(order)));

    // Act
    const body = await ipn(
      signParams(buildVnpParams(order, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' })),
    );

    // Assert
    expect(body.RspCode).toBe('02');
    expect(await orderStatus()).toBe(OrderStatus.PAID);
  });

  it('should answer 00 and mark the order FAILED for a failed payment', async () => {
    // Act
    const body = await ipn(
      signParams(buildVnpParams(order, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' })),
    );

    // Assert
    expect(body.RspCode).toBe('00');
    expect(await orderStatus()).toBe(OrderStatus.FAILED);
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should answer 00 for a late payment that can no longer get tickets and owe a refund', async () => {
    // Arrange: đơn quá hạn, người khác đã mua hết vé
    const late = await insertOrder(
      db,
      buildOrder(listing, buyer.id, 2, {
        status: OrderStatus.EXPIRED,
        expired_at: sql<Date>`now()`,
        created_at: sql<Date>`now() - interval '20 minutes'`,
        hold_expires_at: sql<Date>`now() - interval '5 minutes'`,
      }),
    );
    await db
      .updateTable('orders')
      .set({ status: OrderStatus.PAID, paid_at: sql<Date>`now()` })
      .where('id', '=', order.id)
      .execute();

    // Act
    const body = await ipn(signParams(buildVnpParams(late)));

    // Assert
    expect(body.RspCode).toBe('00');
    expect(await orderStatus(late.id)).toBe(OrderStatus.REFUND_REQUIRED);
    expect(await availableBalance(db, buyer.id)).toBe(late.buyer_total);
    expect(await accountBalance(db, LedgerAccountType.GATEWAY_CASH)).toBe(late.buyer_total);
  });
});

describe('GET /api/v1/payments/vnpay/ipn — rejections', () => {
  it('should answer 01 for an unknown order', async () => {
    // Act
    const body = await ipn(
      signParams(buildVnpParams({ id: 'ZZZZZZZZZZZZZZZZ', buyer_total: order.buyer_total })),
    );

    // Assert
    expect(body).toEqual({ RspCode: '01', Message: 'Order not found' });
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should answer 04 for a signed amount that differs from the order total', async () => {
    // Act
    const body = await ipn(
      signParams(buildVnpParams(order, { vnp_Amount: String(order.buyer_total * 100 - 100) })),
    );

    // Assert
    expect(body).toEqual({ RspCode: '04', Message: 'Invalid amount' });
    await expectNothingRecorded();
  });

  it('should answer 97 for a tampered signature', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));
    const hash = params.vnp_SecureHash ?? '';
    params.vnp_SecureHash = hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0');

    // Act
    const body = await ipn(params);

    // Assert
    expect(body).toEqual({ RspCode: '97', Message: 'Invalid signature' });
    await expectNothingRecorded();
  });

  it('should answer 97 when a signed field was changed after signing', async () => {
    // Arrange: người gửi đổi mã phản hồi thất bại thành thành công
    const params = signParams(
      buildVnpParams(order, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
    );

    // Act
    const body = await ipn({ ...params, vnp_ResponseCode: '00', vnp_TransactionStatus: '00' });

    // Assert
    expect(body.RspCode).toBe('97');
    await expectNothingRecorded();
  });

  it('should answer 97 when the signature is missing', async () => {
    // Act
    const body = await ipn(buildVnpParams(order));

    // Assert
    expect(body.RspCode).toBe('97');
    await expectNothingRecorded();
  });

  it('should answer 97 when a vnp_ param appears twice', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));

    // Act
    const body = await sendIpn(app, `${ipnUrl(params)}&vnp_Amount=${params.vnp_Amount}`);

    // Assert
    expect(body.RspCode).toBe('97');
    await expectNothingRecorded();
  });

  it('should answer 97 when signed with another secret', async () => {
    // Act
    const body = await ipn(signParams(buildVnpParams(order), 'ANOTHER_SECRET'));

    // Assert
    expect(body.RspCode).toBe('97');
    await expectNothingRecorded();
  });

  it('should answer 97 without crashing when the gateway secret is not configured', async () => {
    // Arrange
    const unconfigured = await buildTestApp({ db });

    // Act
    const body = await sendIpn(unconfigured, ipnUrl(signParams(buildVnpParams(order))));
    await unconfigured.close();

    // Assert
    expect(body.RspCode).toBe('97');
    await expectNothingRecorded();
  });

  it.each([
    ['vnp_TransactionNo is not numeric', { vnp_TransactionNo: 'ABC123' }],
    ['vnp_TxnRef is too short', { vnp_TxnRef: 'SHORT' }],
    ['vnp_Amount is not a positive integer', { vnp_Amount: '-110000000' }],
    ['vnp_ResponseCode is not 2 digits', { vnp_ResponseCode: '0' }],
    ['vnp_PayDate is not a real date', { vnp_PayDate: '20261399153000' }],
    ['vnp_BankCode is longer than 20 characters', { vnp_BankCode: 'B'.repeat(21) }],
  ])('should answer 99 after a valid signature when %s', async (_case, overrides) => {
    // Act
    const body = await ipn(signParams(buildVnpParams(order, overrides)));

    // Assert
    expect(body).toEqual({ RspCode: '99', Message: 'Invalid request' });
    await expectNothingRecorded();
  });

  it('should answer 99 when a required field is missing after a valid signature', async () => {
    // Arrange
    const params = buildVnpParams(order);
    delete params.vnp_TransactionNo;

    // Act
    const body = await ipn(signParams(params));

    // Assert
    expect(body.RspCode).toBe('99');
    await expectNothingRecorded();
  });

  it('should answer 99 when the database is unavailable', async () => {
    // Arrange
    const unreachable = createUnreachableDb();
    const broken = await buildTestApp({ db: unreachable }, { VNPAY_HASH_SECRET: TEST_HASH_SECRET });

    // Act
    const body = await sendIpn(broken, ipnUrl(signParams(buildVnpParams(order))));
    await broken.close();
    await unreachable.destroy();

    // Assert
    expect(body).toEqual({ RspCode: '99', Message: 'Unknown error' });
    await expectNothingRecorded();
  });
});
