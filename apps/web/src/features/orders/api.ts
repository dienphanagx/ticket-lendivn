import { BFF_ROUTES } from '@/constants/routes';
import type { Http } from '@/lib/errors';

import {
  ORDER_LIST_LIMIT,
  orderDetailResponseSchema,
  orderListResponseSchema,
  orderSnapshotResponseSchema,
  paymentUrlResponseSchema,
  vnpayReturnResponseSchema,
  type CreateOrderBody,
} from './types';

const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Locale trang thanh toán VNPay (body `payment-url` của api: `vn` | `en`)
export const PAYMENT_LOCALE = 'vn';

const orderPath = (orderId: string) => `/v1/orders/${encodeURIComponent(orderId)}`;

const withKey = (idempotencyKey: string) => ({
  ...JSON_HEADERS,
  [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
});

// ── Server → api ──────────────────────────────────────────────────────────

/** `POST /v1/orders` (cần `X-User-Id` + `Idempotency-Key`) */
export const createOrder = (http: Http, body: CreateOrderBody, idempotencyKey: string) =>
  http('/v1/orders', orderSnapshotResponseSchema, {
    method: 'POST',
    headers: withKey(idempotencyKey),
    body: JSON.stringify(body),
  });

/** `POST /v1/orders/:orderId/payment-url` */
export const createPaymentUrl = (http: Http, orderId: string, clientIp: string) =>
  http(`${orderPath(orderId)}/payment-url`, paymentUrlResponseSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ clientIp, locale: PAYMENT_LOCALE }),
  });

/** `GET /v1/orders/:orderId` — public: phạm vi xem (người mua = tài khoản đang chọn) do web kiểm */
export const getOrder = (http: Http, orderId: string, init?: RequestInit) =>
  http(orderPath(orderId), orderDetailResponseSchema, init);

/** `GET /v1/orders?buyerId=&page=&limit=` */
export const listOrders = (http: Http, buyerId: string, page: number) => {
  const query = new URLSearchParams({
    buyerId,
    page: String(page),
    limit: String(ORDER_LIST_LIMIT),
  });
  return http(`/v1/orders?${query.toString()}`, orderListResponseSchema);
};

/** Tham số `vnp_*` của đường quay về, giữ nguyên tên + giá trị nhận được */
export type VnpayReturnParams = Record<string, string | string[]>;

/** `POST /v1/payments/vnpay/return` — body JSON là các tham số `vnp_*` */
export const forwardVnpayReturn = (http: Http, params: VnpayReturnParams) =>
  http('/v1/payments/vnpay/return', vnpayReturnResponseSchema, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  });

// ── Trình duyệt → BFF (route.ts cùng path) ────────────────────────────────

export const createOrderViaBff = (http: Http, body: CreateOrderBody, idempotencyKey: string) =>
  http(BFF_ROUTES.ORDERS, orderSnapshotResponseSchema, {
    method: 'POST',
    headers: withKey(idempotencyKey),
    body: JSON.stringify(body),
  });

export const createPaymentUrlViaBff = (http: Http, orderId: string) =>
  http(BFF_ROUTES.ORDER_PAYMENT_URL(orderId), paymentUrlResponseSchema, { method: 'POST' });

export const getOrderViaBff = (http: Http, orderId: string, init?: RequestInit) =>
  http(BFF_ROUTES.ORDER(orderId), orderDetailResponseSchema, init);
