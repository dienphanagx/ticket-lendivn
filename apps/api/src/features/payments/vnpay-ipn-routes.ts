import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { PaymentSource } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { childLoggerWithoutQuery } from '../../lib/logger.js';
import { ORDER_ERRORS } from '../orders/errors.js';
import { PAYMENT_ERRORS } from './errors.js';
import { PaymentRecorder, RecordResult } from './payment-recorder.js';
import { verifyVnpaySignature } from './vnpay-signature.js';
import { toVerifiedPayment, vnpayResultSchema } from './vnpay.js';

// IPN VNPay (spec api § D Nhận Thông Báo Thanh Toán): luôn HTTP 200 + `{ RspCode, Message }` theo giao
// thức cổng, thay cho envelope lỗi chuẩn (specs/architecture.md § API Conventions → Response).

/** `RspCode` + `Message` theo tài liệu IPN của VNPay; cổng gửi lại khi nhận mã khác `00` / `02`. */
export const IPN_RESPONSES = {
  CONFIRMED: { RspCode: '00', Message: 'Confirm Success' },
  ORDER_NOT_FOUND: { RspCode: '01', Message: 'Order not found' },
  ALREADY_CONFIRMED: { RspCode: '02', Message: 'Order already confirmed' },
  INVALID_AMOUNT: { RspCode: '04', Message: 'Invalid amount' },
  INVALID_SIGNATURE: { RspCode: '97', Message: 'Invalid signature' },
  INVALID_REQUEST: { RspCode: '99', Message: 'Invalid request' },
  UNKNOWN_ERROR: { RspCode: '99', Message: 'Unknown error' },
} as const;

const HTTP_OK = 200;

const ipnResponseSchema = z.object({ RspCode: z.string(), Message: z.string() });

/** Lỗi nghiệp vụ đã biết từ `PaymentRecorder` → mã cổng; còn lại là lỗi hệ thống → `99` để cổng gửi lại. */
const RESPONSE_BY_ERROR_CODE: Readonly<
  Record<string, (typeof IPN_RESPONSES)[keyof typeof IPN_RESPONSES]>
> = {
  [ORDER_ERRORS.NOT_FOUND.code]: IPN_RESPONSES.ORDER_NOT_FOUND,
  [PAYMENT_ERRORS.AMOUNT_MISMATCH.code]: IPN_RESPONSES.INVALID_AMOUNT,
};

export interface VnpayIpnRoutesOptions {
  db: Database;
  /** `VNPAY_HASH_SECRET`; thiếu = chưa cấu hình cổng → mọi IPN trả `97`. */
  hashSecret: string | undefined;
}

/** `GET /v1/payments/vnpay/ipn`: chữ ký → dạng trường → mã đơn → số tiền → ghi nhận (gồm chống trùng). */
export const vnpayIpnRoutes: FastifyPluginCallbackZod<VnpayIpnRoutesOptions> = (
  app,
  { db, hashSecret },
  done,
) => {
  const recorder = new PaymentRecorder(db);

  // Error handler riêng của plugin: lỗi từ ghi nhận vẫn trả HTTP 200 + RspCode, không qua envelope chuẩn
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof AppError ? RESPONSE_BY_ERROR_CODE[error.code] : undefined;
    if (known === undefined) {
      request.log.error({ err: error, context: 'vnpay.ipn' }, 'ipn processing failed');
    }
    return reply.status(HTTP_OK).send(known ?? IPN_RESPONSES.UNKNOWN_ERROR);
  });

  app.get(
    '/v1/payments/vnpay/ipn',
    {
      childLoggerFactory: childLoggerWithoutQuery,
      schema: { response: { [HTTP_OK]: ipnResponseSchema } },
    },
    async (request) => {
      // Không tin dữ liệu nào trước khi chữ ký hợp lệ: verify trên query thô, trước mọi đọc DB
      if (!verifyVnpaySignature(request.query, hashSecret)) {
        request.log.warn(
          {
            event: 'payment.rejected',
            metadata: {
              source: PaymentSource.IPN,
              reason: hashSecret === undefined ? 'gateway_not_configured' : 'invalid_signature',
            },
          },
          'payment rejected',
        );
        return IPN_RESPONSES.INVALID_SIGNATURE;
      }
      const parsed = vnpayResultSchema.safeParse(request.query);
      if (!parsed.success) {
        request.log.warn(
          {
            event: 'payment.rejected',
            metadata: {
              source: PaymentSource.IPN,
              reason: 'invalid_fields',
              fields: parsed.error.issues.map((issue) => issue.path.join('.')),
            },
          },
          'payment rejected',
        );
        return IPN_RESPONSES.INVALID_REQUEST;
      }
      const outcome = await recorder.record(
        toVerifiedPayment(parsed.data, PaymentSource.IPN),
        request.log,
      );
      return outcome.result === RecordResult.RECORDED
        ? IPN_RESPONSES.CONFIRMED
        : IPN_RESPONSES.ALREADY_CONFIRMED;
    },
  );
  done();
};
