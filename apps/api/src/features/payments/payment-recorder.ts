import type { FastifyBaseLogger } from 'fastify';

import type { Database } from '../../db/client.js';
import { EventStatus, OrderStatus, PaymentDisposition } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { paymentCapturedPosting, paymentRefundRequiredPosting } from '../ledger/postings.js';
import { postLedgerTransaction } from '../ledger/service.js';
import { ORDER_ERRORS } from '../orders/errors.js';
import { lockListingForUpdate, sumReservedQuantity } from '../orders/repository.js';
import { PAYMENT_ERRORS, PaymentRecordConflictError } from './errors.js';
import {
  findOrderPaymentRef,
  hasSuccessfulPayment,
  insertPaymentTransaction,
  isPaymentDedupViolation,
  lockEventForPayment,
  lockOrderForPayment,
  updateOrderPaymentStatus,
  type LockedPaymentOrder,
  type PaymentOrderStatus,
} from './repository.js';
import { isVnpaySuccess, toVnpayAmount, type VerifiedPayment } from './vnpay.js';

// Ghi nhận kết quả thanh toán dùng chung cho IPN, return URL, querydr (spec api § D Ghi Nhận Kết Quả
// Thanh Toán; specs/architecture.md § Các Quyết Định Kỹ Thuật → Ghi nhận thanh toán).

export const RecordResult = {
  RECORDED: 'RECORDED',
  DUPLICATE: 'DUPLICATE',
} as const;
export type RecordResult = (typeof RecordResult)[keyof typeof RecordResult];

export interface RecordOutcome {
  result: RecordResult;
  orderId: string;
  /** Trạng thái đơn sau khi ghi nhận (hoặc trạng thái hiện tại khi `DUPLICATE`). */
  status: OrderStatus;
  /** `null` khi `DUPLICATE`. */
  disposition: PaymentDisposition | null;
}

/** Quyết định cho 1 giao dịch thành công, theo trạng thái đơn / sự kiện / tồn kho lúc đã giữ khoá. */
export interface SuccessDecision {
  disposition: typeof PaymentDisposition.CAPTURED | typeof PaymentDisposition.REFUND_REQUIRED;
  /** Trạng thái đích; trùng trạng thái hiện tại = giữ nguyên (thanh toán thừa). */
  status: Exclude<PaymentOrderStatus, typeof OrderStatus.FAILED>;
  overpaid: boolean;
}

export interface SuccessContext {
  orderStatus: OrderStatus;
  eventOnSale: boolean;
  /** Số vé còn lại của tin bán không tính chính đơn này, đếm khi đã giữ khoá tin bán. */
  availableQuantity: () => Promise<number>;
  quantity: number;
}

const CAPTURE: SuccessDecision = {
  disposition: PaymentDisposition.CAPTURED,
  status: OrderStatus.PAID,
  overpaid: false,
};
const LATE_REFUND: SuccessDecision = {
  disposition: PaymentDisposition.REFUND_REQUIRED,
  status: OrderStatus.REFUND_REQUIRED,
  overpaid: false,
};

/**
 * - `PAID` / `REFUND_REQUIRED` nhận thêm giao dịch khác → giữ trạng thái, khoản thừa phải hoàn.
 * - Còn lại (`PENDING_PAYMENT` còn hạn / quá hạn, `EXPIRED`, `FAILED`): sự kiện `ON_SALE` và số vé còn
 *   lại (không tính đơn này) ≥ số lượng → `PAID`; ngược lại → `REFUND_REQUIRED`.
 *
 * Không có lối tắt "đơn còn hạn → `PAID`": hạn giữ chỗ so với `now()` = giờ BEGIN của transaction ghi
 * nhận, có thể trước lúc lấy được khoá tin bán. Trong lúc chờ khoá, đơn có thể đã quá hạn và một đơn
 * khác đã lấy chính các vé đó; chỉ phép đếm dưới khoá tin bán mới thấy (chống bán vượt).
 */
export async function decideSuccess(context: SuccessContext): Promise<SuccessDecision> {
  const { orderStatus } = context;
  if (orderStatus === OrderStatus.PAID || orderStatus === OrderStatus.REFUND_REQUIRED) {
    return { disposition: PaymentDisposition.REFUND_REQUIRED, status: orderStatus, overpaid: true };
  }
  if (!context.eventOnSale) {
    return LATE_REFUND;
  }
  return (await context.availableQuantity()) >= context.quantity ? CAPTURE : LATE_REFUND;
}

interface Locked {
  order: LockedPaymentOrder;
  eventName: string;
  eventOnSale: boolean;
  listingId: string;
  quantityTotal: number;
}

type Log = FastifyBaseLogger;

const logRejected = (log: Log, payment: VerifiedPayment, reason: string): void =>
  log.warn(
    {
      event: 'payment.rejected',
      entityId: payment.orderId,
      metadata: { source: payment.source, reason, gatewayTxnNo: payment.gatewayTxnNo },
    },
    'payment rejected',
  );

function duplicate(log: Log, payment: VerifiedPayment, status: OrderStatus): RecordOutcome {
  log.info(
    {
      event: 'payment.duplicate',
      entityId: payment.orderId,
      metadata: { source: payment.source, gatewayTxnNo: payment.gatewayTxnNo, status },
    },
    'payment already recorded',
  );
  return { result: RecordResult.DUPLICATE, orderId: payment.orderId, status, disposition: null };
}

function recorded(
  log: Log,
  payment: VerifiedPayment,
  status: OrderStatus,
  disposition: PaymentDisposition,
): RecordOutcome {
  log.info(
    {
      event: 'payment.recorded',
      entityId: payment.orderId,
      metadata: { source: payment.source, disposition, gatewayTxnNo: payment.gatewayTxnNo, status },
    },
    'payment recorded',
  );
  return { result: RecordResult.RECORDED, orderId: payment.orderId, status, disposition };
}

/**
 * Bước (0) đọc snapshot bất biến không khoá, đối chiếu số tiền; rồi khoá theo thứ tự cố định
 * `events` FOR SHARE → `listings` FOR UPDATE → `orders` FOR UPDATE (specs/database.md § Chống bán trùng).
 */
async function lockForPayment(trx: Database, payment: VerifiedPayment, log: Log): Promise<Locked> {
  const ref = await findOrderPaymentRef(trx, payment.orderId);
  if (ref === undefined) {
    logRejected(log, payment, 'order_not_found');
    throw new AppError(ORDER_ERRORS.NOT_FOUND);
  }
  if (payment.vnpAmount !== toVnpayAmount(ref.buyerTotal)) {
    logRejected(log, payment, 'amount_mismatch');
    throw new AppError(PAYMENT_ERRORS.AMOUNT_MISMATCH);
  }
  const event = await lockEventForPayment(trx, ref.eventId);
  const listing = await lockListingForUpdate(trx, ref.listingId);
  const order = await lockOrderForPayment(trx, ref.id);
  // FK của `orders` bảo đảm sự kiện / tin bán tồn tại; đơn không bao giờ bị xoá
  if (event === undefined || listing === undefined || order === undefined) {
    throw new Error(`Order ${ref.id} references missing rows`);
  }
  return {
    order,
    eventName: event.name,
    eventOnSale: event.status === EventStatus.ON_SALE,
    listingId: listing.id,
    quantityTotal: listing.quantityTotal,
  };
}

const paymentRow = (
  payment: VerifiedPayment,
  order: LockedPaymentOrder,
  disposition: PaymentDisposition,
  ledgerTransactionId: string | null,
) => ({
  order_id: order.id,
  source: payment.source,
  gateway_txn_no: payment.gatewayTxnNo,
  response_code: payment.responseCode,
  transaction_status: payment.transactionStatus,
  is_success: disposition !== PaymentDisposition.FAILED,
  // Đã đối chiếu `vnp_Amount` = `buyer_total` × 100
  amount: order.buyerTotal,
  bank_code: payment.bankCode,
  pay_date: payment.payDate,
  disposition,
  ledger_transaction_id: ledgerTransactionId,
});

async function applyFailure(
  trx: Database,
  payment: VerifiedPayment,
  { order }: Locked,
  log: Log,
): Promise<RecordOutcome> {
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    return duplicate(log, payment, order.status);
  }
  // Vé tự trả về tin bán vì đơn `FAILED` không còn được tính là giữ chỗ; không có tiền → không ghi sổ
  await updateOrderPaymentStatus(trx, order.id, OrderStatus.FAILED);
  await insertPaymentTransaction(trx, paymentRow(payment, order, PaymentDisposition.FAILED, null));
  return recorded(log, payment, OrderStatus.FAILED, PaymentDisposition.FAILED);
}

async function applySuccess(
  trx: Database,
  payment: VerifiedPayment,
  locked: Locked,
  log: Log,
): Promise<RecordOutcome> {
  const { order } = locked;
  if (await hasSuccessfulPayment(trx, payment.gatewayTxnNo)) {
    return duplicate(log, payment, order.status);
  }
  const decision = await decideSuccess({
    orderStatus: order.status,
    eventOnSale: locked.eventOnSale,
    // Đang giữ khoá tin bán; loại chính đơn này để đơn còn hạn không bị tính 2 lần, và đếm hạn giữ
    // chỗ theo giờ câu lệnh để đơn hết hạn trong lúc chờ khoá không bị tính chồng lên đơn đã lấy lại vé
    availableQuantity: async () =>
      locked.quantityTotal -
      (await sumReservedQuantity(trx, locked.listingId, {
        excludeOrderId: order.id,
        holdsAsOfStatement: true,
      })),
    quantity: order.quantity,
  });

  const posting =
    decision.disposition === PaymentDisposition.CAPTURED
      ? paymentCapturedPosting({
          gatewayTxnNo: payment.gatewayTxnNo,
          orderId: order.id,
          eventId: order.eventId,
          eventName: locked.eventName,
          sellerId: order.sellerId,
          quantity: order.quantity,
          buyerTotal: order.buyerTotal,
          sellerNet: order.sellerNet,
          platformFee: order.platformFee,
        })
      : paymentRefundRequiredPosting({
          gatewayTxnNo: payment.gatewayTxnNo,
          orderId: order.id,
          eventId: order.eventId,
          buyerId: order.buyerId,
          amount: order.buyerTotal,
        });
  const ledger = await postLedgerTransaction(trx, posting, log);
  if (!ledger.created) {
    // Lớp 3: sổ cái đã có `PAYMENT:<txn>` mà lớp 1 không thấy → rollback, ghi nhận lại 1 lần
    throw new PaymentRecordConflictError();
  }
  if (decision.status !== order.status) {
    await updateOrderPaymentStatus(trx, order.id, decision.status);
  }
  await insertPaymentTransaction(trx, paymentRow(payment, order, decision.disposition, ledger.id));
  if (decision.overpaid) {
    log.warn(
      {
        event: 'payment.overpaid',
        entityId: order.id,
        metadata: {
          source: payment.source,
          gatewayTxnNo: payment.gatewayTxnNo,
          amount: order.buyerTotal,
        },
      },
      'payment received for an already settled order',
    );
  }
  return recorded(log, payment, decision.status, decision.disposition);
}

const isRecordConflict = (err: unknown): boolean =>
  err instanceof PaymentRecordConflictError || isPaymentDedupViolation(err);

/**
 * Áp 1 kết quả thanh toán đã xác thực chữ ký vào đơn, `payment_transactions` và sổ cái trong 1
 * transaction READ COMMITTED; trả `RECORDED` / `DUPLICATE`, hoặc throw `ORDER_NOT_FOUND` /
 * `PAYMENT_AMOUNT_MISMATCH` / lỗi hệ thống (không thay đổi dữ liệu nào).
 */
export class PaymentRecorder {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async record(payment: VerifiedPayment, log: Log): Promise<RecordOutcome> {
    try {
      return await this.recordOnce(payment, log);
    } catch (err) {
      if (!isRecordConflict(err)) {
        throw err;
      }
      // Chốt UNIQUE (lớp 2–3) bắt luồng đồng thời: lần chạy lại thấy giao dịch ở lớp 1 → DUPLICATE
      log.warn(
        { event: 'payment.conflict', entityId: payment.orderId, err },
        'payment record conflict, retrying',
      );
      return this.recordOnce(payment, log);
    }
  }

  private recordOnce(payment: VerifiedPayment, log: Log): Promise<RecordOutcome> {
    return this.db
      .transaction()
      .setIsolationLevel('read committed')
      .execute(async (trx) => {
        const locked = await lockForPayment(trx, payment, log);
        return isVnpaySuccess(payment.responseCode, payment.transactionStatus)
          ? applySuccess(trx, payment, locked, log)
          : applyFailure(trx, payment, locked, log);
      });
  }
}
