import type { FastifyBaseLogger } from 'fastify';

import { AppError } from '../../lib/app-error.js';
import type { PaymentRecorder } from './payment-recorder.js';
import { QuerydrStatus, type QuerydrClient, type QuerydrOrder } from './vnpay-querydr.js';

// Tra cứu cổng cho đơn đang chờ khi xem đơn (spec api § C Xem Trạng Thái Đơn Hàng): lời gọi cổng nằm
// ngoài transaction DB; chỉ kết quả cuối đã xác thực mới đi vào `PaymentRecorder.record()`.

const QUERYDR_FAILED_EVENT = 'querydr.failed';

/**
 * Trả `true` khi kết quả cuối đã qua `record()` (`RECORDED` hoặc `DUPLICATE`): trạng thái trong DB có
 * thể đã khác bản caller đọc trước lời gọi cổng → caller đọc lại đơn. Không throw: lỗi cổng hoặc lỗi
 * ghi nhận đều coi là tra cứu lỗi, đơn giữ trạng thái hiện tại (spec api § C Xem Trạng Thái Đơn Hàng).
 */
export type PaymentStatusSync = (order: QuerydrOrder, log: FastifyBaseLogger) => Promise<boolean>;

export function createPaymentStatusSync(
  recorder: PaymentRecorder,
  query: QuerydrClient,
): PaymentStatusSync {
  return async (order, log) => {
    const result = await query(order);
    if (result.status === QuerydrStatus.FAILED) {
      log.warn(
        {
          event: QUERYDR_FAILED_EVENT,
          entityId: order.orderId,
          metadata: { reason: result.reason, httpStatus: result.httpStatus },
          ...(result.error !== undefined && { err: result.error }),
        },
        'querydr failed',
      );
      return false;
    }
    if (result.status === QuerydrStatus.NOT_FINAL) {
      log.debug(
        {
          event: 'querydr.pending',
          entityId: order.orderId,
          metadata: {
            responseCode: result.responseCode,
            transactionStatus: result.transactionStatus,
          },
        },
        'querydr has no final result',
      );
      return false;
    }
    try {
      // DUPLICATE: IPN / return đã ghi nhận trong lúc chờ cổng → vẫn phải đọc lại trạng thái thật
      await recorder.record(result.payment, log);
      return true;
    } catch (err) {
      if (!(err instanceof AppError)) {
        // Lỗi DB / xung đột lặp lại: transaction đã rollback, không đổi dữ liệu
        log.error(
          { event: QUERYDR_FAILED_EVENT, entityId: order.orderId, err },
          'querydr result could not be recorded',
        );
        return false;
      }
      // Sai số tiền / không có đơn: `record()` đã log `payment.rejected`, đơn không đổi
      log.warn(
        { event: QUERYDR_FAILED_EVENT, entityId: order.orderId, metadata: { reason: err.code } },
        'querydr result rejected',
      );
      return false;
    }
  };
}
