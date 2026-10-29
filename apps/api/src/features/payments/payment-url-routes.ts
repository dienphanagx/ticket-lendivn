import { isIP } from 'node:net';

import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { orderIdSchema } from '../orders/order-id.js';
import { getOrCreatePaymentUrl, PaymentLocale } from './payment-url.js';
import type { PaymentUrlGateway } from './vnpay-config.js';

const CLIENT_IP_MAX_LENGTH = 45;
const NOT_AN_IP = 0;

const clientIpSchema = z
  .string()
  .max(CLIENT_IP_MAX_LENGTH)
  .refine((value) => isIP(value) !== NOT_AN_IP, {
    message: 'Client IP must be an IPv4 or IPv6 address',
  });

export interface PaymentUrlRoutesOptions {
  db: Database;
  /** `undefined` = thiếu cấu hình cổng → `503 PAYMENT_GATEWAY_UNAVAILABLE`. */
  gateway: PaymentUrlGateway | undefined;
}

/** `POST /v1/orders/:orderId/payment-url` (spec api § D Tạo URL Thanh Toán). */
export const paymentUrlRoutes: FastifyPluginCallbackZod<PaymentUrlRoutesOptions> = (
  app,
  { db, gateway },
  done,
) => {
  app.post(
    '/v1/orders/:orderId/payment-url',
    {
      schema: {
        params: z.object({ orderId: orderIdSchema }),
        body: z.object({
          clientIp: clientIpSchema,
          locale: z.enum([PaymentLocale.VN, PaymentLocale.EN]).default(PaymentLocale.VN),
        }),
        response: {
          200: z.object({
            data: z.object({ paymentUrl: z.string(), expiresAt: z.iso.datetime() }),
          }),
        },
      },
    },
    async (request) => {
      const result = await getOrCreatePaymentUrl(db, gateway, {
        orderId: request.params.orderId,
        clientIp: request.body.clientIp,
        locale: request.body.locale,
      });
      return {
        data: { paymentUrl: result.paymentUrl, expiresAt: result.expiresAt.toISOString() },
      };
    },
  );
  done();
};
