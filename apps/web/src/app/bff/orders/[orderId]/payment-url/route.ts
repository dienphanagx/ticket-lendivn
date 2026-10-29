// BFF lấy URL thanh toán VNPay cho đơn vừa tạo; `clientIp` lấy từ header request, không tin body trình duyệt
import type { NextRequest } from 'next/server';

import { createPaymentUrl, getOrder } from '@/features/orders/api';
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
import { getClientIp } from '@/lib/client-ip';
import { getCurrentUserId } from '@/lib/current-user';
import * as z from '@/lib/zod-mini';

const paramsSchema = z.object({ orderId: orderIdSchema });

export async function POST(
  request: NextRequest,
  { params }: RouteContext<'/bff/orders/[orderId]/payment-url'>,
) {
  if (!(await isSameOrigin(request))) return bffCrossSite();
  const parsed = z.safeParse(paramsSchema, await params);
  if (!parsed.success) return bffValidationError(parsed.error);
  // Thanh toán là hành động cần tài khoản (spec web § Quy Tắc Chung)
  const userId = await getCurrentUserId();
  if (!userId) return bffUserNotSelected();
  const { orderId } = parsed.data;
  const clientIp = getClientIp(request.headers);
  return bffCall(async () => {
    // api payment-url không kiểm người mua: đổi tài khoản giữa 2 lời gọi BFF → không cấp URL cho
    // tài khoản khác (đơn mới chưa có URL nên GET này không kích querydr)
    const { data } = await getOrder(apiFetch, orderId);
    if (!isBuyerOf(data, userId)) throw orderNotFound();
    return createPaymentUrl(apiFetch, orderId, clientIp);
  });
}
