// Lỗi khi bấm "Thanh toán" → câu + việc cần làm (spec web § C Xác Nhận Thanh Toán → Trường hợp ngoại lệ)
import { ERROR_CODES } from '@/constants/error-codes';
import { ACCOUNT_MESSAGES, CHECKOUT_MESSAGES } from '@/constants/messages';
import { getErrorMessage, SOLD_OUT_MESSAGE } from '@/lib/error-message';
import { AppError } from '@/lib/errors';

/** Bước hỏng: tạo đơn (`POST /bff/orders`) hay lấy URL cổng (`POST /bff/orders/:id/payment-url`) */
export type CheckoutStage = 'order' | 'paymentUrl';

export class CheckoutError extends Error {
  override name = 'CheckoutError';
  constructor(
    readonly stage: CheckoutStage,
    readonly error: unknown,
  ) {
    super(`Checkout failed at ${stage}`);
  }
}

export type CheckoutOutcome = {
  message: string;
  /** Đóng khu chọn, câu hiện trên danh sách tin bán */
  close: boolean;
  /** Dựng lại trang (số vé còn lại, trạng thái sự kiện, tài khoản) */
  refresh: boolean;
  openAccountMenu: boolean;
  /** Khoá hiện tại gắn với đơn không còn thanh toán được → lần bấm sau tạo đơn mới */
  rotateKey: boolean;
};

const outcome = (message: string, flags: Partial<Omit<CheckoutOutcome, 'message'>> = {}) => ({
  message,
  close: false,
  refresh: false,
  openAccountMenu: false,
  rotateKey: false,
  ...flags,
});

function insufficientQuantity(err: AppError): CheckoutOutcome {
  const available = err.details?.available;
  if (typeof available !== 'number' || !Number.isInteger(available) || available < 0) {
    return outcome(getErrorMessage(err), { refresh: true });
  }
  if (available === 0) return outcome(SOLD_OUT_MESSAGE, { close: true, refresh: true });
  return outcome(CHECKOUT_MESSAGES.REMAINING(available), { refresh: true });
}

function orderStageOutcome(err: AppError): CheckoutOutcome {
  switch (err.code) {
    case ERROR_CODES.INSUFFICIENT_QUANTITY:
      return insufficientQuantity(err);
    case ERROR_CODES.EVENT_NOT_ON_SALE:
    case ERROR_CODES.LISTING_NOT_FOUND:
    case ERROR_CODES.CANNOT_BUY_OWN_LISTING:
      return outcome(getErrorMessage(err), { close: true, refresh: true });
    case ERROR_CODES.IDEMPOTENCY_KEY_REUSED:
      return outcome(CHECKOUT_MESSAGES.ORDER_NOT_CREATED, { rotateKey: true });
    default:
      // Timeout 15 giây (BFF 504), mất mạng, lỗi hệ thống: giữ khoá — đơn có thể đã được tạo
      return outcome(CHECKOUT_MESSAGES.ORDER_NOT_CREATED);
  }
}

function paymentUrlStageOutcome(err: AppError): CheckoutOutcome {
  switch (err.code) {
    // Đơn của khoá này đã hết hạn / rời trạng thái chờ → bấm lại phải tạo đơn mới
    case ERROR_CODES.ORDER_NOT_PAYABLE:
    case ERROR_CODES.ORDER_NOT_FOUND:
      return outcome(CHECKOUT_MESSAGES.ORDER_NOT_CREATED, { rotateKey: true, refresh: true });
    default:
      // 503 PAYMENT_GATEWAY_UNAVAILABLE, timeout, mất mạng: đơn vẫn giữ chỗ tới khi hết hạn;
      // bấm lại cùng khoá → api trả lại đúng đơn đó, không giữ chỗ thêm
      return outcome(CHECKOUT_MESSAGES.GATEWAY_UNREACHABLE);
  }
}

export function resolveCheckoutError(failure: CheckoutError): CheckoutOutcome {
  const err = failure.error instanceof AppError ? failure.error : null;
  if (err?.code === ERROR_CODES.USER_NOT_SELECTED) {
    return outcome(ACCOUNT_MESSAGES.REQUIRED, { openAccountMenu: true });
  }
  if (err?.code === ERROR_CODES.USER_NOT_FOUND) {
    return outcome(ACCOUNT_MESSAGES.STALE, { refresh: true });
  }
  if (!err) {
    return outcome(
      failure.stage === 'order'
        ? CHECKOUT_MESSAGES.ORDER_NOT_CREATED
        : CHECKOUT_MESSAGES.GATEWAY_UNREACHABLE,
    );
  }
  return failure.stage === 'order' ? orderStageOutcome(err) : paymentUrlStageOutcome(err);
}
