import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EventStatus, OrderStatus } from '../../src/db/enums.js';
import type { NewListing, User } from '../../src/db/types.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { buildOverdueOrder } from '../support/orders.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

const ORDER_ID_FORMAT = /^\d{6}[A-Z0-9]{10}$/;
const HOLD_MS = 15 * 60 * 1000;

let app: FastifyInstance;
let buyer: User;
let seller: User;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db });
  buyer = await insertUser(db, { display_name: 'Buyer Binh' });
  seller = await insertUser(db, { display_name: 'Seller Son' });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

async function arrangeListing(overrides: Partial<NewListing> = {}, eventStatus?: EventStatus) {
  const event = await insertEvent(
    db,
    eventStatus === EventStatus.COMPLETED
      ? { name: 'Done show', status: EventStatus.COMPLETED, completed_at: new Date() }
      : { name: 'Live show' },
  );
  return insertListing(db, { event_id: event.id, seller_id: seller.id }, overrides);
}

interface CreateOrderRequest {
  listingId: unknown;
  quantity: unknown;
  userId?: string;
  key?: string | null;
}

const postOrder = ({
  listingId,
  quantity,
  userId = buyer.id,
  key = 'key-12345678',
}: CreateOrderRequest) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: { 'X-User-Id': userId, ...(key === null ? {} : { 'Idempotency-Key': key }) },
    payload: { listingId, quantity },
  });

interface OrderBody {
  data: { id: string; status: string; [field: string]: unknown };
}

describe('POST /api/v1/orders', () => {
  it.each([
    [
      500_000,
      2,
      { subtotal: 1_000_000, buyerFee: 100_000, buyerTotal: 1_100_000 },
      [50_000, 950_000, 150_000],
    ],
    [
      333_333,
      1,
      { subtotal: 333_333, buyerFee: 33_333, buyerTotal: 366_666 },
      [16_666, 316_667, 49_999],
    ],
  ])(
    'should create a PENDING_PAYMENT order for %i x %i with the fee snapshot',
    async (unitPrice, quantity, amounts, [sellerFee, sellerNet, platformFee]) => {
      // Arrange
      const listing = await arrangeListing({ unit_price: unitPrice, quantity_total: 5 });

      // Act
      const res = await postOrder({ listingId: listing.id, quantity });

      // Assert
      expect(res.statusCode).toBe(201);
      const { data } = res.json<OrderBody>();
      expect(data).toMatchObject({
        status: OrderStatus.PENDING_PAYMENT,
        listingId: listing.id,
        eventId: listing.event_id,
        quantity,
        unitPrice,
        ...amounts,
      });
      expect(data.id).toMatch(ORDER_ID_FORMAT);
      const holdMs = Date.parse(String(data.holdExpiresAt)) - Date.parse(String(data.createdAt));
      expect(holdMs).toBe(HOLD_MS);
      const stored = await db
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', data.id)
        .executeTakeFirstOrThrow();
      expect(stored).toMatchObject({
        buyer_id: buyer.id,
        seller_id: seller.id,
        seller_fee: sellerFee,
        seller_net: sellerNet,
        platform_fee: platformFee,
      });
    },
  );

  it.each([
    ['the seller id', () => seller.id],
    ['the seller id in upper case', () => seller.id.toUpperCase()],
  ])('should return 422 CANNOT_BUY_OWN_LISTING for %s', async (_label, userId) => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 1, userId: userId() });

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().code).toBe('CANNOT_BUY_OWN_LISTING');
  });

  it('should return the existing order with 200 when the key is replayed with the same body', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 5 });
    const first = await postOrder({ listingId: listing.id, quantity: 2 });

    // Act
    const replay = await postOrder({ listingId: listing.id.toUpperCase(), quantity: 2 });

    // Assert
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    const { count } = await db
      .selectFrom('orders')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    expect(count).toBe(1);
  });

  it('should return 409 IDEMPOTENCY_KEY_REUSED when the key is reused with another body', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 5 });
    await postOrder({ listingId: listing.id, quantity: 2 });

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 3 });

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('should replay an overdue order under the same key in its current EXPIRED state', async () => {
    // Arrange
    const listing = await arrangeListing();
    const order = await insertOrder(
      db,
      buildOverdueOrder(listing, buyer.id, 1, { idempotency_key: 'key-12345678' }),
    );

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 1 });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<OrderBody>().data).toMatchObject({ id: order.id, status: OrderStatus.EXPIRED });
    const stored = await db
      .selectFrom('orders')
      .select(['status', 'expired_at'])
      .where('id', '=', order.id)
      .executeTakeFirstOrThrow();
    expect(stored.status).toBe(OrderStatus.EXPIRED);
    expect(stored.expired_at).not.toBeNull();
  });

  it('should count PAID tickets as sold and return 409 INSUFFICIENT_QUANTITY', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 3 });
    const otherBuyer = await insertUser(db);
    await insertOrder(
      db,
      buildOrder(listing, otherBuyer.id, 2, { status: OrderStatus.PAID, paid_at: new Date() }),
    );

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 2 });

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>()).toMatchObject({
      code: 'INSUFFICIENT_QUANTITY',
      details: { available: 1 },
    });
  });

  it('should not count an overdue hold so its tickets can be bought again', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 2 });
    const otherBuyer = await insertUser(db);
    await insertOrder(db, buildOverdueOrder(listing, otherBuyer.id, 2));

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 2 });

    // Assert
    expect(res.statusCode).toBe(201);
  });

  it('should return 409 INSUFFICIENT_QUANTITY with available count after active holds', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 3 });
    const otherBuyer = await insertUser(db);
    await insertOrder(db, buildOrder(listing, otherBuyer.id, 2));

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 2 });

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>()).toMatchObject({
      code: 'INSUFFICIENT_QUANTITY',
      details: { available: 1 },
    });
  });

  it('should return 409 EVENT_NOT_ON_SALE for a listing of a completed event', async () => {
    // Arrange
    const listing = await arrangeListing({}, EventStatus.COMPLETED);

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 1 });

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe('EVENT_NOT_ON_SALE');
  });

  it.each([
    ['an unknown UUID', randomUUID()],
    ['a non-UUID id', 'listing_1'],
  ])('should return 404 LISTING_NOT_FOUND for %s', async (_label, listingId) => {
    // Act
    const res = await postOrder({ listingId, quantity: 1 });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('LISTING_NOT_FOUND');
  });

  it.each([
    ['a missing key', { key: null }, 'Idempotency-Key'],
    ['a 7-character key', { key: 'short-7' }, 'Idempotency-Key'],
    ['a key with a space', { key: 'bad key 123' }, 'Idempotency-Key'],
    ['a zero quantity', { quantity: 0 }, 'quantity'],
    ['a fractional quantity', { quantity: 1.5 }, 'quantity'],
    ['a missing listingId', { listingId: undefined }, 'listingId'],
  ])('should return 400 with field details for %s', async (_label, override, field) => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await postOrder({ listingId: listing.id, quantity: 1, ...override });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.details ?? {})).toEqual([field]);
  });
});

describe('GET /api/v1/orders/:orderId', () => {
  it('should return a pending order with buyer, seller, event and retryAfterSeconds', async () => {
    // Arrange
    const listing = await arrangeListing({ unit_price: 500_000 });
    const order = await insertOrder(db, buildOrder(listing, buyer.id, 2));

    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/orders/${order.id}` });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        id: order.id,
        status: OrderStatus.PENDING_PAYMENT,
        event: { id: listing.event_id, name: 'Live show' },
        seller: { id: seller.id, displayName: 'Seller Son' },
        buyer: { id: buyer.id, displayName: 'Buyer Binh' },
        listingId: listing.id,
        quantity: 2,
        unitPrice: 500_000,
        subtotal: 1_000_000,
        buyerFee: 100_000,
        buyerTotal: 1_100_000,
        createdAt: order.created_at.toISOString(),
        holdExpiresAt: order.hold_expires_at.toISOString(),
        paidAt: null,
        refundAmount: null,
        paymentUrl: null,
        retryAfterSeconds: 3,
      },
    });
  });

  it('should expire an overdue pending order in place and keep holdExpiresAt', async () => {
    // Arrange
    const listing = await arrangeListing();
    const order = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));

    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/orders/${order.id}` });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<OrderBody>().data).toMatchObject({
      status: OrderStatus.EXPIRED,
      holdExpiresAt: order.hold_expires_at.toISOString(),
      retryAfterSeconds: null,
    });
    const stored = await db
      .selectFrom('orders')
      .select(['status', 'expired_at'])
      .where('id', '=', order.id)
      .executeTakeFirstOrThrow();
    expect(stored.status).toBe(OrderStatus.EXPIRED);
    expect(stored.expired_at).not.toBeNull();
  });

  it('should return 404 ORDER_NOT_FOUND for an unknown order id', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/orders/261029ABCDEFGHIJ' });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('ORDER_NOT_FOUND');
  });

  it.each([
    ['11 characters', 'ABCDEFGHIJK'],
    ['21 characters', 'A'.repeat(21)],
    ['a dash', '261029ABCD-EFGHI'],
  ])('should return 400 with orderId details for an id with %s', async (_label, orderId) => {
    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/orders/${orderId}` });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json<ErrorBody>().details ?? {})).toEqual(['orderId']);
  });
});

describe('GET /api/v1/orders', () => {
  const listOrders = (query: string) =>
    app.inject({ method: 'GET', url: `/api/v1/orders${query}` });

  it('should filter by buyer, newest first, with pagination meta', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 10 });
    const otherBuyer = await insertUser(db);
    const older = await insertOrder(
      db,
      buildOrder(listing, buyer.id, 1, {
        created_at: sql<Date>`now() - interval '1 minute'`,
        hold_expires_at: sql<Date>`now() + interval '14 minutes'`,
      }),
    );
    const newer = await insertOrder(db, buildOrder(listing, buyer.id, 2));
    await insertOrder(db, buildOrder(listing, otherBuyer.id, 1));

    // Act
    const res = await listOrders(`?buyerId=${buyer.id}&limit=1&page=2`);

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: OrderBody['data'][]; meta: unknown }>();
    expect(body.meta).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(body.data.map((order) => order.id)).toEqual([older.id]);
    expect(newer.created_at.getTime()).toBeGreaterThan(older.created_at.getTime());
    expect(body.data[0]).toMatchObject({
      buyer: { id: buyer.id, displayName: 'Buyer Binh' },
      seller: { id: seller.id, displayName: 'Seller Son' },
      event: { name: 'Live show' },
      buyerTotal: 550_000,
      paidAt: null,
    });
  });

  it('should expire overdue orders before filtering by status', async () => {
    // Arrange
    const listing = await arrangeListing();
    const overdue = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));
    const active = await insertOrder(db, buildOrder(listing, buyer.id, 1));

    // Act
    const pending = await listOrders(`?status=${OrderStatus.PENDING_PAYMENT}`);
    const expired = await listOrders(`?status=${OrderStatus.EXPIRED}`);

    // Assert
    expect(pending.json<{ data: OrderBody['data'][] }>().data.map((o) => o.id)).toEqual([
      active.id,
    ]);
    expect(expired.json<{ data: OrderBody['data'][] }>().data.map((o) => o.id)).toEqual([
      overdue.id,
    ]);
  });

  it('should return an empty page with zero totalPages when nothing matches', async () => {
    // Act
    const res = await listOrders('');

    // Assert
    expect(res.json()).toEqual({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  });

  it('should return 404 USER_NOT_FOUND for an unknown buyerId', async () => {
    // Act
    const res = await listOrders(`?buyerId=${randomUUID()}`);

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('USER_NOT_FOUND');
  });

  it.each([
    ['?page=0', 'page'],
    ['?limit=101', 'limit'],
    ['?status=PAID_LATER', 'status'],
    ['?buyerId=bad%20id', 'buyerId'],
  ])('should return 400 with field details for %s', async (query, field) => {
    // Act
    const res = await listOrders(query);

    // Assert
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json<ErrorBody>().details ?? {})).toEqual([field]);
  });
});
