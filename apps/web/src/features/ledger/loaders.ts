// Nạp dữ liệu trang Sổ cái / chi tiết tài khoản sổ cái (Server Component)
import 'server-only';

import { ERROR_CODES } from '@/constants/error-codes';
import { listEvents } from '@/features/events/api';
import { apiFetch, apiFetchAnonymous, isApiError } from '@/lib/api/api-fetch';

import { getLedgerAccount, getLedgerOverview } from './api';
import { isLedgerAccountId, type LedgerFilter } from './types';

/** Tên sự kiện theo id (lọc giao dịch, tham chiếu dòng bút toán); lỗi → rỗng, không làm hỏng trang */
async function loadEventNames(): Promise<Map<string, string>> {
  try {
    const { data } = await listEvents(apiFetchAnonymous);
    return new Map(data.map((event) => [event.id, event.name]));
  } catch {
    return new Map();
  }
}

/** null = `eventId` trên URL đúng dạng nhưng không có sự kiện (api 404 EVENT_NOT_FOUND) → bỏ lọc */
export async function loadLedgerOverview(page: number, filter: LedgerFilter) {
  const [overview, eventNames] = await Promise.all([
    getLedgerOverview(apiFetch, page, filter).catch((err: unknown) => {
      if (filter.eventId && isApiError(err, ERROR_CODES.EVENT_NOT_FOUND)) return null;
      throw err; // lỗi hệ thống / timeout → error.tsx
    }),
    loadEventNames(),
  ]);
  return overview ? { ...overview, eventNames } : null;
}

/** null = mã sai dạng (không gọi api) hoặc api 404 LEDGER_ACCOUNT_NOT_FOUND → trang 404 */
export async function loadLedgerAccount(accountId: string, page: number) {
  if (!isLedgerAccountId(accountId)) return null;
  const [result, eventNames] = await Promise.all([
    getLedgerAccount(apiFetch, accountId, page).catch((err: unknown) => {
      if (isApiError(err, ERROR_CODES.LEDGER_ACCOUNT_NOT_FOUND)) return null;
      throw err;
    }),
    loadEventNames(),
  ]);
  return result ? { ...result, eventNames } : null;
}

export type LedgerOverviewData = NonNullable<Awaited<ReturnType<typeof loadLedgerOverview>>>;
export type LedgerAccountData = NonNullable<Awaited<ReturnType<typeof loadLedgerAccount>>>;
