import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EventStatus } from '../../src/db/enums.js';
import type { NewListing, User } from '../../src/db/types.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

let app: FastifyInstance;
let buyer: User;
let seller: User;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db });
  buyer = await insertUser(db);
  seller = await insertUser(db);
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
      ? { status: EventStatus.COMPLETED, completed_at: new Date() }
      : {},
  );
  return insertListing(db, { event_id: event.id, seller_id: seller.id }, overrides);
}

/** `userId` null = không gửi header. */
const quote = (listingId: string, query: string, userId: string | null = buyer.id) =>
  app.inject({
    method: 'GET',
    url: `/api/v1/listings/${listingId}/quote${query}`,
    headers: userId === null ? {} : { 'X-User-Id': userId },
  });

describe('GET /api/v1/listings/:listingId/quote', () => {
  it.each([
    [500_000, 2, { subtotal: 1_000_000, buyerFee: 100_000, buyerTotal: 1_100_000 }],
    [333_333, 1, { subtotal: 333_333, buyerFee: 33_333, buyerTotal: 366_666 }],
  ])('should quote %i x %i without seller-side amounts', async (unitPrice, quantity, amounts) => {
    // Arrange
    const listing = await arrangeListing({ unit_price: unitPrice, quantity_total: 5 });

    // Act
    const res = await quote(listing.id, `?quantity=${quantity}`);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { listingId: listing.id, unitPrice, quantity, ...amounts, availableQuantity: 5 },
    });
  });

  it('should return 409 INSUFFICIENT_QUANTITY with available count after active holds', async () => {
    // Arrange
    const listing = await arrangeListing({ quantity_total: 5 });
    const otherBuyer = await insertUser(db);
    await insertOrder(db, buildOrder(listing, otherBuyer.id, 3));

    // Act
    const res = await quote(listing.id, '?quantity=3');

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>()).toEqual({
      code: 'INSUFFICIENT_QUANTITY',
      message: 'Not enough tickets available',
      details: { available: 2 },
    });
  });

  it('should return 422 CANNOT_BUY_OWN_LISTING when the seller quotes their listing', async () => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await quote(listing.id, '?quantity=1', seller.id);

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().code).toBe('CANNOT_BUY_OWN_LISTING');
  });

  it('should return 422 CANNOT_BUY_OWN_LISTING when the seller UUID is sent in upper case', async () => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await quote(listing.id, '?quantity=1', seller.id.toUpperCase());

    // Assert
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().code).toBe('CANNOT_BUY_OWN_LISTING');
  });

  it('should return 409 EVENT_NOT_ON_SALE for a listing of a completed event', async () => {
    // Arrange
    const listing = await arrangeListing({}, EventStatus.COMPLETED);

    // Act
    const res = await quote(listing.id, '?quantity=1');

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().code).toBe('EVENT_NOT_ON_SALE');
  });

  it.each([
    ['an unknown UUID', randomUUID()],
    ['a non-UUID id', 'listing_1'],
  ])('should return 404 LISTING_NOT_FOUND for %s', async (_label, listingId) => {
    // Act
    const res = await quote(listingId, '?quantity=1');

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('LISTING_NOT_FOUND');
  });

  it.each([
    ['', 'missing'],
    ['?quantity=0', 'zero'],
    ['?quantity=1.5', 'fractional'],
    ['?quantity=abc', 'text'],
  ])('should return 400 with quantity details when quantity is %s (%s)', async (query) => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await quote(listing.id, query);

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.details ?? {})).toEqual(['quantity']);
  });

  it('should return 400 with listingId details for a malformed listing id', async () => {
    // Act
    const res = await quote('bad%20id', '?quantity=1');

    // Assert
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json<ErrorBody>().details ?? {})).toEqual(['listingId']);
  });

  it('should return 400 with X-User-Id details when the header is missing', async () => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await quote(listing.id, '?quantity=1', null);

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { 'X-User-Id': expect.any(String) as string },
    });
  });

  it('should return 404 USER_NOT_FOUND when X-User-Id is not a known user', async () => {
    // Arrange
    const listing = await arrangeListing();

    // Act
    const res = await quote(listing.id, '?quantity=1', randomUUID());

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('USER_NOT_FOUND');
  });
});
