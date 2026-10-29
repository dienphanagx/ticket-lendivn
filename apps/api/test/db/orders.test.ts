import { sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DbGuardError, EventStatus, OrderStatus } from '../../src/db/enums.js';
import type { Listing, User } from '../../src/db/types.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

const CHECK_VIOLATION = '23514';

interface OrderFixture {
  buyer: User;
  listing: Listing;
}

async function arrangeListing(unitPrice: number): Promise<OrderFixture> {
  const seller = await insertUser(db);
  const buyer = await insertUser(db);
  const event = await insertEvent(db);
  const listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { unit_price: unitPrice },
  );
  return { buyer, listing };
}

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.destroy();
});

describe('orders fee snapshot CHECK', () => {
  it.each([
    // unit_price, quantity, buyer_total, seller_net, platform_fee (specs/database.md § Snapshot tiền trên đơn)
    [500_000, 2, 1_100_000, 950_000, 150_000],
    [333_333, 1, 366_666, 316_667, 49_999],
  ])(
    'should accept %i x %i with total %i / net %i / fee %i',
    async (unitPrice, quantity, total, net, fee) => {
      // Arrange
      const { buyer, listing } = await arrangeListing(unitPrice);

      // Act
      const order = await insertOrder(db, buildOrder(listing, buyer.id, quantity));

      // Assert
      expect(order).toMatchObject({ buyer_total: total, seller_net: net, platform_fee: fee });
      expect(order.seller_net + order.platform_fee).toBe(order.buyer_total);
    },
  );

  it.each([
    [
      'buyer_fee rounded up',
      { buyer_fee: 33_334, buyer_total: 366_667, platform_fee: 50_000 },
      'orders_buyer_fee_ck',
    ],
    [
      'seller_fee rounded up',
      { seller_fee: 16_667, seller_net: 316_666, platform_fee: 50_000 },
      'orders_seller_fee_ck',
    ],
    ['platform_fee off by one', { platform_fee: 50_000 }, 'orders_platform_fee_ck'],
    [
      'subtotal not unit_price x quantity',
      { subtotal: 333_334, buyer_total: 366_667, seller_net: 316_668, platform_fee: 49_999 },
      'orders_subtotal_ck',
    ],
    // Mỗi case chỉ sai đúng 1 CHECK (các cột khác tính nhất quán theo giá trị sai)
  ])('should reject 333.333 x 1 when %s', async (_label, wrongAmounts, constraint) => {
    // Arrange
    const { buyer, listing } = await arrangeListing(333_333);

    // Act
    const result = insertOrder(db, buildOrder(listing, buyer.id, 1, wrongAmounts));

    // Assert
    await expect(result).rejects.toMatchObject({ code: CHECK_VIOLATION, constraint });
  });

  it('should reject an order bought by its own seller', async () => {
    // Arrange
    const { listing } = await arrangeListing(500_000);

    // Act
    const result = insertOrder(db, buildOrder(listing, listing.seller_id, 1));

    // Assert
    await expect(result).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'orders_buyer_not_seller_ck',
    });
  });
});

type TransitionExpectation = 'allow' | 'reject';

/** Cạnh hợp lệ theo specs/database.md § Enums `order_status` (cột Ghi chú); PAID, REFUND_REQUIRED là trạng thái cuối. */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING_PAYMENT]: [
    OrderStatus.PAID,
    OrderStatus.FAILED,
    OrderStatus.EXPIRED,
    OrderStatus.REFUND_REQUIRED,
  ],
  [OrderStatus.PAID]: [],
  [OrderStatus.FAILED]: [OrderStatus.PAID, OrderStatus.REFUND_REQUIRED],
  [OrderStatus.EXPIRED]: [OrderStatus.PAID, OrderStatus.REFUND_REQUIRED],
  [OrderStatus.REFUND_REQUIRED]: [],
};

const ORDER_STATUSES = Object.values(OrderStatus);

/** Đủ 5 × 5 cặp (from ≠ to) = 20 cạnh. */
const TRANSITION_MATRIX = ORDER_STATUSES.flatMap((from) =>
  ORDER_STATUSES.filter((to) => to !== from).map(
    (to): [OrderStatus, OrderStatus, TransitionExpectation] => [
      from,
      to,
      ALLOWED_TRANSITIONS[from].includes(to) ? 'allow' : 'reject',
    ],
  ),
);

describe('order_guard_transition trigger', () => {
  it('should cover every ordered pair of distinct statuses', () => {
    expect(TRANSITION_MATRIX).toHaveLength(ORDER_STATUSES.length * (ORDER_STATUSES.length - 1));
  });

  it.each(TRANSITION_MATRIX)('%s -> %s should %s', async (from, to, expected) => {
    // Arrange: đủ cột *_at để CHECK timestamp không che kết quả của trigger
    const { buyer, listing } = await arrangeListing(500_000);
    const order = await insertOrder(
      db,
      buildOrder(listing, buyer.id, 1, {
        status: from,
        paid_at: sql<Date>`now()`,
        failed_at: sql<Date>`now()`,
        expired_at: sql<Date>`now()`,
        refund_required_at: sql<Date>`now()`,
      }),
    );

    // Act
    const result = db
      .updateTable('orders')
      .set({ status: to })
      .where('id', '=', order.id)
      .execute();

    // Assert
    if (expected === 'reject') {
      await expect(result).rejects.toMatchObject({
        message: DbGuardError.ORDER_INVALID_TRANSITION,
        code: CHECK_VIOLATION,
      });
      return;
    }
    await result;
    const stored = await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', order.id)
      .executeTakeFirstOrThrow();
    expect(stored.status).toBe(to);
  });

  it('should allow PENDING_PAYMENT -> EXPIRED -> PAID for late payment', async () => {
    // Arrange
    const { buyer, listing } = await arrangeListing(500_000);
    const order = await insertOrder(db, buildOrder(listing, buyer.id, 1));

    // Act
    await db
      .updateTable('orders')
      .set({
        status: OrderStatus.EXPIRED,
        expired_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', order.id)
      .execute();
    const paid = await db
      .updateTable('orders')
      .set({ status: OrderStatus.PAID, paid_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
      .where('id', '=', order.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Assert
    expect(paid.status).toBe(OrderStatus.PAID);
    expect(paid.expired_at).not.toBeNull();
  });

  it('should reject changing a snapshot column', async () => {
    // Arrange
    const { buyer, listing } = await arrangeListing(500_000);
    const order = await insertOrder(db, buildOrder(listing, buyer.id, 1));

    // Act
    const result =
      sql`UPDATE orders SET idempotency_key = 'other-key' WHERE id = ${order.id}`.execute(db);

    // Assert
    await expect(result).rejects.toMatchObject({ message: DbGuardError.ORDER_SNAPSHOT_IMMUTABLE });
  });

  it('should reject replacing a stored payment URL', async () => {
    // Arrange
    const { buyer, listing } = await arrangeListing(500_000);
    const order = await insertOrder(db, buildOrder(listing, buyer.id, 1));
    await db
      .updateTable('orders')
      .set({
        payment_url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?first',
        vnp_create_date: '20261027120000',
        payment_url_created_at: sql<Date>`now()`,
      })
      .where('id', '=', order.id)
      .where('payment_url', 'is', null)
      .execute();

    // Act
    const result = db
      .updateTable('orders')
      .set({ payment_url: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?second' })
      .where('id', '=', order.id)
      .execute();

    // Assert
    await expect(result).rejects.toMatchObject({ message: DbGuardError.ORDER_SNAPSHOT_IMMUTABLE });
  });
});

describe('event_guard_transition trigger', () => {
  it('should reject COMPLETED -> ON_SALE', async () => {
    // Arrange
    const event = await insertEvent(db, {
      status: EventStatus.COMPLETED,
      completed_at: new Date(),
    });

    // Act
    const result = db
      .updateTable('events')
      .set({ status: EventStatus.ON_SALE, completed_at: null })
      .where('id', '=', event.id)
      .execute();

    // Assert
    await expect(result).rejects.toMatchObject({
      message: DbGuardError.EVENT_INVALID_TRANSITION,
      code: CHECK_VIOLATION,
    });
  });
});
