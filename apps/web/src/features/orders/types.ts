// Shape theo response schema của api (không OpenAPI — specs/architecture.md § API Conventions):
// apps/api/src/features/orders/routes.ts (`orderSnapshotSchema`, `orderSummarySchema`, `orderDetailSchema`),
// payments/payment-url-routes.ts, payments/vnpay-return-routes.ts. Parse ở cả BFF lẫn trình duyệt → zod/mini
import { pageMetaSchema } from '@/lib/pagination';
import * as z from '@/lib/zod-mini';

export const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUND_REQUIRED: 'REFUND_REQUIRED',
} as const;

const orderStatusSchema = z.enum([
  ORDER_STATUS.PENDING_PAYMENT,
  ORDER_STATUS.PAID,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.EXPIRED,
  ORDER_STATUS.REFUND_REQUIRED,
]);

const personSchema = z.object({ id: z.string(), displayName: z.string() });

/** `POST /v1/orders` → `{ data }` */
export const orderSnapshotSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  listingId: z.string(),
  eventId: z.string(),
  quantity: z.int(),
  unitPrice: z.int(),
  subtotal: z.int(),
  buyerFee: z.int(),
  buyerTotal: z.int(),
  createdAt: z.iso.datetime(),
  holdExpiresAt: z.iso.datetime(),
});

const orderSummaryShape = {
  id: z.string(),
  status: orderStatusSchema,
  event: z.object({ id: z.string(), name: z.string() }),
  seller: personSchema,
  buyer: personSchema,
  quantity: z.int(),
  buyerTotal: z.int(),
  createdAt: z.iso.datetime(),
  holdExpiresAt: z.iso.datetime(),
  paidAt: z.nullable(z.iso.datetime()),
};

/** 1 dòng của `GET /v1/orders` */
export const orderSummarySchema = z.object(orderSummaryShape);

/**
 * `GET /v1/orders/:orderId`; bỏ `paymentUrl` (spec web § C: không có "tiếp tục thanh toán"),
 * object của zod loại field ngoài schema nên BFF không chuyển nó cho trình duyệt.
 */
export const orderDetailSchema = z.object({
  ...orderSummaryShape,
  listingId: z.string(),
  unitPrice: z.int(),
  subtotal: z.int(),
  buyerFee: z.int(),
  refundAmount: z.nullable(z.int()),
  retryAfterSeconds: z.nullable(z.int().check(z.positive())),
});

export const orderSnapshotResponseSchema = z.object({ data: orderSnapshotSchema });
export const orderDetailResponseSchema = z.object({ data: orderDetailSchema });
export const orderListResponseSchema = z.object({
  data: z.array(orderSummarySchema),
  meta: pageMetaSchema,
});

/** URL chỉ http(s): trình duyệt `window.location.assign()` thẳng giá trị này */
export const paymentUrlResponseSchema = z.object({
  data: z.object({ paymentUrl: z.httpUrl(), expiresAt: z.iso.datetime() }),
});

/** `POST /v1/payments/vnpay/return` — web không dùng kết quả, chỉ cần parse được */
export const vnpayReturnResponseSchema = z.object({
  data: z.object({ orderId: z.string(), status: orderStatusSchema, result: z.string() }),
});

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderSnapshot = z.infer<typeof orderSnapshotSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type OrderDetail = z.infer<typeof orderDetailSchema>;

// Mã đơn trên URL (spec web § C Xem Kết Quả Thanh Toán), khớp `orderIdSchema` của api
export const orderIdSchema = z
  .string()
  .check(z.minLength(12), z.maxLength(20), z.regex(/^[A-Za-z0-9]+$/));

export const isOrderId = (value: unknown): value is string =>
  z.safeParse(orderIdSchema, value).success;

export const ORDER_LIST_LIMIT = 20; // spec web § D Xem Danh Sách Đơn Hàng: `limit` 20

export type CreateOrderBody = { listingId: string; quantity: number };
