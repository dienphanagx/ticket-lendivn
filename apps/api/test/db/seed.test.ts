import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { EventStatus } from '../../src/db/enums.js';
import { SEED_EVENT_IDS, SEED_LISTING_IDS, seedDevData } from '../../src/db/seed-data.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

const ODD_UNIT_PRICE = 333_333;

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.destroy();
});

describe('seedDevData', () => {
  it('should insert 4 users, 2 on-sale events and >= 5 listings from >= 2 sellers', async () => {
    // Act
    const inserted = await seedDevData(db);

    // Assert
    expect(inserted.users).toBe(4);
    const events = await db.selectFrom('events').select('status').execute();
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.status === EventStatus.ON_SALE)).toBe(true);
    const listings = await db.selectFrom('listings').select(['seller_id', 'unit_price']).execute();
    expect(listings.length).toBeGreaterThanOrEqual(5);
    expect(new Set(listings.map((listing) => listing.seller_id)).size).toBeGreaterThanOrEqual(2);
    expect(listings.some((listing) => listing.unit_price === ODD_UNIT_PRICE)).toBe(true);
  });

  it('should not seed orders or ledger entries', async () => {
    // Act
    await seedDevData(db);

    // Assert
    expect(await db.selectFrom('orders').select('id').execute()).toHaveLength(0);
    expect(await db.selectFrom('ledger_transactions').select('id').execute()).toHaveLength(0);
  });

  it('should be idempotent and keep data changed after the first run', async () => {
    // Arrange
    await seedDevData(db);
    await db
      .updateTable('events')
      .set({ status: EventStatus.COMPLETED, completed_at: new Date() })
      .where('id', '=', SEED_EVENT_IDS.CONCERT)
      .execute();

    // Act
    const second = await seedDevData(db);

    // Assert
    expect(second).toEqual({ users: 0, events: 0, listings: 0 });
    const concert = await db
      .selectFrom('events')
      .select('status')
      .where('id', '=', SEED_EVENT_IDS.CONCERT)
      .executeTakeFirstOrThrow();
    expect(concert.status).toBe(EventStatus.COMPLETED);
    const oddListing = await db
      .selectFrom('listings')
      .select('unit_price')
      .where('id', '=', SEED_LISTING_IDS.BINH_FESTIVAL_ODD_PRICE)
      .executeTakeFirstOrThrow();
    expect(oddListing.unit_price).toBe(ODD_UNIT_PRICE);
  });
});
