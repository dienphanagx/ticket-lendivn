import type { Http } from '@/lib/errors';

import {
  LEDGER_ACCOUNT_ENTRY_LIMIT,
  LEDGER_TRANSACTION_LIMIT,
  ledgerAccountResponseSchema,
  ledgerOverviewResponseSchema,
  type LedgerFilter,
} from './types';

const pageQuery = (page: number, limit: number) =>
  new URLSearchParams({ page: String(page), limit: String(limit) });

/** `GET /v1/ledger?page=&limit=&type=&eventId=` — tài khoản + Σ toàn sổ, giao dịch lọc + phân trang */
export const getLedgerOverview = (http: Http, page: number, filter: LedgerFilter) => {
  const query = pageQuery(page, LEDGER_TRANSACTION_LIMIT);
  if (filter.type) query.set('type', filter.type);
  if (filter.eventId) query.set('eventId', filter.eventId);
  return http(`/v1/ledger?${query.toString()}`, ledgerOverviewResponseSchema);
};

/** `GET /v1/ledger/accounts/:accountId?page=&limit=50` */
export const getLedgerAccount = (http: Http, accountId: string, page: number) =>
  http(
    `/v1/ledger/accounts/${encodeURIComponent(accountId)}?${pageQuery(page, LEDGER_ACCOUNT_ENTRY_LIMIT).toString()}`,
    ledgerAccountResponseSchema,
  );
