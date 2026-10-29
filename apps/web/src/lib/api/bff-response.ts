// Response chung của Route Handler `/bff/*`: header an toàn, lỗi cùng envelope `{ code, message, details? }`
import 'server-only';

import * as z from 'zod';

import '@/lib/zod-config';

import { ERROR_CODES } from '@/constants/error-codes';
import { AppError, BFF_ERRORS } from '@/lib/errors';

// Response BFF chỉ là data — trình duyệt không render / chạy được dù api trả nhầm HTML
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

const STATUS_CLIENT_CLOSED = 499;

export const bffReply = (body: unknown, status: number) =>
  Response.json(body, { status, headers: SECURITY_HEADERS });

export const bffCrossSite = () => bffReply(BFF_ERRORS.CROSS_SITE, 403);

export const bffUserNotSelected = () =>
  bffReply({ code: ERROR_CODES.USER_NOT_SELECTED, message: 'Current user is not selected' }, 401);

/** Lỗi Zod → 400 VALIDATION_FAILED, `details` = câu đầu tiên mỗi field */
export function bffValidationError(error: z.core.$ZodError): Response {
  const { fieldErrors } = z.flattenError(error);
  const details = Object.fromEntries(
    Object.entries(fieldErrors).flatMap(([field, msgs]) =>
      Array.isArray(msgs) && typeof msgs[0] === 'string' ? [[field, msgs[0]]] : [],
    ),
  );
  return bffReply(
    { code: ERROR_CODES.VALIDATION_FAILED, message: 'Validation failed', details },
    400,
  );
}

/** AppError từ apiFetch → response; lỗi không có response từ api đổi sang mã BFF */
export function bffError(err: AppError): Response {
  switch (err.code) {
    case 'CANCELLED':
      return new Response(null, { status: STATUS_CLIENT_CLOSED, headers: SECURITY_HEADERS });
    case 'TIMEOUT':
      return bffReply(BFF_ERRORS.UPSTREAM_TIMEOUT, 504);
    case 'NETWORK_ERROR':
      return bffReply(BFF_ERRORS.UPSTREAM_UNAVAILABLE, 503);
    case 'INVALID_RESPONSE':
      return bffReply(BFF_ERRORS.UPSTREAM_INVALID, 502);
    default: {
      const { code, message, details } = err;
      return bffReply(
        details ? { code, message, details } : { code, message },
        err.httpStatus ?? 502,
      );
    }
  }
}

/** Chạy lời gọi api; AppError → response lỗi, lỗi khác ném tiếp (Next trả 500) */
export async function bffCall(run: () => Promise<unknown>): Promise<Response> {
  try {
    return bffReply(await run(), 200);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return bffError(err);
  }
}
