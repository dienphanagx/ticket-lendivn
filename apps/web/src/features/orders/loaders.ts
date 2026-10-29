// Nạp dữ liệu trang Đơn hàng / trang kết quả (Server Component)
import 'server-only';

import { ERROR_CODES } from '@/constants/error-codes';
import { ROUTES } from '@/constants/routes';
import { listEvents } from '@/features/events/api';
import { apiFetch, apiFetchAnonymous, isApiError } from '@/lib/api/api-fetch';
import { AppError } from '@/lib/errors';

import { forwardVnpayReturn, getOrder, listOrders, type VnpayReturnParams } from './api';
import { isBuyerOf } from './scope';
import type { OrderDetail } from './types';

export type SearchParams = Record<string, string | string[] | undefined>;

const VNP_PREFIX = 'vnp_';
const VNP_SECURE_HASH = 'vnp_SecureHash';

/** Chỉ tham số có tiền tố `vnp_`, nguyên tên + giá trị (kể cả lặp key → mảng, api coi là sai chữ ký) */
export function pickVnpayParams(search: SearchParams): VnpayReturnParams | null {
  const entries = Object.entries(search).filter(
    (entry): entry is [string, string | string[]] =>
      entry[0].startsWith(VNP_PREFIX) && entry[1] !== undefined,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * Đường quay về từ VNPay (spec web § C Xem Kết Quả Thanh Toán): query có `vnp_*` → chuyển tiếp cho api
 * (chỉ khi có `vnp_SecureHash`), bỏ qua mọi kết quả / lỗi. Trả `true` = caller phải redirect về URL
 * không query, để tải lại / Back không gửi lại tham số.
 */
export async function forwardVnpayReturnIfAny(
  orderId: string,
  search: SearchParams,
): Promise<boolean> {
  const params = pickVnpayParams(search);
  if (!params) return false;
  if (!(VNP_SECURE_HASH in params)) return true;
  try {
    // Ghi nhận theo chữ ký cổng, không theo tài khoản đang chọn → không gắn X-User-Id
    await forwardVnpayReturn(apiFetchAnonymous, params);
  } catch (err) {
    // 422 chữ ký / số tiền, 404, mạng, timeout 15 giây: api đã log lý do; không log tham số (`vnp_TmnCode`)
    const code = err instanceof AppError ? err.code : 'UNEXPECTED';
    console.warn('VNPay return forward was not recorded', { orderId, code });
  }
  return true;
}

export type OrderResultData = { order: OrderDetail; eventHref: string };

/** Trang sự kiện của đơn; order detail của api không có slug → tra trong danh sách sự kiện */
async function findEventHref(eventId: string): Promise<string> {
  try {
    const { data } = await listEvents(apiFetchAnonymous);
    const event = data.find((e) => e.id === eventId);
    return event ? ROUTES.EVENT(event.slug) : ROUTES.HOME;
  } catch {
    return ROUTES.HOME; // chỉ là đích của 1 nút, không làm hỏng trang kết quả
  }
}

/** null = không tìm thấy trong phạm vi xem (không tồn tại hoặc không do `userId` mua) → 404 */
export async function loadOrderResult(
  orderId: string,
  userId: string,
): Promise<OrderResultData | null> {
  try {
    const { data: order } = await getOrder(apiFetch, orderId);
    if (!isBuyerOf(order, userId)) return null;
    return { order, eventHref: await findEventHref(order.event.id) };
  } catch (err) {
    if (isApiError(err, ERROR_CODES.ORDER_NOT_FOUND)) return null;
    throw err; // lỗi hệ thống / timeout → error.tsx
  }
}

/** `USER_NOT_FOUND` = cookie trỏ tới tài khoản không còn (dữ liệu mẫu nạp lại) → null */
export async function loadOrderList(userId: string, page: number) {
  try {
    return await listOrders(apiFetch, userId, page);
  } catch (err) {
    if (isApiError(err, ERROR_CODES.USER_NOT_FOUND)) return null;
    throw err;
  }
}
