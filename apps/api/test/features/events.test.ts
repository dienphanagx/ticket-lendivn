import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EventStatus,
  LedgerAccountType,
  LedgerSide,
  LedgerTxnType,
  OrderStatus,
} from '../../src/db/enums.js';
import type { Listing, Order } from '../../src/db/types.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertLedgerTxn,
  insertListing,
  insertOrder,
  insertUser,
  upsertLedgerAccount,
} from '../support/fixtures.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

/** Đơn đã quá hạn giữ chỗ mà job hết hạn chưa chạy: vẫn `PENDING_PAYMENT`. */
const EXPIRED_HOLD = {
  created_at: sql<Date>`now() - interval '20 minutes'`,
  hold_expires_at: sql<Date>`now() - interval '5 minutes'`,
};

const insertPaidOrder = (listing: Listing, buyerId: string, quantity: number) =>
  insertOrder(
    db,
    buildOrder(listing, buyerId, quantity, {
      status: OrderStatus.PAID,
      paid_at: sql<Date>`now()`,
    }),
  );

/** Bút toán `PAYMENT_CAPTURED` của đơn: tiền vào ký quỹ người bán + ký quỹ phí của sự kiện. */
async function captureIntoEscrow(order: Order): Promise<void> {
  const cash = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });
  const escrowSeller = await upsertLedgerAccount(db, {
    type: LedgerAccountType.ESCROW_SELLER,
    ownerUserId: order.seller_id,
    eventId: order.event_id,
  });
  const escrowFee = await upsertLedgerAccount(db, {
    type: LedgerAccountType.ESCROW_FEE,
    eventId: order.event_id,
  });
  await db.transaction().execute((trx) =>
    insertLedgerTxn(
      trx,
      { type: LedgerTxnType.PAYMENT_CAPTURED, eventId: order.event_id, orderId: order.id },
      [
        { accountId: cash.id, direction: LedgerSide.DEBIT, amount: order.buyer_total },
        { accountId: escrowSeller.id, direction: LedgerSide.CREDIT, amount: order.seller_net },
        { accountId: escrowFee.id, direction: LedgerSide.CREDIT, amount: order.platform_fee },
      ],
    ),
  );
}

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /api/v1/events', () => {
  it('should compute stock and escrow figures per event, sorted by start time', async () => {
    // Arrange
    const seller = await insertUser(db);
    const otherSeller = await insertUser(db);
    const buyer = await insertUser(db);
    const later = await insertEvent(db, { starts_at: '2027-06-01T12:00:00Z' });
    const earlier = await insertEvent(db, { starts_at: '2027-01-01T12:00:00Z' });
    const cheap = await insertListing(
      db,
      { event_id: earlier.id, seller_id: seller.id },
      { unit_price: 300_000, quantity_total: 2 },
    );
    const pricey = await insertListing(
      db,
      { event_id: earlier.id, seller_id: otherSeller.id },
      { unit_price: 500_000, quantity_total: 10 },
    );
    const paid = await insertPaidOrder(cheap, buyer.id, 2); // tin rẻ hết vé
    await insertOrder(db, buildOrder(pricey, buyer.id, 3)); // giữ chỗ còn hạn
    await insertOrder(db, buildOrder(pricey, buyer.id, 4, EXPIRED_HOLD)); // quá hạn, không tính
    await captureIntoEscrow(paid);

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/events' });

    // Assert
    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: Record<string, unknown>[] }>();
    expect(data.map((event) => event.id)).toEqual([earlier.id, later.id]);
    expect(data[0]).toMatchObject({
      slug: earlier.slug,
      status: EventStatus.ON_SALE,
      startsAt: '2027-01-01T12:00:00.000Z',
      completedAt: null,
      listingCount: 2,
      availableQuantity: 7,
      minUnitPrice: 500_000,
      escrowTotal: paid.buyer_total,
      pendingOrderCount: 1,
      sellerCount: 1,
    });
    expect(data[1]).toMatchObject({
      listingCount: 0,
      availableQuantity: 0,
      minUnitPrice: null,
      escrowTotal: 0,
      pendingOrderCount: 0,
      sellerCount: 0,
    });
  });

  it('should filter by status and report zeros for a completed event', async () => {
    // Arrange
    const seller = await insertUser(db);
    const buyer = await insertUser(db);
    await insertEvent(db);
    // Ký quỹ + đơn chờ còn hạn ghi khi sự kiện còn bán, rồi mới kết thúc: subquery ra số > 0,
    // nên chỉ quy tắc "COMPLETED → 0" mới làm response bằng 0
    const completed = await insertEvent(db);
    const listing = await insertListing(db, { event_id: completed.id, seller_id: seller.id });
    await captureIntoEscrow(await insertPaidOrder(listing, buyer.id, 1));
    await insertOrder(db, buildOrder(listing, buyer.id, 2));
    await db
      .updateTable('events')
      .set({ status: EventStatus.COMPLETED, completed_at: '2026-10-01T00:00:00Z' })
      .where('id', '=', completed.id)
      .execute();

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/events?status=COMPLETED' });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [
        expect.objectContaining({
          id: completed.id,
          status: EventStatus.COMPLETED,
          completedAt: '2026-10-01T00:00:00.000Z',
          listingCount: 1,
          availableQuantity: 0,
          minUnitPrice: null,
          escrowTotal: 0,
          pendingOrderCount: 0,
          sellerCount: 0,
        }),
      ],
    });
  });

  it('should return 400 VALIDATION_FAILED for an unknown status', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/events?status=DRAFT' });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { status: expect.any(String) as string },
    });
  });
});

describe('GET /api/v1/events/:slug', () => {
  it('should return listings sorted by price then remaining tickets, with own-listing flag', async () => {
    // Arrange
    const me = await insertUser(db, { display_name: 'Me' });
    const other = await insertUser(db, { display_name: 'Other' });
    const event = await insertEvent(db, { slug: 'rock-night', description: 'Live' });
    const fewLeft = await insertListing(
      db,
      { event_id: event.id, seller_id: other.id },
      { unit_price: 400_000, quantity_total: 2 },
    );
    const mine = await insertListing(
      db,
      { event_id: event.id, seller_id: me.id },
      { unit_price: 400_000, quantity_total: 5 },
    );
    const soldOut = await insertListing(
      db,
      { event_id: event.id, seller_id: other.id },
      { unit_price: 900_000, quantity_total: 1 },
    );
    await insertPaidOrder(soldOut, me.id, 1);

    // Act
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/events/rock-night',
      headers: { 'X-User-Id': me.id },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        id: event.id,
        slug: 'rock-night',
        name: event.name,
        description: 'Live',
        venue: event.venue,
        startsAt: event.starts_at.toISOString(),
        status: EventStatus.ON_SALE,
        completedAt: null,
        listings: [
          {
            id: mine.id,
            seller: { id: me.id, displayName: 'Me' },
            unitPrice: 400_000,
            quantityTotal: 5,
            availableQuantity: 5,
            isOwnListing: true,
          },
          expect.objectContaining({ id: fewLeft.id, availableQuantity: 2, isOwnListing: false }),
          expect.objectContaining({ id: soldOut.id, availableQuantity: 0, isOwnListing: false }),
        ],
      },
    });
  });

  it('should flag the own listing when X-User-Id is the seller UUID in upper case', async () => {
    // Arrange
    const seller = await insertUser(db);
    const event = await insertEvent(db);
    await insertListing(db, { event_id: event.id, seller_id: seller.id });

    // Act
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${event.slug}`,
      headers: { 'X-User-Id': seller.id.toUpperCase() },
    });

    // Assert
    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: { listings: { isOwnListing: boolean }[] } }>();
    expect(data.listings.map((listing) => listing.isOwnListing)).toEqual([true]);
  });

  it('should set isOwnListing false for every listing without X-User-Id', async () => {
    // Arrange
    const seller = await insertUser(db);
    const event = await insertEvent(db);
    await insertListing(db, { event_id: event.id, seller_id: seller.id });

    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/events/${event.slug}` });

    // Assert
    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: { listings: { isOwnListing: boolean }[] } }>();
    expect(data.listings.map((listing) => listing.isOwnListing)).toEqual([false]);
  });

  it('should report zero remaining tickets on a completed event', async () => {
    // Arrange
    const seller = await insertUser(db);
    const event = await insertEvent(db, {
      status: EventStatus.COMPLETED,
      completed_at: new Date(),
    });
    await insertListing(db, { event_id: event.id, seller_id: seller.id }, { quantity_total: 4 });

    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/events/${event.slug}` });

    // Assert
    const { data } = res.json<{ data: { listings: { availableQuantity: number }[] } }>();
    expect(data.listings.map((listing) => listing.availableQuantity)).toEqual([0]);
  });

  it('should return an empty listing array for an event without listings', async () => {
    // Arrange
    const event = await insertEvent(db);

    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/events/${event.slug}` });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { listings: unknown[] } }>().data.listings).toEqual([]);
  });

  it('should return 404 EVENT_NOT_FOUND for an unknown slug', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/events/no-such-event' });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>()).toEqual({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
  });

  it('should return 400 VALIDATION_FAILED for a malformed slug', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/events/Bad_Slug' });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().details).toHaveProperty('slug');
  });

  it.each([
    ['contains invalid characters', 'not valid!'],
    ['is longer than 64 characters', 'a'.repeat(65)],
  ])('should return 400 with X-User-Id details when the header %s', async (_label, userId) => {
    // Arrange
    const event = await insertEvent(db);

    // Act
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${event.slug}`,
      headers: { 'X-User-Id': userId },
    });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.details ?? {})).toEqual(['X-User-Id']);
  });

  it.each([
    ['an unknown UUID', randomUUID()],
    ['a well-formed non-UUID id', 'user_123'],
  ])('should return 404 USER_NOT_FOUND for %s', async (_label, userId) => {
    // Arrange
    const event = await insertEvent(db);

    // Act
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/events/${event.slug}`,
      headers: { 'X-User-Id': userId },
    });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>()).toEqual({ code: 'USER_NOT_FOUND', message: 'User not found' });
  });
});
