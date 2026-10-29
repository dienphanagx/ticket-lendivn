// BFF cho bảng tạm tính (Client Component → TanStack Query): cookie → `X-User-Id` → api quote
import type { NextRequest } from 'next/server';
import * as z from 'zod';

import { getListingQuote } from '@/features/listings/api';
import { QUANTITY_MIN } from '@/features/listings/quantity';
import { apiFetch } from '@/lib/api/api-fetch';
import {
  bffCall,
  bffCrossSite,
  bffUserNotSelected,
  bffValidationError,
} from '@/lib/api/bff-response';
import { isSameOrigin } from '@/lib/api/same-origin';
import { getCurrentUserId } from '@/lib/current-user';
import { ENTITY_ID_MAX_LENGTH, ENTITY_ID_PATTERN } from '@/lib/ids';
import { emptyToUndefined } from '@/lib/number';

const querySchema = z.object({
  listingId: z.string().min(1).max(ENTITY_ID_MAX_LENGTH).regex(ENTITY_ID_PATTERN),
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(QUANTITY_MIN)),
});

export async function GET(
  request: NextRequest,
  { params }: RouteContext<'/bff/listings/[listingId]/quote'>,
) {
  if (!(await isSameOrigin(request))) return bffCrossSite();
  const { listingId } = await params;
  const parsed = querySchema.safeParse({
    listingId,
    quantity: request.nextUrl.searchParams.get('quantity'),
  });
  if (!parsed.success) return bffValidationError(parsed.error);
  if (!(await getCurrentUserId())) return bffUserNotSelected();
  return bffCall(() =>
    getListingQuote(apiFetch, parsed.data.listingId, parsed.data.quantity, {
      signal: request.signal, // trình duyệt huỷ (đổi số lượng) → huỷ request tới api
    }),
  );
}
