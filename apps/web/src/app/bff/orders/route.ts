// BFF tạo đơn (spec web § C Xác Nhận Thanh Toán): cookie → `X-User-Id`, khoá chống trùng từ trình duyệt → api
import type { NextRequest } from 'next/server';
import * as z from 'zod';

import { QUANTITY_MIN } from '@/features/listings/quantity';
import { createOrder } from '@/features/orders/api';
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

const requestSchema = z.object({
  // spec web § C Kiểm tra dữ liệu: khoá chống trùng là UUID v4 sinh ở trình duyệt
  idempotencyKey: z.uuidv4(),
  listingId: z.string().min(1).max(ENTITY_ID_MAX_LENGTH).regex(ENTITY_ID_PATTERN),
  quantity: z.int().min(QUANTITY_MIN),
});

export async function POST(request: NextRequest) {
  if (!(await isSameOrigin(request))) return bffCrossSite();
  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse({
    ...(typeof body === 'object' && body !== null ? body : {}),
    idempotencyKey: request.headers.get('idempotency-key'),
  });
  if (!parsed.success) return bffValidationError(parsed.error);
  if (!(await getCurrentUserId())) return bffUserNotSelected();
  const { idempotencyKey, listingId, quantity } = parsed.data;
  return bffCall(() => createOrder(apiFetch, { listingId, quantity }, idempotencyKey));
}
