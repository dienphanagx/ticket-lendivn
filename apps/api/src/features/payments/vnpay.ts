import * as z from 'zod';

import type { PaymentSource } from '../../db/enums.js';

// Giao thức VNPay dùng chung cho IPN, return URL, querydr (spec api § D Thanh Toán).

/** `vnp_ResponseCode` / `vnp_TransactionStatus` của giao dịch thành công. */
export const VNPAY_SUCCESS_CODE = '00';
/** `vnp_Amount` = VND × 100 theo đơn vị của cổng. */
const VNPAY_AMOUNT_MULTIPLIER = 100;
const GMT7_OFFSET_HOURS = 7;
const MS_PER_HOUR = 60 * 60 * 1000;
// `YYYY-MM-DDTHH:mm:ss` của ISO → bỏ `-`, `T`, `:`
const ISO_SECONDS_END = 19;
const ISO_DATE_SEPARATORS = /[-T:]/g;

const ORDER_REF_PATTERN = /^[A-Za-z0-9]+$/;
const ORDER_REF_MIN_LENGTH = 12;
const ORDER_REF_MAX_LENGTH = 20;
// Số nguyên dương ≤ 15 chữ số: luôn < 2^53 nên đọc ra `number` không mất chính xác
const VNPAY_AMOUNT_PATTERN = /^[1-9][0-9]{0,14}$/;
const TWO_DIGIT_CODE_PATTERN = /^[0-9]{2}$/;
const TRANSACTION_NO_PATTERN = /^[0-9]{1,20}$/;
const BANK_CODE_MAX_LENGTH = 20;
const SECURE_HASH_PATTERN = /^[0-9a-fA-F]{128}$/;
// `yyyyMMddHHmmss` theo GMT+7
const VNPAY_DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

const ORDER_INFO_PREFIX = 'Thanh toan don';

/** `vnp_OrderInfo`: chỉ chữ Latin không dấu, chữ số, dấu cách (mã đơn đã là `[A-Za-z0-9]`). */
export const buildOrderInfo = (orderId: string): string => `${ORDER_INFO_PREFIX} ${orderId}`;

/** Thành công khi đồng thời mã phản hồi và trạng thái giao dịch = `00`; mọi tổ hợp khác là thất bại. */
export const isVnpaySuccess = (responseCode: string, transactionStatus: string): boolean =>
  responseCode === VNPAY_SUCCESS_CODE && transactionStatus === VNPAY_SUCCESS_CODE;

/** VND → đơn vị `vnp_Amount`; throw nếu vượt safe integer thay vì làm tròn im lặng. */
export function toVnpayAmount(vnd: number): number {
  const amount = vnd * VNPAY_AMOUNT_MULTIPLIER;
  if (!Number.isSafeInteger(vnd) || !Number.isSafeInteger(amount)) {
    throw new RangeError('VND amount outside safe integer range');
  }
  return amount;
}

/** `yyyyMMddHHmmss` GMT+7 → `Date` (UTC); ngày giờ không tồn tại (vd tháng 13) → `undefined`. */
export function parseVnpayDate(value: string): Date | undefined {
  const match = VNPAY_DATE_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const roundTrips =
    local.getUTCFullYear() === year &&
    local.getUTCMonth() === month - 1 &&
    local.getUTCDate() === day &&
    local.getUTCHours() === hour &&
    local.getUTCMinutes() === minute &&
    local.getUTCSeconds() === second;
  if (!roundTrips) {
    return undefined;
  }
  return new Date(Date.UTC(year, month - 1, day, hour - GMT7_OFFSET_HOURS, minute, second));
}

/** `Date` → `yyyyMMddHHmmss` theo GMT+7 (bỏ phần lẻ giây), định dạng thời gian gửi cổng. */
export function formatVnpayDate(date: Date): string {
  const gmt7 = new Date(date.getTime() + GMT7_OFFSET_HOURS * MS_PER_HOUR);
  return gmt7.toISOString().slice(0, ISO_SECONDS_END).replace(ISO_DATE_SEPARATORS, '');
}

/** Cổng có thể gửi `vnp_BankCode=` / `vnp_PayDate=` rỗng → coi như không gửi. */
const blankToNull = (value: string | undefined): string | null =>
  value === undefined || value === '' ? null : value;

/**
 * Trường kết quả thanh toán ở dạng chuỗi nguyên văn (spec api § D Nhận Thông Báo Thanh Toán → Kiểm tra
 * dữ liệu). Không transform: return URL dùng làm schema body rồi verify chữ ký trên chính body đó.
 * `looseObject`: các tham số `vnp_*` khác vẫn được ký nhưng không dùng.
 */
export const vnpayResultSchema = z.looseObject({
  vnp_TxnRef: z
    .string()
    .min(ORDER_REF_MIN_LENGTH)
    .max(ORDER_REF_MAX_LENGTH)
    .regex(ORDER_REF_PATTERN),
  vnp_Amount: z.string().regex(VNPAY_AMOUNT_PATTERN),
  vnp_ResponseCode: z.string().regex(TWO_DIGIT_CODE_PATTERN),
  vnp_TransactionStatus: z.string().regex(TWO_DIGIT_CODE_PATTERN),
  vnp_TransactionNo: z.string().regex(TRANSACTION_NO_PATTERN),
  vnp_SecureHash: z.string().regex(SECURE_HASH_PATTERN),
  vnp_BankCode: z.string().max(BANK_CODE_MAX_LENGTH).optional(),
  vnp_PayDate: z
    .string()
    .refine((value) => value === '' || parseVnpayDate(value) !== undefined, {
      message: 'Pay date must be yyyyMMddHHmmss (GMT+7)',
    })
    .optional(),
});

export type VnpayResult = z.output<typeof vnpayResultSchema>;

/** Kết quả thanh toán đã xác thực chữ ký, đầu vào chung của `PaymentRecorder.record()`. */
export interface VerifiedPayment {
  source: PaymentSource;
  /** `vnp_TxnRef` = mã đơn. */
  orderId: string;
  /** `vnp_TransactionNo`: khoá chống trùng của giao dịch thành công. */
  gatewayTxnNo: string;
  responseCode: string;
  transactionStatus: string;
  /** `vnp_Amount` nguyên văn (VND × 100), đối chiếu với `buyer_total` trước khi ghi nhận. */
  vnpAmount: number;
  bankCode: string | null;
  payDate: Date | null;
}

export function toVerifiedPayment(result: VnpayResult, source: PaymentSource): VerifiedPayment {
  const payDate = blankToNull(result.vnp_PayDate);
  return {
    source,
    orderId: result.vnp_TxnRef,
    gatewayTxnNo: result.vnp_TransactionNo,
    responseCode: result.vnp_ResponseCode,
    transactionStatus: result.vnp_TransactionStatus,
    // ≤ 15 chữ số (đã kiểm regex) nên `Number` không mất chính xác
    vnpAmount: Number(result.vnp_Amount),
    bankCode: blankToNull(result.vnp_BankCode),
    payDate: payDate === null ? null : (parseVnpayDate(payDate) ?? null),
  };
}
