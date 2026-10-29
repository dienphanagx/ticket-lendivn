import { migrateToLatest } from '../src/db/migrator.js';
import { assertConnectedToTestDb, createTestDb } from './support/test-db.js';

/** Chạy 1 lần trước mọi file test: guard tên DB → migrate DB `ticket_test` lên bản mới nhất. */
export default async function setup(): Promise<void> {
  const db = createTestDb();
  try {
    await assertConnectedToTestDb(db);
    await migrateToLatest(db);
  } finally {
    await db.destroy();
  }
}
