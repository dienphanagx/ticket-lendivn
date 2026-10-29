import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { ControlledTransaction } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LedgerAccountType, LedgerTxnType, OrderStatus } from '../../src/db/enums.js';
import type { DB, Event, Listing, User } from '../../src/db/types.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  completeEventRequest,
  payByIpn,
  placeOrder,
  placePaidOrder,
  type CompletionBody,
} from '../support/checkout.js';
import { insertEvent, insertListing, insertOrder, insertUser } from '../support/fixtures.js';
import {
  accountBalance,
  availableBalance,
  ledgerTotals,
  pendingBalance,
} from '../support/ledger.js';
import { buildOverdueOrder, waitForLockWaiters } from '../support/orders.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import { TEST_HASH_SECRET } from '../support/vnpay.js';

// Pool 4 kết nối: 1 transaction chặn + 2 luồng đồng thời + 1 truy vấn theo dõi khoá. Điểm đồng bộ là
// số backend đang chờ khoá (`waitForLockWaiters`), không sleep; transaction chặn luôn nhả khoá trước
// khi chờ kết quả để test không treo khi điểm đồng bộ lỗi.
const db = createTestDb();

let app: FastifyInstance;
let seller: User;
let buyer: User;
let event: Event;
let listing: Listing;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db }, { VNPAY_HASH_SECRET: TEST_HASH_SECRET });
  seller = await insertUser(db);
  buyer = await insertUser(db);
  event = await insertEvent(db);
  listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { unit_price: 500_000, quantity_total: 10 },
  );
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

type Blocker = ControlledTransaction<DB>;

/**
 * `lock` giữ khoá trong transaction chặn; mỗi bước của `steps` gửi 1 request rồi chờ thêm 1 backend
 * đứng chờ khoá, nên request sau chỉ được gửi khi request trước đã tới đúng chỗ chờ.
 */
async function runInOrder<T>(
  lock: (blocker: Blocker) => Promise<unknown>,
  steps: (() => Promise<T>)[],
): Promise<T[]> {
  const blocker = await db.startTransaction().execute();
  const pending: Promise<T>[] = [];
  let results: PromiseSettledResult<T>[];
  try {
    await lock(blocker);
    for (const [index, step] of steps.entries()) {
      pending.push(step());
      await waitForLockWaiters(db, index + 1);
    }
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

const lockOrder = (orderId: string) => (blocker: Blocker) =>
  blocker.selectFrom('orders').select('id').where('id', '=', orderId).forUpdate().execute();

const statusOf = async (orderId: string) =>
  (
    await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirstOrThrow()
  ).status;

const countReleases = async (): Promise<number> =>
  (
    await db
      .selectFrom('ledger_transactions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('type', '=', LedgerTxnType.EVENT_RELEASE)
      .executeTakeFirstOrThrow()
  ).count;

async function expectBalancedCash(cash: number): Promise<void> {
  const totals = await ledgerTotals(db);
  expect(totals.debit).toBe(totals.credit);
  expect(await accountBalance(db, LedgerAccountType.GATEWAY_CASH)).toBe(cash);
}

const completionOf = (res: LightMyRequestResponse) => res.json<CompletionBody>().data;

describe('event completion vs payment recording on the same event', () => {
  it('should release a payment that took the event lock first', async () => {
    // Arrange: ghi nhận giữ `events` FOR SHARE + khoá tin bán rồi đứng chờ khoá đơn của transaction
    // chặn; kết thúc sự kiện tới sau, đứng chờ `events` FOR UPDATE
    const order = await placeOrder(app, db, buyer.id, listing.id, 2);

    // Act
    const [ipn, completion] = await runInOrder<unknown>(lockOrder(order.id), [
      () => payByIpn(app, order),
      () => completeEventRequest(app, event.id),
    ]);

    // Assert: thanh toán commit trước → tiền vào ký quỹ rồi được giải phóng
    expect(ipn).toBe('00');
    const res = completion as LightMyRequestResponse;
    expect(res.statusCode).toBe(200);
    expect(completionOf(res)).toMatchObject({
      expiredOrderCount: 0,
      releasedTotal: order.buyer_total,
      platformFeeAmount: order.platform_fee,
    });
    expect(await statusOf(order.id)).toBe(OrderStatus.PAID);
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, seller.id)).toBe(order.seller_net);
    expect(await availableBalance(db, buyer.id)).toBe(0);
    expect(await accountBalance(db, LedgerAccountType.PLATFORM_FEE_REVENUE)).toBe(
      order.platform_fee,
    );
    await expectBalancedCash(order.buyer_total);
  });

  it('should send a payment that waited behind completion to REFUND_REQUIRED', async () => {
    // Arrange: 1 đơn đã PAID từ trước (có ký quỹ); kết thúc sự kiện khoá `events` FOR UPDATE, đánh
    // dấu COMPLETED rồi đứng chờ khoá đơn chờ của transaction chặn; ghi nhận tới sau, đứng chờ `events`
    const earlier = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const order = await placeOrder(app, db, buyer.id, listing.id, 2);

    // Act
    const [completion, ipn] = await runInOrder<unknown>(lockOrder(order.id), [
      () => completeEventRequest(app, event.id),
      () => payByIpn(app, order),
    ]);

    // Assert: kết thúc commit trước → đơn EXPIRED, tiền về sau vào khoản phải hoàn, không vào ký quỹ
    const res = completion as LightMyRequestResponse;
    expect(res.statusCode).toBe(200);
    expect(completionOf(res)).toMatchObject({
      expiredOrderCount: 1,
      releasedTotal: earlier.buyer_total,
    });
    expect(ipn).toBe('00');
    expect(await statusOf(order.id)).toBe(OrderStatus.REFUND_REQUIRED);
    expect(await availableBalance(db, buyer.id)).toBe(order.buyer_total);
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, seller.id)).toBe(earlier.seller_net);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBe(0);
    await expectBalancedCash(earlier.buyer_total + order.buyer_total);
  });
});

describe('two completion requests at the same time', () => {
  it('should answer one 200 and one 409 and post exactly one EVENT_RELEASE', async () => {
    // Arrange: transaction chặn đóng vai 1 ghi nhận đang giữ `events` FOR SHARE
    const order = await placePaidOrder(app, db, buyer.id, listing.id, 2);
    const lockEvent = (blocker: Blocker) =>
      blocker.selectFrom('events').select('id').where('id', '=', event.id).forShare().execute();

    // Act
    const responses = await runInOrder(lockEvent, [
      () => completeEventRequest(app, event.id),
      () => completeEventRequest(app, event.id),
    ]);

    // Assert
    const [winner, loser] = [...responses].sort((a, b) => a.statusCode - b.statusCode);
    expect([winner?.statusCode, loser?.statusCode]).toEqual([200, 409]);
    expect(loser?.json<ErrorBody>()).toMatchObject({
      code: 'EVENT_ALREADY_COMPLETED',
      details: { completedAt: winner && completionOf(winner).completedAt },
    });
    expect(await countReleases()).toBe(1);
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, seller.id)).toBe(order.seller_net);
    await expectBalancedCash(order.buyer_total);
  });
});

describe('event completion vs in-place expiry of GET /v1/orders', () => {
  it('should not deadlock when both lock the same overdue orders', async () => {
    // Arrange: 2 đơn quá hạn của sự kiện; transaction chặn giữ đơn id nhỏ hơn. GET /v1/orders (hết hạn
    // tại chỗ) và kết thúc sự kiện cùng khoá các đơn này theo `ORDER BY id` nên không chờ vòng nhau
    const overdue = await Promise.all([
      insertOrder(db, buildOverdueOrder(listing, buyer.id, 1)),
      insertOrder(db, buildOverdueOrder(listing, buyer.id, 1)),
    ]);
    const [low, high] = overdue.map((order) => order.id).sort();
    if (low === undefined || high === undefined) {
      throw new Error('overdue orders were not created');
    }

    // Act
    const [list, completion] = await runInOrder(lockOrder(low), [
      () => app.inject({ method: 'GET', url: '/api/v1/orders' }),
      () => completeEventRequest(app, event.id),
    ]);

    // Assert: không request nào lỗi deadlock (40P01 → 500)
    expect(list?.statusCode).toBe(200);
    expect(completion?.statusCode).toBe(200);
    expect(await statusOf(low)).toBe(OrderStatus.EXPIRED);
    expect(await statusOf(high)).toBe(OrderStatus.EXPIRED);
  });
});
