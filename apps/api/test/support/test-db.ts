import { sql } from 'kysely';

import { createDb, type Database } from '../../src/db/client.js';

// Test chạy trên DB `ticket_test` (compose profile `test`). Mọi bước migrate / TRUNCATE đi qua guard
// tên DB đuôi `_test` trước, vì env trỏ sai là mất DB dev (rule `destructive-ops` § Database).

const TEST_DB_SUFFIX = '_test';
const TEST_POOL_MAX = 4;

/** Mọi bảng của app; TRUNCATE không kích hoạt trigger chặn UPDATE / DELETE của sổ cái. */
const APP_TABLES = [
  'ledger_entries',
  'payment_transactions',
  'ledger_transactions',
  'ledger_accounts',
  'orders',
  'listings',
  'events',
  'users',
] as const;

export interface TestDbTarget {
  url: string;
  host: string;
  database: string;
}

/** Đọc `DATABASE_URL`, in host + tên DB; tên không đuôi `_test` → throw trước khi chạm DB. */
export function resolveTestDbTarget(source: NodeJS.ProcessEnv = process.env): TestDbTarget {
  const url = source.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is required for tests (expected a database ending with _test)');
  }
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const target = { url, host: `${parsed.hostname}:${parsed.port || '5432'}`, database };
  process.stdout.write(`[test-db] host=${target.host} database=${target.database}\n`);
  if (!database.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `Refusing to run tests against database "${database}": name must end with ${TEST_DB_SUFFIX}`,
    );
  }
  return target;
}

export function createTestDb(): Database {
  return createDb({ connectionString: resolveTestDbTarget().url, poolMax: TEST_POOL_MAX });
}

/** Kiểm lại DB đang kết nối thật (không chỉ URL) rồi mới TRUNCATE. */
export async function assertConnectedToTestDb(db: Database): Promise<void> {
  const { rows } = await sql<{ name: string }>`SELECT current_database() AS name`.execute(db);
  const name = rows[0]?.name ?? '';
  if (!name.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(`Refusing to reset database "${name}": name must end with ${TEST_DB_SUFFIX}`);
  }
}

export async function resetDatabase(db: Database): Promise<void> {
  await assertConnectedToTestDb(db);
  await sql`TRUNCATE ${sql.join(APP_TABLES.map((table) => sql.table(table)))} CASCADE`.execute(db);
}
