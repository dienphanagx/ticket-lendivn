import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp } from '../support/app.js';
import { insertEvent, insertListing, insertUser } from '../support/fixtures.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

afterAll(async () => {
  await db.destroy();
});

describe('GET /api/v1/users', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase(db);
    app = await buildTestApp({ db });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return an empty list when there are no users', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [] });
  });

  it('should sort users by display name and flag those with listings', async () => {
    // Arrange
    const seller = await insertUser(db, { display_name: 'Bình' });
    const buyer = await insertUser(db, { display_name: 'An' });
    const event = await insertEvent(db);
    await insertListing(db, { event_id: event.id, seller_id: seller.id });

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [
        { id: buyer.id, displayName: 'An', hasListings: false },
        { id: seller.id, displayName: 'Bình', hasListings: true },
      ],
    });
  });
});
