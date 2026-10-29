export const PAYMENT_ERRORS = {
  AMOUNT_MISMATCH: {
    code: 'PAYMENT_AMOUNT_MISMATCH',
    message: 'Payment amount does not match order total',
    httpStatus: 422,
  },
} as const;

/**
 * Chốt chống trùng lớp 2–3 bắt được giao dịch thành công đã ghi nhận mà lớp 1 không thấy: caller
 * rollback và chạy lại ghi nhận 1 lần (specs/database.md § Chống ghi nhận trùng 3 lớp).
 */
export class PaymentRecordConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super('Payment was recorded concurrently', options);
    this.name = 'PaymentRecordConflictError';
  }
}
