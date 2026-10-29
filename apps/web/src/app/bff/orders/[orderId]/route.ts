// BFF hỏi lại trạng thái đơn (trang kết quả, TanStack Query); đơn không do tài khoản đang chọn mua → 404
import type { NextRequest } from 'next/server';

import { getOrder } from '@/features/orders/api';
import { isBuyerOf, orderNotFound } from '@/features/orders/scope';
import { orderIdSchema } from '@/features/orders/types';
import { apiFetch } from '@/lib/api/api-fetch';
import {
  bffCall,
  bffCrossSite,
  bffUserNotSelected,
  bffValidationError,
} from '@/lib/api/bff-response';
import { isSameOrigin } from '@/lib/api/same-origin';
import { getCurrentUserId } from '@/lib/current-user';
import * as z from '@/lib/zod-mini';

const paramsSchema = z.object({ orderId: orderIdSchema });

export async function GET(request: NextRequest, { params }: RouteContext<'/bff/orders/[orderId]'>) {
  if (!(await isSameOrigin(request))) return bffCrossSite();
  const parsed = z.safeParse(paramsSchema, await params);
  if (!parsed.success) return bffValidationError(parsed.error);
  const userId = await getCurrentUserId();
  if (!userId) return bffUserNotSelected();
  return bffCall(async () => {
    const body = await getOrder(apiFetch, parsed.data.orderId, { signal: request.signal });
    if (!isBuyerOf(body.data, userId)) throw orderNotFound();
    return body;
  });
}
