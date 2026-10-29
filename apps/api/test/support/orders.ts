import { sql } from 'kysely';

import type { Database } from '../../src/db/client.js';
import type { Listing } from '../../src/db/types.js';
import { buildOrder, type OrderInsert } from './fixtures.js';

const LOCK_WAIT_TIMEOUT_MS = 10_000;

/** Đơn `PENDING_PAYMENT` đã quá hạn giữ chỗ 5 phút mà job chưa chạy (vẫn thoả CHECK hold window). */
export const buildOverdueOrder = (
  listing: Listing,
  buyerId: string,
  quantity: number,
  overrides: Partial<OrderInsert> = {},
): OrderInsert =>
  buildOrder(listing, buyerId, quantity, {
    created_at: sql<Date>`now() - interval '20 minutes'`,
    hold_expires_at: sql<Date>`now() - interval '5 minutes'`,
    ...overrides,
  });

/**
 * Chờ tới khi đúng `count` backend của DB test đang đứng chờ khoá hàng — điểm đồng bộ tất định
 * cho test đồng thời (đọc `pg_stat_activity`, không đoán thời gian bằng sleep).
 */
export async function waitForLockWaiters(db: Database, count: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  for (;;) {
    const { rows } = await sql<{ waiting: number }>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(db);
    if ((rows[0]?.waiting ?? 0) >= count) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} lock waiters`);
    }
  }
}
