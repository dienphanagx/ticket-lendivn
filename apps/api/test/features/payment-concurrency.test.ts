import { randomUUID } from 'node:crypto';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { sql, type ControlledTransaction } from 'kysely';
import { pino } from 'pino';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStatus, PaymentSource } from '../../src/db/enums.js';
import type { DB, Listing, Order, User } from '../../src/db/types.js';
import { sumReservedQuantity } from '../../src/features/orders/repository.js';
import { PaymentRecorder, RecordResult } from '../../src/features/payments/payment-recorder.js';
import { buildTestApp } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import {
  availableBalance,
  countLedgerTransactions,
  countPaymentTransactions,
  ledgerTotals,
  pendingBalance,
} from '../support/ledger.js';
import { buildOverdueOrder, waitForLockWaiters } from '../support/orders.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import { buildVnpParams, ipnUrl, signParams, TEST_HASH_SECRET } from '../support/vnpay.js';

// Pool 4 kết nối: 1 transaction chặn + 2 luồng ghi nhận + 1 truy vấn theo dõi khoá
const db = createTestDb();
const log = pino({ level: 'silent' });

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

/**
 * Giữ khoá đơn bằng 1 transaction chặn: luồng thứ nhất lấy khoá tin bán rồi đứng chờ ở `orders`
 * FOR UPDATE, luồng thứ hai đứng chờ ở `listings` FOR UPDATE. Chờ đúng 2 backend đứng chờ khoá (điểm
 * đồng bộ tất định, không sleep), nhả khoá trước rồi mới chờ kết quả để không treo khi điểm đồng bộ lỗi.
 */
async function runWhileOrderLocked<T>(send: () => Promise<T>[]): Promise<T[]> {
  const blocker = await db.startTransaction().execute();
  let pending: Promise<T>[] = [];
  let results: PromiseSettledResult<T>[];
  try {
    await blocker
      .selectFrom('orders')
      .select('id')
      .where('id', '=', order.id)
      .forUpdate()
      .execute();
    pending = send();
    await waitForLockWaiters(db, 2);
  } finally {
    await blocker.rollback().execute();
    results = await Promise.allSettled(pending);
  }
  return results.map((result) => {
    if (result.status === 'rejected') {
      throw result.reason;
    }
    return result.value;
  });
}

const rspCodeOf = async (url: string): Promise<string> =>
  (await app.inject({ method: 'GET', url })).json<{ RspCode: string }>().RspCode;

async function expectCapturedOnce(): Promise<void> {
  expect(await countLedgerTransactions(db)).toBe(1);
  expect(await countPaymentTransactions(db)).toBe(1);
  expect(await pendingBalance(db, seller.id)).toBe(order.seller_net);
  expect(await ledgerTotals(db)).toEqual({ debit: order.buyer_total, credit: order.buyer_total });
  const stored = await db
    .selectFrom('orders')
    .select('status')
    .where('id', '=', order.id)
    .executeTakeFirstOrThrow();
  expect(stored.status).toBe(OrderStatus.PAID);
}

describe('payment recording concurrency', () => {
  it('should post exactly once when the same IPN arrives twice at the same time', async () => {
    // Arrange
    const url = ipnUrl(signParams(buildVnpParams(order)));

    // Act
    const codes = await runWhileOrderLocked(() => [rspCodeOf(url), rspCodeOf(url)]);

    // Assert
    expect(codes.sort()).toEqual(['00', '02']);
    await expectCapturedOnce();
  });

  it('should post exactly once when IPN and return URL record the same payment at the same time', async () => {
    // Arrange
    const params = buildVnpParams(order);
    const recorder = new PaymentRecorder(db);

    // Act
    const [ipnCode, returnOutcome] = await runWhileOrderLocked<string>(() => [
      rspCodeOf(ipnUrl(signParams(params))),
      recorder
        .record(
          {
            source: PaymentSource.RETURN_URL,
            orderId: order.id,
            gatewayTxnNo: params.vnp_TransactionNo ?? '',
            responseCode: '00',
            transactionStatus: '00',
            vnpAmount: order.buyer_total * 100,
            bankCode: 'NCB',
            payDate: null,
          },
          log,
        )
        .then((outcome) => outcome.result),
    ]);

    // Assert: bên nào tới trước ghi nhận, bên còn lại nhận trùng
    expect([ipnCode, returnOutcome]).toEqual(
      ipnCode === '00' ? ['00', RecordResult.DUPLICATE] : ['02', RecordResult.RECORDED],
    );
    await expectCapturedOnce();
  });

  it('should capture one and refund the other when two different payments race on one order', async () => {
    // Arrange: người mua trả 2 lần ở 2 tab → 2 mã giao dịch cổng khác nhau
    const first = ipnUrl(signParams(buildVnpParams(order)));
    const second = ipnUrl(signParams(buildVnpParams(order)));

    // Act
    const codes = await runWhileOrderLocked(() => [rspCodeOf(first), rspCodeOf(second)]);

    // Assert
    expect(codes).toEqual(['00', '00']);
    expect(await countLedgerTransactions(db)).toBe(2);
    expect(await pendingBalance(db, seller.id)).toBe(order.seller_net);
    expect(await availableBalance(db, buyer.id)).toBe(order.buyer_total);
    expect(await ledgerTotals(db)).toEqual({
      debit: 2 * order.buyer_total,
      credit: 2 * order.buyer_total,
    });
  });
});

type Blocker = ControlledTransaction<DB>;

/** Hạn giữ chỗ ngắn của đơn sẽ hết hạn trong lúc ghi nhận chờ khoá tin bán. */
const DOOMED_HOLD_MS = 1_500;
const EXPIRY_WAIT_TIMEOUT_MS = 10_000;

/** Backend đang chờ khoá đã BEGIN transaction trước mốc `instant`. */
async function waiterBeganBefore(instant: Date): Promise<boolean> {
  const { rows } = await sql<{ began: Date | null }>`
    SELECT min(xact_start) AS began FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(db);
  const began = rows[0]?.began;
  return began != null && began < instant;
}

/**
 * Chờ tới khi đơn hết hạn theo giờ DB (điều kiện thời gian thật, không phải đồng bộ khoá — điểm
 * đồng bộ khoá vẫn là `waitForLockWaiters`). Hỏi lại DB liên tục, không sleep.
 */
async function waitUntilExpired(orderId: string): Promise<void> {
  const deadline = Date.now() + EXPIRY_WAIT_TIMEOUT_MS;
  for (;;) {
    const { rows } = await sql<{ expired: boolean }>`
      SELECT hold_expires_at <= statement_timestamp() AS expired FROM orders
      WHERE id = ${orderId}`.execute(db);
    if (rows[0]?.expired === true) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for order ${orderId} to expire`);
    }
  }
}

/**
 * Transaction chặn chỉ giữ khoá hàng `listings` FOR UPDATE của tin bán (không giữ khoá nào khác),
 * nên mọi luồng đếm được ở điểm đồng bộ đều đang chờ khoá tin bán (trực tiếp hoặc xếp hàng sau
 * luồng chờ trước). Luồng nào không lấy khoá tin bán sẽ chạy xong ngay và điểm đồng bộ hết giờ → đỏ.
 * `whileLocked` chạy trên transaction chặn sau điểm đồng bộ; `commit` quyết định commit hay rollback.
 */
async function runWhileListingLocked<T>(
  listingId: string,
  send: () => Promise<T>[],
  waiters: number,
  {
    whileLocked,
    commit = false,
  }: { whileLocked?: (blocker: Blocker) => Promise<void>; commit?: boolean } = {},
): Promise<T[]> {
  const blocker = await db.startTransaction().execute();
  let pending: Promise<T>[] = [];
  let results: PromiseSettledResult<T>[];
  let committed = false;
  try {
    await blocker
      .selectFrom('listings')
      .select('id')
      .where('id', '=', listingId)
      .forUpdate()
      .execute();
    pending = send();
    await waitForLockWaiters(db, waiters);
    await whileLocked?.(blocker);
    if (commit) {
      await blocker.commit().execute();
      committed = true;
    }
  } finally {
    if (!committed) {
      await blocker.rollback().execute();
    }
    results = await Promise.allSettled(pending);
  }
  return results.map((result) => {
    if (result.status === 'rejected') {
      throw result.reason;
    }
    return result.value;
  });
}

const postOrder = (buyerId: string, listingId: string, quantity: number) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: { 'X-User-Id': buyerId, 'Idempotency-Key': randomUUID() },
    payload: { listingId, quantity },
  });

const statusOf = async (orderId: string) =>
  (
    await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirstOrThrow()
  ).status;

describe('late payment vs new order on the same listing', () => {
  it('should let exactly one of a late payment and a new order take the last tickets', async () => {
    // Arrange: tin riêng 2 vé, đơn EXPIRED 2 vé chưa trả tiền; người mua khác đặt 2 vé cùng lúc
    const lateListing = await insertListing(
      db,
      { event_id: listing.event_id, seller_id: seller.id },
      { unit_price: 500_000, quantity_total: 2 },
    );
    const late = await insertOrder(
      db,
      buildOverdueOrder(lateListing, buyer.id, 2, {
        status: OrderStatus.EXPIRED,
        expired_at: sql<Date>`now()`,
      }),
    );
    const rival = await insertUser(db);

    // Act: cả 2 đứng chờ sau khoá tin bán của transaction chặn
    const ipnRequest = () => rspCodeOf(ipnUrl(signParams(buildVnpParams(late))));
    const orderRequest = () => postOrder(rival.id, lateListing.id, 2);
    let ipnCode: Promise<string> | undefined;
    let created: Promise<LightMyRequestResponse> | undefined;
    await runWhileListingLocked<unknown>(
      lateListing.id,
      () => {
        ipnCode = ipnRequest();
        created = orderRequest();
        return [ipnCode, created];
      },
      2,
    );

    // Assert: tiền luôn được nhận (00); đúng 1 bên giữ vé
    expect(await ipnCode).toBe('00');
    const res = await created;
    if (res === undefined) {
      throw new Error('order request was not sent');
    }
    const lateStatus = await statusOf(late.id);
    if (res.statusCode === 201) {
      expect(lateStatus).toBe(OrderStatus.REFUND_REQUIRED);
      expect(await availableBalance(db, buyer.id)).toBe(late.buyer_total);
    } else {
      expect(res.statusCode).toBe(409);
      expect(res.json<{ code: string }>().code).toBe('INSUFFICIENT_QUANTITY');
      expect(lateStatus).toBe(OrderStatus.PAID);
    }
    expect(await sumReservedQuantity(db, lateListing.id)).toBeLessThanOrEqual(2);
  });

  it('should not oversell when an on-hold payment waits for the listing while its hold expires and another order takes the tickets', async () => {
    // Arrange: ghi nhận của `order` BEGIN khi đơn còn hạn giữ chỗ (`now()` của nó < hold_expires_at)
    // rồi đứng chờ khoá tin bán. Trong lúc đó transaction chặn đóng vai đơn mới được tạo sau khi hạn
    // đã qua (tồn kho lúc đó thấy `order` quá hạn → còn 2 vé): chèn đơn chờ 2 vé rồi commit.
    const rival = await insertUser(db);

    // Act
    const [ipnCode] = await runWhileListingLocked(
      listing.id,
      () => [rspCodeOf(ipnUrl(signParams(buildVnpParams(order))))],
      1,
      {
        commit: true,
        whileLocked: async (blocker) => {
          await blocker
            .insertInto('orders')
            .values(buildOrder(listing, rival.id, 2))
            .execute();
        },
      },
    );

    // Assert: không có lối tắt "còn hạn → PAID"; tiền vào khoản cần hoàn, tin không vượt 2 vé
    expect(ipnCode).toBe('00');
    expect(await statusOf(order.id)).toBe(OrderStatus.REFUND_REQUIRED);
    expect(await sumReservedQuantity(db, listing.id)).toBe(2);
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, buyer.id)).toBe(order.buyer_total);
  });

  it('should capture an on-hold payment when an order that expired during the lock wait was replaced by a new one', async () => {
    // Arrange: tin riêng 4 vé; O 2 vé còn hạn; D 2 vé hết hạn sau DOOMED_HOLD_MS
    // (created_at lùi tương ứng để thoả CHECK hold window)
    const roomy = await insertListing(
      db,
      { event_id: listing.event_id, seller_id: seller.id },
      { unit_price: 500_000, quantity_total: 4 },
    );
    const onHold = await insertOrder(db, buildOrder(roomy, buyer.id, 2));
    const doomed = await insertOrder(
      db,
      buildOrder(roomy, (await insertUser(db)).id, 2, {
        created_at: sql<Date>`now() - interval '15 minutes' + make_interval(secs => ${DOOMED_HOLD_MS / 1000})`,
        hold_expires_at: sql<Date>`now() + make_interval(secs => ${DOOMED_HOLD_MS / 1000})`,
      }),
    );
    const rival = await insertUser(db);

    // Act: ghi nhận của O BEGIN rồi đứng chờ khoá tin bán; D hết hạn thật trong lúc chờ; transaction
    // chặn đóng vai đơn E (tạo sau khi D hết hạn nên thấy còn 2 vé) rồi commit
    const [ipnCode] = await runWhileListingLocked(
      roomy.id,
      () => [rspCodeOf(ipnUrl(signParams(buildVnpParams(onHold))))],
      1,
      {
        commit: true,
        whileLocked: async (blocker) => {
          // Tiền điều kiện: ghi nhận BEGIN trước khi D hết hạn (nếu không, test không chạm nhánh này)
          expect(await waiterBeganBefore(doomed.hold_expires_at)).toBe(true);
          await waitUntilExpired(doomed.id);
          await blocker
            .insertInto('orders')
            .values(buildOrder(roomy, rival.id, 2))
            .execute();
        },
      },
    );

    // Assert: vé đang giữ thật = O 2 + E 2 = 4 ≤ 4 → O được PAID, không bị đẩy sang hoàn tiền
    expect(ipnCode).toBe('00');
    expect(await statusOf(onHold.id)).toBe(OrderStatus.PAID);
    expect(await availableBalance(db, buyer.id)).toBe(0);
    expect(await sumReservedQuantity(db, roomy.id)).toBe(4);
  });
});
