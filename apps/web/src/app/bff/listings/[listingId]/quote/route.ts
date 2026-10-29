// BFF cho bảng tạm tính (Client Component → TanStack Query): cookie → `X-User-Id` → api quote
import type { NextRequest } from 'next/server';
import * as z from 'zod';

import { ERROR_CODES } from '@/constants/error-codes';
import { getListingQuote } from '@/features/listings/api';
import { QUANTITY_MIN } from '@/features/listings/quantity';
import { apiFetch } from '@/lib/api/api-fetch';
import { isSameOrigin } from '@/lib/api/same-origin';
import { getCurrentUserId } from '@/lib/current-user';
import { AppError, BFF_ERRORS } from '@/lib/errors';
import { ENTITY_ID_MAX_LENGTH, ENTITY_ID_PATTERN } from '@/lib/ids';
import { emptyToUndefined } from '@/lib/number';

// Response BFF chỉ là data — trình duyệt không render / chạy được dù api trả nhầm HTML
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

const STATUS_CLIENT_CLOSED = 499;

const querySchema = z.object({
  listingId: z.string().min(1).max(ENTITY_ID_MAX_LENGTH).regex(ENTITY_ID_PATTERN),
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(QUANTITY_MIN)),
});

const reply = (body: unknown, status: number) =>
  Response.json(body, { status, headers: SECURITY_HEADERS });

/** AppError từ apiFetch → response; lỗi không có response từ api đổi sang mã BFF */
function replyError(err: AppError): Response {
  switch (err.code) {
    case 'CANCELLED':
      return new Response(null, { status: STATUS_CLIENT_CLOSED, headers: SECURITY_HEADERS });
    case 'TIMEOUT':
      return reply(BFF_ERRORS.UPSTREAM_TIMEOUT, 504);
    case 'NETWORK_ERROR':
      return reply(BFF_ERRORS.UPSTREAM_UNAVAILABLE, 503);
    case 'INVALID_RESPONSE':
      return reply(BFF_ERRORS.UPSTREAM_INVALID, 502);
    default: {
      const { code, message, details } = err;
      return reply(details ? { code, message, details } : { code, message }, err.httpStatus ?? 502);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<'/bff/listings/[listingId]/quote'>,
) {
  if (!(await isSameOrigin(request))) return reply(BFF_ERRORS.CROSS_SITE, 403);
  const { listingId } = await params;
  const parsed = querySchema.safeParse({
    listingId,
    quantity: request.nextUrl.searchParams.get('quantity'),
  });
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    const details = Object.fromEntries(
      Object.entries(fieldErrors).flatMap(([field, msgs]) => (msgs?.[0] ? [[field, msgs[0]]] : [])),
    );
    return reply(
      { code: ERROR_CODES.VALIDATION_FAILED, message: 'Validation failed', details },
      400,
    );
  }
  if (!(await getCurrentUserId())) {
    return reply(
      { code: ERROR_CODES.USER_NOT_SELECTED, message: 'Current user is not selected' },
      401,
    );
  }
  try {
    const body = await getListingQuote(apiFetch, parsed.data.listingId, parsed.data.quantity, {
      signal: request.signal, // trình duyệt huỷ (đổi số lượng) → huỷ request tới api
    });
    return reply(body, 200);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return replyError(err);
  }
}
