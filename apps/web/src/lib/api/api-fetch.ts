// Server → api qua API_INTERNAL_URL (mạng compose); trình duyệt không gọi api trực tiếp
import 'server-only';

import { getCurrentUserId } from '@/lib/current-user';
import { AppError, parseBody, toAppError, toFetchError, type Http } from '@/lib/errors';
import type * as z from '@/lib/zod-mini';

// specs/functional-spec/web.md § Quy Tắc Chung: api không phản hồi trong 15 giây → lỗi
export const API_TIMEOUT_MS = 15_000;

const USER_ID_HEADER = 'X-User-Id';
const REQUEST_ID_HEADER = 'X-Request-ID';

export type ApiRequestInit = RequestInit & {
  /** Không gắn `X-User-Id` dù cookie có (xem trang công khai khi tài khoản đã chọn không còn) */
  anonymous?: boolean;
};

/** Thiếu cấu hình — lỗi triển khai, không phải lỗi mạng */
class ApiConfigError extends Error {
  override name = 'ApiConfigError';
}

function apiBaseUrl(): string {
  const raw = process.env.API_INTERNAL_URL;
  if (!raw) throw new ApiConfigError('API_INTERNAL_URL is not set');
  return raw.replace(/\/+$/, '');
}

/** Response thô; header `X-User-Id` lấy từ cookie, không forward cookie trình duyệt */
export async function apiRequest(
  path: string,
  { anonymous = false, ...init }: ApiRequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  // requestId nối log web ↔ api (specs/architecture.md § Monitoring & Observability)
  headers.set(REQUEST_ID_HEADER, crypto.randomUUID());
  const userId = anonymous ? null : await getCurrentUserId();
  if (userId) headers.set(USER_ID_HEADER, userId);
  // Gộp signal caller với timeout: `init.signal ?? timeout` mất timeout khi caller có signal
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  return fetch(`${apiBaseUrl()}${path}`, {
    cache: 'no-store', // số vé, trạng thái đổi liên tục (specs/architecture.md § Cross-cutting Concerns)
    ...init,
    headers,
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}

async function request<S extends z.core.$ZodType>(
  path: string,
  schema: S,
  init: ApiRequestInit,
): Promise<z.output<S>> {
  const res = await apiRequest(path, init).catch((err: unknown) => {
    if (err instanceof ApiConfigError) throw err; // → error.tsx
    throw toFetchError(err);
  });
  if (!res.ok) throw await toAppError(res);
  return parseBody(res, schema);
}

/** Server Component / Server Action / Route Handler — trả data đã parse, lỗi → throw AppError */
export const apiFetch: Http = (path, schema, init) => request(path, schema, init ?? {});

/** Như apiFetch nhưng không gắn `X-User-Id` */
export const apiFetchAnonymous: Http = (path, schema, init) =>
  request(path, schema, { ...init, anonymous: true });

export const isApiError = (err: unknown, code: string): err is AppError =>
  err instanceof AppError && err.code === code;
