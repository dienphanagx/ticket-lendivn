import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { parseSafeInt8 } from '../../src/db/client.js';
import { createTestDb } from '../support/test-db.js';

const db = createTestDb();

afterAll(async () => {
  await db.destroy();
});

describe('int8 parser', () => {
  it('should read bigint columns as numbers', async () => {
    // Act
    const { rows } = await sql<{ amount: number }>`SELECT 1100000::bigint AS amount`.execute(db);

    // Assert
    expect(rows[0]?.amount).toBe(1_100_000);
  });

  it('should throw when an int8 value exceeds the safe integer range', () => {
    // Act
    const parse = () => parseSafeInt8('9007199254740993');

    // Assert
    expect(parse).toThrow(RangeError);
  });
});
