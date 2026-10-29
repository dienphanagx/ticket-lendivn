// Trình duyệt → Route Handler `/bff/*` (same-origin); BFF đọc cookie, gắn `X-User-Id` rồi gọi api
import { parseBody, toAppError, toFetchError, type Http } from '@/lib/errors';

import { anySignal } from './any-signal';

// > API_TIMEOUT_MS (15 giây) của server — BFF kịp trả 504 kèm envelope trước khi trình duyệt tự cắt
export const BFF_TIMEOUT_MS = 20_000;

/** Path là route BFF (`BFF_ROUTES`), không phải path api */
export const bffFetch: Http = async (path, schema, init = {}) => {
  const timeout = AbortSignal.timeout(BFF_TIMEOUT_MS);
  // Gộp signal TanStack Query (huỷ query cũ) với timeout
  const merged = init.signal
    ? anySignal([init.signal, timeout])
    : { signal: timeout, cleanup: () => undefined };
  try {
    const res = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      signal: merged.signal,
    }).catch((err: unknown) => {
      throw toFetchError(err); // CANCELLED / TIMEOUT / NETWORK_ERROR
    });
    if (!res.ok) throw await toAppError(res);
    return await parseBody(res, schema); // signal sống tới khi đọc xong body
  } finally {
    merged.cleanup();
  }
};
