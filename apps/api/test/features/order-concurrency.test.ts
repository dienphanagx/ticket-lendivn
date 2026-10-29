import { randomUUID } from 'node:crypto';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStatus } from '../../src/db/enums.js';
import type { Listing, User } from '../../src/db/types.js';
import { expireOrders } from '../../src/features/orders/service.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { buildOverdueOrder, waitForLockWaiters } from '../support/orders.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

// Pool 4 kết nối: 1 transaction chặn + 2 request + 1 truy vấn theo dõi khoá
const db = createTestDb();

let app: FastifyInstance;
let seller: User;
let listing: Listing;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db });
  seller = await insertUser(db);
  const event = await insertEvent(db);
  listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { quantity_total: 2 },
  );
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

interface OrderRequest {
  listingId?: string;
  key?: string;
}

const postOrder = (buyerId: string, quantity: number, request: OrderRequest = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: { 'X-User-Id': buyerId, 'Idempotency-Key': request.key ?? randomUUID() },
    payload: { listingId: request.listingId ?? listing.id, quantity },
  });

const orderStatus = async (orderId: string) =>
  (
    await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirstOrThrow()
  ).status;

const countOrders = async () =>
  (
    await db
      .selectFrom('orders')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
  ).count;

/**
 * Khoá hàng người mua bằng 1 transaction chặn: INSERT đơn kiểm FK `buyer_id` (FOR KEY SHARE) nên
 * request dừng ngay trước INSERT, sau khi đã đếm vé. Chờ đúng `waiters` backend đứng chờ khoá (điểm
 * đồng bộ tất định), nhả khoá trước rồi mới chờ request để không treo khi điểm đồng bộ lỗi.
 */
async function runWhileBuyersLocked(
  buyerIds: readonly string[],
  sendRequests: () => Promise<LightMyRequestResponse>[],
  waiters: number,
): Promise<LightMyRequestResponse[]> {
  const blocker = await db.startTransaction().execute();
  let requests: Promise<LightMyRequestResponse>[] = [];
  let results: PromiseSettledResult<LightMyRequestResponse>[];
  try {
    await blocker
      .selectFrom('users')
      .select('id')
      .where('id', 'in', buyerIds)
      .forUpdate()
      .execute();
    requests = sendRequests();
    await waitForLockWaiters(db, waiters);
  } finally {
    await blocker.rollback().execute();
    results = await Promise.allSettled(requests);
  }
  return results.map((result) => {
    if (result.status === 'rejected') {
      throw result.reason;
    }
    return result.value;
  });
}

const sortedStatuses = (responses: readonly LightMyRequestResponse[]) =>
  responses.map((res) => res.statusCode).sort();

describe('POST /api/v1/orders concurrency', () => {
  it('should let exactly one of two concurrent requests take the last tickets', async () => {
    // Arrange: có khoá tin bán thì B đứng chờ A ở `listings` FOR UPDATE; thiếu khoá thì cả 2 đã đếm
    // 0 vé giữ chỗ và cùng chờ ở INSERT → bán trùng. Cả 2 nhánh đều ra 2 waiter.
    const [buyerA, buyerB] = [await insertUser(db), await insertUser(db)];

    // Act
    const responses = await runWhileBuyersLocked(
      [buyerA.id, buyerB.id],
      () => [postOrder(buyerA.id, 2), postOrder(buyerB.id, 2)],
      2,
    );

    // Assert
    expect(sortedStatuses(responses)).toEqual([201, 409]);
    const rejected = responses.find((res) => res.statusCode === 409);
    expect(rejected?.json<ErrorBody>()).toMatchObject({
      code: 'INSUFFICIENT_QUANTITY',
      details: { available: 0 },
    });
    expect(await countOrders()).toBe(1);
  });

  it('should answer 409 IDEMPOTENCY_KEY_REUSED when the same key races on two listings', async () => {
    // Arrange: 2 tin bán khác nhau nên không chung khoá tin bán; cả 2 chờ ở INSERT, bên sau vấp
    // UNIQUE (buyer_id, idempotency_key) → 23505 → đọc lại đơn đã commit
    const buyer = await insertUser(db);
    const otherListing = await insertListing(
      db,
      { event_id: listing.event_id, seller_id: seller.id },
      { quantity_total: 2 },
    );
    const key = randomUUID();

    // Act
    const responses = await runWhileBuyersLocked(
      [buyer.id],
      () => [
        postOrder(buyer.id, 1, { key }),
        postOrder(buyer.id, 1, { key, listingId: otherListing.id }),
      ],
      2,
    );

    // Assert
    expect(sortedStatuses(responses)).toEqual([201, 409]);
    const rejected = responses.find((res) => res.statusCode === 409);
    expect(rejected?.json<ErrorBody>().code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await countOrders()).toBe(1);
  });

  it('should replay the committed order when the same key races on the same listing', async () => {
    // Arrange: A giữ khoá tin bán và chờ ở INSERT; B chờ A ở `listings` FOR UPDATE, rồi tra lại
    // khoá dưới khoá tin bán và thấy đơn của A (tin chỉ còn đúng 2 vé)
    const buyer = await insertUser(db);
    const key = randomUUID();

    // Act
    const responses = await runWhileBuyersLocked(
      [buyer.id],
      () => [postOrder(buyer.id, 2, { key }), postOrder(buyer.id, 2, { key })],
      2,
    );

    // Assert
    expect(sortedStatuses(responses)).toEqual([200, 201]);
    const [first, second] = responses.map((res) => res.json<{ data: { id: string } }>().data.id);
    expect(first).toBe(second);
    expect(await countOrders()).toBe(1);
  });
});

describe('expireOrders', () => {
  it('should expire only overdue pending orders and set expired_at', async () => {
    // Arrange
    const buyer = await insertUser(db);
    const overdue = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));
    const active = await insertOrder(db, buildOrder(listing, buyer.id, 1));

    // Act
    const expired = await expireOrders(db);

    // Assert
    expect(expired).toBe(1);
    const stored = await db
      .selectFrom('orders')
      .select(['id', 'status', 'expired_at'])
      .where('id', 'in', [overdue.id, active.id])
      .execute();
    expect(stored).toEqual(
      expect.arrayContaining([
        { id: overdue.id, status: OrderStatus.EXPIRED, expired_at: expect.any(Date) as Date },
        { id: active.id, status: OrderStatus.PENDING_PAYMENT, expired_at: null },
      ]),
    );
    expect(await expireOrders(db)).toBe(0);
  });

  it('should skip an overdue order locked by another transaction', async () => {
    // Arrange
    const buyer = await insertUser(db);
    const locked = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));
    const free = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));
    const holder = await db.startTransaction().execute();
    let expired: number;
    try {
      await holder
        .selectFrom('orders')
        .select('id')
        .where('id', '=', locked.id)
        .forUpdate()
        .execute();

      // Act
      expired = await expireOrders(db);
    } finally {
      await holder.rollback().execute();
    }

    // Assert
    expect(expired).toBe(1);
    expect(await orderStatus(free.id)).toBe(OrderStatus.EXPIRED);
    expect(await orderStatus(locked.id)).toBe(OrderStatus.PENDING_PAYMENT);
  });

  it('should keep expiring in batches of 500 until no overdue order is left', async () => {
    // Arrange
    const bigListing = await insertListing(
      db,
      { event_id: listing.event_id, seller_id: seller.id },
      { quantity_total: 1000 },
    );
    const buyer = await insertUser(db);
    await db
      .insertInto('orders')
      .values(Array.from({ length: 501 }, () => buildOverdueOrder(bigListing, buyer.id, 1)))
      .execute();

    // Act
    const expired = await expireOrders(db);

    // Assert
    expect(expired).toBe(501);
  });
});
