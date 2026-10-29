import { sql } from 'kysely';
import { pino } from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EventStatus,
  LedgerAccountType,
  LedgerSide,
  LedgerTxnType,
  OrderStatus,
  PaymentDisposition,
  PaymentSource,
} from '../../src/db/enums.js';
import type { Event, Listing, Order, User } from '../../src/db/types.js';
import { sumReservedQuantity } from '../../src/features/orders/repository.js';
import { PaymentRecorder, RecordResult } from '../../src/features/payments/payment-recorder.js';
import type { VerifiedPayment } from '../../src/features/payments/vnpay.js';
import { AppError } from '../../src/lib/app-error.js';
import {
  buildOrder,
  insertEntries,
  insertEvent,
  insertLedgerTxn,
  insertListing,
  insertOrder,
  insertUser,
  upsertLedgerAccount,
  type OrderInsert,
} from '../support/fixtures.js';
import {
  accountBalance,
  availableBalance,
  countLedgerTransactions,
  countPaymentTransactions,
  ledgerTotals,
  pendingBalance,
} from '../support/ledger.js';
import { buildOverdueOrder, waitForLockWaiters } from '../support/orders.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import { buildTxnNo } from '../support/vnpay.js';

const db = createTestDb();
const log = pino({ level: 'silent' });
const recorder = new PaymentRecorder(db);

const PAY_DATE = new Date('2026-10-29T08:30:00Z');
// 500.000 × 2 → buyerTotal 1.100.000, sellerNet 950.000, platformFee 150.000
const BUYER_TOTAL = 1_100_000;
const SELLER_NET = 950_000;
const PLATFORM_FEE = 150_000;

let seller: User;
let buyer: User;
let event: Event;
let listing: Listing;

beforeEach(async () => {
  await resetDatabase(db);
  seller = await insertUser(db);
  buyer = await insertUser(db);
  event = await insertEvent(db, { name: 'Live show' });
  listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { unit_price: 500_000, quantity_total: 2 },
  );
});

afterAll(async () => {
  await db.destroy();
});

const placeOrder = (overrides: Partial<OrderInsert> = {}) =>
  insertOrder(db, buildOrder(listing, buyer.id, 2, overrides));

const placeOverdueOrder = () => insertOrder(db, buildOverdueOrder(listing, buyer.id, 2));

/** Đơn chờ của người mua khác trên tin bán riêng (không đụng tồn kho của `listing`). */
async function placeUnrelatedOrder(): Promise<Order> {
  const otherListing = await insertListing(db, { event_id: event.id, seller_id: seller.id });
  return insertOrder(db, buildOrder(otherListing, (await insertUser(db)).id, 1));
}

/** Đơn đã rời `PENDING_PAYMENT` theo đúng cạnh trigger cho phép. */
async function placeOrderWithStatus(status: OrderStatus): Promise<Order> {
  const order = await placeOverdueOrder();
  const stamps = {
    [OrderStatus.EXPIRED]: { expired_at: sql<Date>`now()` },
    [OrderStatus.FAILED]: { failed_at: sql<Date>`now()` },
  } as const;
  if (status !== OrderStatus.EXPIRED && status !== OrderStatus.FAILED) {
    throw new Error(`Unsupported fixture status ${status}`);
  }
  return db
    .updateTable('orders')
    .set({ status, ...stamps[status] })
    .where('id', '=', order.id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

const successPayment = (
  order: Order,
  overrides: Partial<VerifiedPayment> = {},
): VerifiedPayment => ({
  source: PaymentSource.IPN,
  orderId: order.id,
  gatewayTxnNo: buildTxnNo(),
  responseCode: '00',
  transactionStatus: '00',
  vnpAmount: order.buyer_total * 100,
  bankCode: 'NCB',
  payDate: PAY_DATE,
  ...overrides,
});

const failedPayment = (order: Order, overrides: Partial<VerifiedPayment> = {}) =>
  successPayment(order, { responseCode: '24', transactionStatus: '02', ...overrides });

const record = (payment: VerifiedPayment) => recorder.record(payment, log);

const storedOrder = (orderId: string) =>
  db.selectFrom('orders').selectAll().where('id', '=', orderId).executeTakeFirstOrThrow();

const paymentRows = (orderId: string) =>
  db
    .selectFrom('payment_transactions')
    .selectAll()
    .where('order_id', '=', orderId)
    .orderBy('created_at')
    .execute();

const ledgerTypes = async () =>
  (await db.selectFrom('ledger_transactions').select('type').orderBy('created_at').execute()).map(
    (row) => row.type,
  );

/** Σ nợ = Σ có toàn sổ và `GATEWAY_CASH` = tổng tiền đã nhận. */
async function expectBalancedLedger(cashReceived: number): Promise<void> {
  expect(await ledgerTotals(db)).toEqual({ debit: cashReceived, credit: cashReceived });
  expect(await accountBalance(db, LedgerAccountType.GATEWAY_CASH)).toBe(cashReceived);
}

/** Đơn khác giữ / đã mua hết 2 vé của tin bán. */
const takeAllTickets = async (status: typeof OrderStatus.PAID | 'HELD') => {
  const other = await insertUser(db);
  return insertOrder(
    db,
    buildOrder(
      listing,
      other.id,
      2,
      status === OrderStatus.PAID ? { status: OrderStatus.PAID, paid_at: sql<Date>`now()` } : {},
    ),
  );
};

describe('PaymentRecorder.record — success', () => {
  it('should mark a pending order PAID and post PAYMENT_CAPTURED into escrow', async () => {
    // Arrange
    const order = await placeOrder();
    const payment = successPayment(order);

    // Act
    const outcome = await record(payment);

    // Assert
    expect(outcome).toEqual({
      result: RecordResult.RECORDED,
      orderId: order.id,
      status: OrderStatus.PAID,
      disposition: PaymentDisposition.CAPTURED,
    });
    const stored = await storedOrder(order.id);
    expect(stored.status).toBe(OrderStatus.PAID);
    expect(stored.paid_at).toBeInstanceOf(Date);
    const [row] = await paymentRows(order.id);
    expect(row).toMatchObject({
      source: PaymentSource.IPN,
      gateway_txn_no: payment.gatewayTxnNo,
      response_code: '00',
      transaction_status: '00',
      is_success: true,
      amount: BUYER_TOTAL,
      bank_code: 'NCB',
      pay_date: PAY_DATE,
      disposition: PaymentDisposition.CAPTURED,
    });
    const ledgerTxn = await db
      .selectFrom('ledger_transactions')
      .selectAll()
      .where('id', '=', row?.ledger_transaction_id ?? '')
      .executeTakeFirstOrThrow();
    expect(ledgerTxn).toMatchObject({
      type: LedgerTxnType.PAYMENT_CAPTURED,
      idempotency_key: `PAYMENT:${payment.gatewayTxnNo}`,
      order_id: order.id,
      event_id: event.id,
      description: `Bán 2 vé · Live show · Đơn ${order.id}`,
    });
    expect(await pendingBalance(db, seller.id)).toBe(SELLER_NET);
    expect(await availableBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, buyer.id)).toBe(0);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBe(PLATFORM_FEE);
    await expectBalancedLedger(BUYER_TOTAL);
  });

  it('should answer DUPLICATE for the same gateway transaction from any source', async () => {
    // Arrange
    const order = await placeOrder();
    const payment = successPayment(order);
    await record(payment);

    // Act
    const again = await record(payment);
    const fromReturn = await record({ ...payment, source: PaymentSource.RETURN_URL });
    const fromQuery = await record({ ...payment, source: PaymentSource.QUERYDR });

    // Assert
    for (const outcome of [again, fromReturn, fromQuery]) {
      expect(outcome).toEqual({
        result: RecordResult.DUPLICATE,
        orderId: order.id,
        status: OrderStatus.PAID,
        disposition: null,
      });
    }
    expect(await countPaymentTransactions(db)).toBe(1);
    expect(await countLedgerTransactions(db)).toBe(1);
    expect(await pendingBalance(db, seller.id)).toBe(SELLER_NET);
    await expectBalancedLedger(BUYER_TOTAL);
  });

  it.each([
    ['EXPIRED', () => placeOrderWithStatus(OrderStatus.EXPIRED)],
    ['FAILED', () => placeOrderWithStatus(OrderStatus.FAILED)],
    ['overdue PENDING_PAYMENT', () => placeOverdueOrder()],
  ])('should capture a late payment on a %s order while tickets remain', async (_case, place) => {
    // Arrange
    const order = await place();

    // Act
    const outcome = await record(successPayment(order));

    // Assert
    expect(outcome).toMatchObject({
      result: RecordResult.RECORDED,
      status: OrderStatus.PAID,
      disposition: PaymentDisposition.CAPTURED,
    });
    expect((await storedOrder(order.id)).status).toBe(OrderStatus.PAID);
    expect(await pendingBalance(db, seller.id)).toBe(SELLER_NET);
    expect(await availableBalance(db, buyer.id)).toBe(0);
    await expectBalancedLedger(BUYER_TOTAL);
  });

  it.each([
    ['an EXPIRED', 'sold to another buyer', OrderStatus.PAID],
    ['an EXPIRED', 'held by another active order', 'HELD'],
    ['an overdue PENDING_PAYMENT', 'sold to another buyer', OrderStatus.PAID],
    ['an overdue PENDING_PAYMENT', 'held by another active order', 'HELD'],
  ] as const)(
    'should require a refund for a late payment on %s order when tickets were %s',
    async (orderKind, _taken, takenAs) => {
      // Arrange
      const order =
        orderKind === 'an EXPIRED'
          ? await placeOrderWithStatus(OrderStatus.EXPIRED)
          : await placeOverdueOrder();
      await takeAllTickets(takenAs);

      // Act
      const outcome = await record(successPayment(order));

      // Assert
      expect(outcome).toMatchObject({
        result: RecordResult.RECORDED,
        status: OrderStatus.REFUND_REQUIRED,
        disposition: PaymentDisposition.REFUND_REQUIRED,
      });
      const stored = await storedOrder(order.id);
      expect(stored.status).toBe(OrderStatus.REFUND_REQUIRED);
      expect(stored.refund_required_at).toBeInstanceOf(Date);
      expect(await ledgerTypes()).toEqual([LedgerTxnType.PAYMENT_REFUND_REQUIRED]);
      expect(await availableBalance(db, buyer.id)).toBe(BUYER_TOTAL);
      expect(await pendingBalance(db, seller.id)).toBe(0);
      await expectBalancedLedger(BUYER_TOTAL);
    },
  );

  it('should require a refund for an on-hold order whose tickets another order already holds', async () => {
    // Arrange: trạng thái mà ghi nhận thấy sau khi chờ khoá tin bán — `now()` của nó còn trước hạn
    // giữ chỗ của đơn, nhưng đơn khác (tạo sau khi hạn đã qua) đã giữ cả 2 vé (spec api § D: tiền
    // đến muộn không đủ vé → REFUND_REQUIRED, không bao giờ bán vượt)
    const order = await placeOrder();
    await takeAllTickets('HELD');

    // Act
    const outcome = await record(successPayment(order));

    // Assert
    expect(outcome.status).toBe(OrderStatus.REFUND_REQUIRED);
    expect(await availableBalance(db, buyer.id)).toBe(BUYER_TOTAL);
    expect(await pendingBalance(db, seller.id)).toBe(0);
  });

  it('should capture a late payment when exactly enough tickets remain', async () => {
    // Arrange: tin 3 vé, đơn khác đã mua 1 → còn đúng 2 = số lượng đơn
    const bigListing = await insertListing(
      db,
      { event_id: event.id, seller_id: seller.id },
      { unit_price: 500_000, quantity_total: 3 },
    );
    const other = await insertUser(db);
    await insertOrder(
      db,
      buildOrder(bigListing, other.id, 1, { status: OrderStatus.PAID, paid_at: sql<Date>`now()` }),
    );
    const order = await insertOrder(db, buildOverdueOrder(bigListing, buyer.id, 2));

    // Act
    const outcome = await record(successPayment(order));

    // Assert
    expect(outcome.status).toBe(OrderStatus.PAID);
  });

  it.each([
    ['an expired order', () => placeOrderWithStatus(OrderStatus.EXPIRED)],
    ['a pending order still on hold', () => placeOrder()],
  ])('should require a refund when the event is completed for %s', async (_case, place) => {
    // Arrange
    const order = await place();
    await db
      .updateTable('events')
      .set({ status: EventStatus.COMPLETED, completed_at: sql<Date>`now()` })
      .where('id', '=', event.id)
      .execute();

    // Act
    const outcome = await record(successPayment(order));

    // Assert
    expect(outcome.status).toBe(OrderStatus.REFUND_REQUIRED);
    expect(await availableBalance(db, buyer.id)).toBe(BUYER_TOTAL);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBe(0);
    await expectBalancedLedger(BUYER_TOTAL);
  });

  it.each([
    ['PAID', () => placeOrder(), OrderStatus.PAID],
    [
      'REFUND_REQUIRED',
      async () => {
        const order = await placeOrderWithStatus(OrderStatus.EXPIRED);
        await takeAllTickets(OrderStatus.PAID);
        return order;
      },
      OrderStatus.REFUND_REQUIRED,
    ],
  ] as const)(
    'should keep a %s order and refund an extra payment with another transaction number',
    async (_case, place, settledStatus) => {
      // Arrange
      const order = await place();
      await record(successPayment(order));
      const sellerPendingBefore = await pendingBalance(db, seller.id);
      const buyerAvailableBefore = await availableBalance(db, buyer.id);

      // Act
      const outcome = await record(successPayment(order));

      // Assert
      expect(outcome).toEqual({
        result: RecordResult.RECORDED,
        orderId: order.id,
        status: settledStatus,
        disposition: PaymentDisposition.REFUND_REQUIRED,
      });
      expect((await storedOrder(order.id)).status).toBe(settledStatus);
      expect((await paymentRows(order.id)).map((row) => row.disposition)).toEqual([
        settledStatus === OrderStatus.PAID
          ? PaymentDisposition.CAPTURED
          : PaymentDisposition.REFUND_REQUIRED,
        PaymentDisposition.REFUND_REQUIRED,
      ]);
      expect(await pendingBalance(db, seller.id)).toBe(sellerPendingBefore);
      expect(await availableBalance(db, buyer.id)).toBe(buyerAvailableBefore + BUYER_TOTAL);
      await expectBalancedLedger(2 * BUYER_TOTAL);
    },
  );
});

describe('PaymentRecorder.record — failure', () => {
  it('should mark a pending order FAILED, release its tickets and not touch the ledger', async () => {
    // Arrange
    const order = await placeOrder();

    // Act
    const outcome = await record(failedPayment(order));

    // Assert
    expect(outcome).toEqual({
      result: RecordResult.RECORDED,
      orderId: order.id,
      status: OrderStatus.FAILED,
      disposition: PaymentDisposition.FAILED,
    });
    const stored = await storedOrder(order.id);
    expect(stored.status).toBe(OrderStatus.FAILED);
    expect(stored.failed_at).toBeInstanceOf(Date);
    expect(await paymentRows(order.id)).toEqual([
      expect.objectContaining({
        is_success: false,
        disposition: PaymentDisposition.FAILED,
        ledger_transaction_id: null,
      }),
    ]);
    expect(await countLedgerTransactions(db)).toBe(0);
    expect(await sumReservedQuantity(db, listing.id)).toBe(0);
  });

  it.each([
    ['response code 00 with transaction status 02', '00', '02'],
    ['response code 24 with transaction status 00', '24', '00'],
  ])('should treat %s as a failure', async (_case, responseCode, transactionStatus) => {
    // Arrange
    const order = await placeOrder();

    // Act
    const outcome = await record(successPayment(order, { responseCode, transactionStatus }));

    // Assert
    expect(outcome.status).toBe(OrderStatus.FAILED);
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it.each([
    [
      'PAID',
      async () => {
        const order = await placeOrder();
        await record(successPayment(order));
        return order;
      },
    ],
    ['EXPIRED', () => placeOrderWithStatus(OrderStatus.EXPIRED)],
    ['FAILED', () => placeOrderWithStatus(OrderStatus.FAILED)],
  ])(
    'should answer DUPLICATE for a failure on a %s order without changes',
    async (_case, place) => {
      // Arrange
      const order = await place();
      const before = await storedOrder(order.id);
      const paymentsBefore = await countPaymentTransactions(db);

      // Act
      const outcome = await record(failedPayment(order));

      // Assert
      expect(outcome).toMatchObject({ result: RecordResult.DUPLICATE, status: before.status });
      expect((await storedOrder(order.id)).status).toBe(before.status);
      expect(await countPaymentTransactions(db)).toBe(paymentsBefore);
    },
  );

  it('should accept the same failed transaction number on different orders', async () => {
    // Arrange: VNPay có thể trả `vnp_TransactionNo` = 0 cho nhiều giao dịch thất bại
    const first = await placeOrder();
    const second = await placeUnrelatedOrder();

    // Act
    const outcomes = [
      await record(failedPayment(first, { gatewayTxnNo: '0' })),
      await record(failedPayment(second, { gatewayTxnNo: '0' })),
    ];

    // Assert
    expect(outcomes.map((outcome) => outcome.result)).toEqual([
      RecordResult.RECORDED,
      RecordResult.RECORDED,
    ]);
  });
});

describe('PaymentRecorder.record — rejection', () => {
  it.each([
    ['one VND short', -100],
    ['one gateway unit over', 1],
  ])('should reject an amount %s without any change', async (_case, delta) => {
    // Arrange
    const order = await placeOrder();

    // Act
    const error = await record(
      successPayment(order, { vnpAmount: order.buyer_total * 100 + delta }),
    ).catch((err: unknown) => err);

    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH', httpStatus: 422 });
    expect((await storedOrder(order.id)).status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await countPaymentTransactions(db)).toBe(0);
    expect(await countLedgerTransactions(db)).toBe(0);
  });

  it('should reject a failure with a wrong amount too', async () => {
    // Arrange
    const order = await placeOrder();

    // Act
    const error = await record(failedPayment(order, { vnpAmount: 100 })).catch(
      (err: unknown) => err,
    );

    // Assert
    expect(error).toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect((await storedOrder(order.id)).status).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it('should reject an unknown order', async () => {
    // Arrange
    const order = await placeOrder();

    // Act
    const error = await record(successPayment(order, { orderId: 'ZZZZZZZZZZZZZZZZ' })).catch(
      (err: unknown) => err,
    );

    // Assert
    expect(error).toMatchObject({ code: 'ORDER_NOT_FOUND', httpStatus: 404 });
    expect(await countLedgerTransactions(db)).toBe(0);
  });
});

describe('PaymentRecorder.record — dedup guards', () => {
  it('should retry and answer DUPLICATE when another order commits the same transaction number concurrently', async () => {
    // Arrange: transaction chặn đã ghi giao dịch thành công `txn` cho đơn khác nhưng chưa commit, nên
    // lớp 1 của ghi nhận không thấy; INSERT `PAYMENT:<txn>` đứng chờ ở UNIQUE của sổ cái (lớp 3)
    const order = await placeOrder();
    const otherOrder = await placeUnrelatedOrder();
    const txnNo = buildTxnNo();
    const cash = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });
    const refund = await upsertLedgerAccount(db, {
      type: LedgerAccountType.BUYER_REFUND_PAYABLE,
      ownerUserId: otherOrder.buyer_id,
    });
    const blocker = await db.startTransaction().execute();
    let pending: Promise<unknown> | undefined;
    try {
      const ledgerTxn = await insertLedgerTxn(
        blocker,
        {
          type: LedgerTxnType.PAYMENT_REFUND_REQUIRED,
          eventId: event.id,
          orderId: otherOrder.id,
          idempotencyKey: `PAYMENT:${txnNo}`,
        },
        [],
      );
      await insertEntries(blocker, ledgerTxn.id, [
        { accountId: cash.id, direction: LedgerSide.DEBIT, amount: otherOrder.buyer_total },
        { accountId: refund.id, direction: LedgerSide.CREDIT, amount: otherOrder.buyer_total },
      ]);
      await blocker
        .insertInto('payment_transactions')
        .values({
          order_id: otherOrder.id,
          source: PaymentSource.QUERYDR,
          gateway_txn_no: txnNo,
          response_code: '00',
          transaction_status: '00',
          is_success: true,
          amount: otherOrder.buyer_total,
          disposition: PaymentDisposition.REFUND_REQUIRED,
          ledger_transaction_id: ledgerTxn.id,
        })
        .execute();

      // Act
      pending = record(successPayment(order, { gatewayTxnNo: txnNo }));
      await waitForLockWaiters(db, 1);
    } finally {
      await blocker.commit().execute();
    }
    const outcome = await pending;

    // Assert
    expect(outcome).toMatchObject({
      result: RecordResult.DUPLICATE,
      status: OrderStatus.PENDING_PAYMENT,
    });
    expect((await storedOrder(order.id)).status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await countLedgerTransactions(db)).toBe(1);
  });
});
