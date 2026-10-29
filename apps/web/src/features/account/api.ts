import type { Http } from '@/lib/errors';

import { BALANCE_HISTORY_LIMIT, balanceResponseSchema } from './types';

/** `GET /v1/me/balance?page=&limit=20` — cần `X-User-Id` (apiFetch gắn từ cookie) */
export const getMyBalance = (http: Http, page: number) => {
  const query = new URLSearchParams({ page: String(page), limit: String(BALANCE_HISTORY_LIMIT) });
  return http(`/v1/me/balance?${query.toString()}`, balanceResponseSchema);
};
