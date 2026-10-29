import type { FastifyBaseLogger } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { OrderStatus } from '../../db/enums.js';
import { entityIdSchema } from '../../lib/ids.js';
import { pageMetaSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { requiredUserHeaders, resolveCurrentUser, USER_ID_HEADER } from '../users/current-user.js';
import { orderIdSchema } from './order-id.js';
import type { OrderSnapshot } from './repository.js';
import { createOrder, getOrder, listOrders, type SyncPendingPayment } from './service.js';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
const IDEMPOTENCY_KEY_MAX_LENGTH = 64;
const MIN_QUANTITY = 1;
/** Gợi ý client hỏi lại khi đơn còn chờ xác nhận (spec api § C Xem Trạng Thái Đơn Hàng). */
const RETRY_AFTER_SECONDS = 3;

const orderStatusSchema = z.enum(Object.values(OrderStatus));
const personSchema = z.object({ id: z.string(), displayName: z.string() });

const orderSnapshotSchema = z.object({
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

const orderSummarySchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  event: z.object({ id: z.string(), name: z.string() }),
  seller: personSchema,
  buyer: personSchema,
  quantity: z.int(),
  buyerTotal: z.int(),
  createdAt: z.iso.datetime(),
  holdExpiresAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
});

const orderDetailSchema = orderSummarySchema.extend({
  listingId: z.string(),
  unitPrice: z.int(),
  subtotal: z.int(),
  buyerFee: z.int(),
  refundAmount: z.int().nullable(),
  paymentUrl: z.string().nullable(),
  retryAfterSeconds: z.int().nullable(),
});

const orderSnapshotResponse = z.object({ data: orderSnapshotSchema });

type OrderView = Awaited<ReturnType<typeof getOrder>>;

const toSnapshotDto = (order: OrderSnapshot) => ({
  ...order,
  createdAt: order.createdAt.toISOString(),
  holdExpiresAt: order.holdExpiresAt.toISOString(),
});

const toSummaryDto = (order: Omit<OrderView, 'refundAmount'>) => ({
  id: order.id,
  status: order.status,
  event: { id: order.eventId, name: order.eventName },
  seller: { id: order.sellerId, displayName: order.sellerName },
  buyer: { id: order.buyerId, displayName: order.buyerName },
  quantity: order.quantity,
  buyerTotal: order.buyerTotal,
  createdAt: order.createdAt.toISOString(),
  holdExpiresAt: order.holdExpiresAt.toISOString(),
  paidAt: order.paidAt?.toISOString() ?? null,
});

function toDetailDto(order: OrderView) {
  // Đã hết hạn tại chỗ trước khi đọc, nên PENDING_PAYMENT ở đây luôn còn hạn giữ chỗ
  const pending = order.status === OrderStatus.PENDING_PAYMENT;
  return {
    ...toSummaryDto(order),
    listingId: order.listingId,
    unitPrice: order.unitPrice,
    subtotal: order.subtotal,
    buyerFee: order.buyerFee,
    refundAmount: order.status === OrderStatus.REFUND_REQUIRED ? (order.refundAmount ?? 0) : null,
    paymentUrl: pending ? order.paymentUrl : null,
    retryAfterSeconds: pending ? RETRY_AFTER_SECONDS : null,
  };
}

export interface OrderRoutesOptions {
  db: Database;
  /** Tra cứu cổng khi xem đơn chờ; `undefined` = chưa cấu hình `querydr` → bỏ qua. */
  syncPayment?: (
    order: Parameters<SyncPendingPayment>[0],
    log: FastifyBaseLogger,
  ) => Promise<boolean>;
}

/** `/v1/orders` (spec api § C Đơn Hàng); URL thanh toán ở `paymentUrlRoutes`. */
export const orderRoutes: FastifyPluginCallbackZod<OrderRoutesOptions> = (
  app,
  { db, syncPayment },
  done,
) => {
  app.post(
    '/v1/orders',
    {
      schema: {
        headers: requiredUserHeaders.extend({
          [IDEMPOTENCY_KEY_HEADER]: z
            .string()
            .min(IDEMPOTENCY_KEY_MIN_LENGTH)
            .max(IDEMPOTENCY_KEY_MAX_LENGTH)
            .regex(IDEMPOTENCY_KEY_PATTERN),
        }),
        body: z.object({ listingId: entityIdSchema, quantity: z.int().min(MIN_QUANTITY) }),
        response: { 200: orderSnapshotResponse, 201: orderSnapshotResponse },
      },
    },
    async (request, reply) => {
      const buyerId = await resolveCurrentUser(db, request.headers[USER_ID_HEADER]);
      const { order, created } = await createOrder(db, {
        buyerId,
        listingId: request.body.listingId,
        quantity: request.body.quantity,
        idempotencyKey: request.headers[IDEMPOTENCY_KEY_HEADER],
      });
      if (created) {
        request.log.info(
          {
            event: 'order.created',
            entityId: order.id,
            userId: buyerId,
            metadata: { listingId: order.listingId, quantity: order.quantity },
          },
          'order created',
        );
      }
      return reply.status(created ? 201 : 200).send({ data: toSnapshotDto(order) });
    },
  );

  app.get(
    '/v1/orders',
    {
      schema: {
        querystring: paginationQuerySchema.extend({
          buyerId: entityIdSchema.optional(),
          status: orderStatusSchema.optional(),
        }),
        response: {
          200: z.object({ data: z.array(orderSummarySchema), meta: pageMetaSchema }),
        },
      },
    },
    async (request) => {
      const { orders, meta } = await listOrders(db, request.query);
      return { data: orders.map(toSummaryDto), meta };
    },
  );

  app.get(
    '/v1/orders/:orderId',
    {
      schema: {
        params: z.object({ orderId: orderIdSchema }),
        response: { 200: z.object({ data: orderDetailSchema }) },
      },
    },
    async (request) => {
      const sync =
        syncPayment &&
        ((order: Parameters<SyncPendingPayment>[0]) => syncPayment(order, request.log));
      return { data: toDetailDto(await getOrder(db, request.params.orderId, sync)) };
    },
  );
  done();
};
