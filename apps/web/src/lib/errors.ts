// Lỗi API dùng chung server + trình duyệt (.claude/skills/_shared/app-error.md)
import * as z from '@/lib/zod-mini';

type AppErrorOptions = Pick<AppError, 'details' | 'retryAfterSeconds' | 'requestId'>;

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number | null; // null = không có response (huỷ / timeout / mạng)
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    httpStatus: number | null = null,
    opts: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = opts.details;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.requestId = opts.requestId;
  }
}

// Mã client tự sinh; message cho log, UI hiển thị theo `code` (src/lib/error-message.ts)
export const CLIENT_ERRORS = {
  CANCELLED: 'Request was cancelled',
  TIMEOUT: 'Request timed out',
  NETWORK_ERROR: 'No network connection',
  INVALID_RESPONSE: 'Server returned an invalid response',
  UNKNOWN_ERROR: 'Unknown client error',
} as const;

// Body lỗi do chính BFF trả — cùng shape `{ code, message }` của api
export const BFF_ERRORS = {
  CROSS_SITE: { code: 'BFF_CROSS_SITE_REJECTED', message: 'Cross-site request rejected' },
  UPSTREAM_UNAVAILABLE: {
    code: 'BFF_UPSTREAM_UNAVAILABLE',
    message: 'Upstream API is unavailable',
  },
  UPSTREAM_TIMEOUT: { code: 'BFF_UPSTREAM_TIMEOUT', message: 'Upstream API timed out' },
  UPSTREAM_INVALID: {
    code: 'BFF_UPSTREAM_INVALID_RESPONSE',
    message: 'Upstream API returned an invalid response',
  },
} as const;

export const clientError = (code: keyof typeof CLIENT_ERRORS, httpStatus: number | null = null) =>
  new AppError(code, CLIENT_ERRORS[code], httpStatus);

export const isCancelled = (err: unknown) => err instanceof AppError && err.code === 'CANCELLED';

export function toDetails(v: unknown): Record<string, unknown> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

// Retry-After: số giây hoặc HTTP-date → số giây ≥ 0; sai format → undefined
export function parseRetryAfter(raw: unknown, now = Date.now()): number | undefined {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (/^\d+$/.test(v)) return Number(v);
  if (!/^[A-Za-z]{3}, /.test(v)) return undefined;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}

// Envelope lỗi của api: `{ code, message, details? }` (apps/api/src/lib/error-handler.ts)
const errorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.optional(z.unknown()),
});

/** Response lỗi → AppError; body sai envelope → INVALID_RESPONSE, giữ status */
export async function toAppError(res: Response): Promise<AppError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = z.safeParse(errorBodySchema, body);
  const opts = {
    details: parsed.success ? toDetails(parsed.data.details) : undefined,
    retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
    requestId: res.headers.get('x-request-id') ?? undefined,
  };
  return parsed.success
    ? new AppError(parsed.data.code, parsed.data.message, res.status, opts)
    : new AppError('INVALID_RESPONSE', CLIENT_ERRORS.INVALID_RESPONSE, res.status, opts);
}

// fetch() reject = không có response; TimeoutError / AbortError đều là DOMException → phân loại theo `name`
export function toFetchError(err: unknown): AppError {
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError') return clientError('TIMEOUT');
  if (name === 'AbortError') return clientError('CANCELLED');
  return clientError('NETWORK_ERROR');
}

/** Body thành công → parse bằng schema; body hỏng / sai shape → INVALID_RESPONSE */
export async function parseBody<S extends z.core.$ZodType>(
  res: Response,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    // Timeout / huỷ giữa lúc đọc body vẫn là lỗi fetch, không phải body sai
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw toFetchError(err);
    }
    body = undefined;
  }
  const parsed = z.safeParse(schema, body);
  if (!parsed.success) {
    throw new AppError('INVALID_RESPONSE', CLIENT_ERRORS.INVALID_RESPONSE, res.status, {
      requestId: res.headers.get('x-request-id') ?? undefined,
    });
  }
  return parsed.data;
}

// Fetcher chung: server truyền `apiFetch`, trình duyệt truyền `bffFetch`; features/<f>/api.ts nhận qua tham số
export type Http = <S extends z.core.$ZodType>(
  path: string,
  schema: S,
  init?: RequestInit,
) => Promise<z.output<S>>;
