import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStatus, PaymentSource } from '../../src/db/enums.js';
import type { Order, User } from '../../src/db/types.js';
import { buildTestApp, createUnreachableDb, type ErrorBody } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import {
  countLedgerTransactions,
  countPaymentTransactions,
  pendingBalance,
} from '../support/ledger.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import {
  buildVnpParams,
  ipnUrl,
  RETURN_URL,
  signParams,
  TEST_HASH_SECRET,
  TEST_VNPAY_CONFIG,
  type VnpParams,
} from '../support/vnpay.js';

const db = createTestDb();

let app: FastifyInstance;
let seller: User;
let order: Order;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db }, TEST_VNPAY_CONFIG);
  seller = await insertUser(db);
  const buyer = await insertUser(db);
  const event = await insertEvent(db);
  const listing = await insertListing(db, { event_id: event.id, seller_id: seller.id });
  order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

interface ReturnBody {
  data: { orderId: string; status: string; result: string };
}

const postReturn = (payload: unknown, target: FastifyInstance = app) =>
  target.inject({ method: 'POST', url: RETURN_URL, payload: payload as Record<string, unknown> });

const orderRow = () =>
  db.selectFrom('orders').selectAll().where('id', '=', order.id).executeTakeFirstOrThrow();

async function expectNothingRecorded(): Promise<void> {
  expect((await orderRow()).status).toBe(OrderStatus.PENDING_PAYMENT);
  expect(await countPaymentTransactions(db)).toBe(0);
  expect(await countLedgerTransactions(db)).toBe(0);
}

const FAILED_RESULT = { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' };

describe('POST /api/v1/payments/vnpay/return — recorded', () => {
  it('should record a valid success as PAID with source RETURN_URL', async () => {
    // Act
    const res = await postReturn(signParams(buildVnpParams(order)));

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<ReturnBody>()).toEqual({
      data: { orderId: order.id, status: OrderStatus.PAID, result: 'RECORDED' },
    });
    expect(await pendingBalance(db, seller.id)).toBe(order.seller_net);
    const payment = await db
      .selectFrom('payment_transactions')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(payment.source).toBe(PaymentSource.RETURN_URL);
  });

  it('should answer DUPLICATE when the same parameters are forwarded again', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));
    await postReturn(params);

    // Act
    const res = await postReturn(params);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<ReturnBody>().data).toEqual({
      orderId: order.id,
      status: OrderStatus.PAID,
      result: 'DUPLICATE',
    });
    expect(await countLedgerTransactions(db)).toBe(1);
  });

  it('should answer DUPLICATE after the IPN of the same transaction, posting once', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));
    await app.inject({ method: 'GET', url: ipnUrl(params) });

    // Act
    const res = await postReturn(params);

    // Assert
    expect(res.json<ReturnBody>().data.result).toBe('DUPLICATE');
    expect(await countLedgerTransactions(db)).toBe(1);
    expect(await countPaymentTransactions(db)).toBe(1);
  });

  it('should record a failed payment as FAILED without posting to the ledger', async () => {
    // Act
    const res = await postReturn(signParams(buildVnpParams(order, FAILED_RESULT)));

    // Assert
    expect(res.json<ReturnBody>().data).toMatchObject({
      status: OrderStatus.FAILED,
      result: 'RECORDED',
    });
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should treat an empty vnp_PayDate and vnp_BankCode as absent', async () => {
    // Act
    const res = await postReturn(
      signParams(buildVnpParams(order, { vnp_PayDate: '', vnp_BankCode: '' })),
    );

    // Assert
    expect(res.json<ReturnBody>().data.result).toBe('RECORDED');
    const payment = await db
      .selectFrom('payment_transactions')
      .select(['pay_date', 'bank_code'])
      .executeTakeFirstOrThrow();
    expect(payment).toEqual({ pay_date: null, bank_code: null });
  });

  it('should accept a signature computed without the empty vnp_ params', async () => {
    // Arrange: cổng ký sau khi đã bỏ các field rỗng, nhưng vẫn gửi chúng lên
    const nonEmpty = buildVnpParams(order);
    delete nonEmpty.vnp_BankCode;
    const signed = { ...signParams(nonEmpty), vnp_BankCode: '' };

    // Act
    const res = await postReturn(signed);

    // Assert
    expect(res.json<ReturnBody>().data.result).toBe('RECORDED');
  });
});

describe('POST /api/v1/payments/vnpay/return — rejections', () => {
  it('should return 422 PAYMENT_SIGNATURE_INVALID for a tampered signed field', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order, FAILED_RESULT));

    // Act
    const res = await postReturn({
      ...params,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>()).toEqual({
      code: 'PAYMENT_SIGNATURE_INVALID',
      message: 'Payment signature is invalid',
    });
    await expectNothingRecorded();
  });

  it('should return 422 PAYMENT_SIGNATURE_INVALID when signed with another secret', async () => {
    // Act
    const res = await postReturn(signParams(buildVnpParams(order), 'ANOTHER_SECRET'));

    // Assert
    expect(res.statusCode).toBe(422);
    await expectNothingRecorded();
  });

  it('should return 422 PAYMENT_SIGNATURE_INVALID when a vnp_ param is repeated', async () => {
    // Act
    const res = await postReturn({ ...signParams(buildVnpParams(order)), vnp_Extra: ['a', 'b'] });

    // Assert
    expect(res.statusCode).toBe(422);
    await expectNothingRecorded();
  });

  it('should return 422 PAYMENT_SIGNATURE_INVALID when the gateway secret is not configured', async () => {
    // Arrange
    const unconfigured = await buildTestApp(
      { db },
      { ...TEST_VNPAY_CONFIG, VNPAY_HASH_SECRET: undefined },
    );

    // Act
    const res = await postReturn(signParams(buildVnpParams(order)), unconfigured);
    await unconfigured.close();

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().code).toBe('PAYMENT_SIGNATURE_INVALID');
    await expectNothingRecorded();
  });

  it('should return 404 ORDER_NOT_FOUND for a signed reference of an unknown order', async () => {
    // Act
    const res = await postReturn(
      signParams(buildVnpParams({ id: 'ZZZZZZZZZZZZZZZZ', buyer_total: order.buyer_total })),
    );

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('ORDER_NOT_FOUND');
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should return 422 PAYMENT_AMOUNT_MISMATCH for a signed amount that differs', async () => {
    // Act
    const res = await postReturn(
      signParams(buildVnpParams(order, { vnp_Amount: String(order.buyer_total * 100 + 100) })),
    );

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().code).toBe('PAYMENT_AMOUNT_MISMATCH');
    await expectNothingRecorded();
  });

  it.each<[string, VnpParams, string]>([
    ['vnp_TxnRef is too short', { vnp_TxnRef: 'SHORT' }, 'vnp_TxnRef'],
    ['vnp_Amount is not a positive integer', { vnp_Amount: '-1' }, 'vnp_Amount'],
    ['vnp_ResponseCode is not 2 digits', { vnp_ResponseCode: '0' }, 'vnp_ResponseCode'],
    [
      'vnp_TransactionStatus is not 2 digits',
      { vnp_TransactionStatus: 'AB' },
      'vnp_TransactionStatus',
    ],
    ['vnp_TransactionNo is not numeric', { vnp_TransactionNo: 'ABC' }, 'vnp_TransactionNo'],
    ['vnp_SecureHash is not 128 hex', { vnp_SecureHash: 'abc' }, 'vnp_SecureHash'],
    ['vnp_PayDate is not a real date', { vnp_PayDate: '20261399153000' }, 'vnp_PayDate'],
  ])(
    'should return 400 VALIDATION_FAILED before checking the signature when %s',
    async (_case, overrides, field) => {
      // Arrange: chữ ký hợp lệ cho bộ tham số đã sửa — vẫn bị chặn ở schema trước chữ ký
      const params = { ...signParams(buildVnpParams(order, overrides)), ...overrides };

      // Act
      const res = await postReturn(params);

      // Assert
      expect(res.statusCode).toBe(400);
      const body = res.json<ErrorBody>();
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(body.details ?? {})).toEqual([field]);
      await expectNothingRecorded();
    },
  );

  it('should return 400 VALIDATION_FAILED when a required field is missing', async () => {
    // Arrange
    const params = signParams(buildVnpParams(order));
    delete params.vnp_TransactionNo;

    // Act
    const res = await postReturn(params);

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().details).toHaveProperty('vnp_TransactionNo');
  });

  it('should return 500 INTERNAL_ERROR without changes when the database fails', async () => {
    // Arrange
    const unreachable = createUnreachableDb();
    const broken = await buildTestApp({ db: unreachable }, { VNPAY_HASH_SECRET: TEST_HASH_SECRET });

    // Act
    const res = await postReturn(signParams(buildVnpParams(order)), broken);
    await broken.close();
    await unreachable.destroy();

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>().code).toBe('INTERNAL_ERROR');
    await expectNothingRecorded();
  });
});
