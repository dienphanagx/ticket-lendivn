import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { OrderStatus, PaymentSource } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { childLoggerWithoutQuery } from '../../lib/logger.js';
import { PAYMENT_ERRORS } from './errors.js';
import { PaymentRecorder, RecordResult } from './payment-recorder.js';
import { verifyVnpaySignature } from './vnpay-signature.js';
import { toVerifiedPayment, vnpayResultSchema } from './vnpay.js';

// Return URL VNPay (spec api § D Ghi Nhận Từ Đường Quay Về): web chuyển tiếp nguyên tham số `vnp_*`
// trong body JSON; schema → chữ ký → mã đơn → số tiền → ghi nhận, cùng `PaymentRecorder` với IPN.

const returnResponseSchema = z.object({
  data: z.object({
    orderId: z.string(),
    status: z.enum(Object.values(OrderStatus)),
    result: z.enum(Object.values(RecordResult)),
  }),
});

export interface VnpayReturnRoutesOptions {
  db: Database;
  /** `VNPAY_HASH_SECRET`; thiếu = chưa cấu hình cổng → mọi lần gọi `422 PAYMENT_SIGNATURE_INVALID`. */
  hashSecret: string | undefined;
}

/** `POST /v1/payments/vnpay/return`; lỗi đi qua global handler (envelope chuẩn). */
export const vnpayReturnRoutes: FastifyPluginCallbackZod<VnpayReturnRoutesOptions> = (
  app,
  { db, hashSecret },
  done,
) => {
  const recorder = new PaymentRecorder(db);

  app.post(
    '/v1/payments/vnpay/return',
    {
      // Request log không ghi tham số `vnp_*` (chứa `vnp_TmnCode`)
      childLoggerFactory: childLoggerWithoutQuery,
      schema: { body: vnpayResultSchema, response: { 200: returnResponseSchema } },
    },
    async (request) => {
      // Schema chỉ kiểm dạng, không transform: verify chữ ký trên đúng body đã nhận
      if (!verifyVnpaySignature(request.body, hashSecret)) {
        request.log.warn(
          {
            event: 'payment.rejected',
            entityId: request.body.vnp_TxnRef,
            metadata: {
              source: PaymentSource.RETURN_URL,
              reason: hashSecret === undefined ? 'gateway_not_configured' : 'invalid_signature',
            },
          },
          'payment rejected',
        );
        throw new AppError(PAYMENT_ERRORS.SIGNATURE_INVALID);
      }
      const outcome = await recorder.record(
        toVerifiedPayment(request.body, PaymentSource.RETURN_URL),
        request.log,
      );
      return {
        data: { orderId: outcome.orderId, status: outcome.status, result: outcome.result },
      };
    },
  );
  done();
};
