import { randomInt } from 'node:crypto';

import type { Order } from '../../src/db/types.js';
import { signVnpayParams } from '../../src/features/payments/vnpay-signature.js';

/** Khoá bí mật giả cố định của test, không phải khoá VNPay thật. */
export const TEST_HASH_SECRET = 'TEST_HASH_SECRET_NOT_REAL_0123456789';
export const IPN_URL = '/api/v1/payments/vnpay/ipn';

const TXN_NO_MIN = 10_000_000;
const TXN_NO_MAX = 99_999_999;
const VNPAY_AMOUNT_MULTIPLIER = 100;

/** Mã giao dịch cổng ngẫu nhiên 8 chữ số, đủ khác nhau giữa các test. */
export const buildTxnNo = (): string => String(randomInt(TXN_NO_MIN, TXN_NO_MAX));

export type VnpParams = Record<string, string>;

/** Tham số kết quả thanh toán thành công đúng số tiền của đơn (chưa ký). */
export const buildVnpParams = (
  order: Pick<Order, 'id' | 'buyer_total'>,
  overrides: VnpParams = {},
): VnpParams => ({
  vnp_TmnCode: 'TESTTMN1',
  vnp_TxnRef: order.id,
  vnp_Amount: String(order.buyer_total * VNPAY_AMOUNT_MULTIPLIER),
  vnp_OrderInfo: `Thanh toan don ${order.id}`,
  vnp_ResponseCode: '00',
  vnp_TransactionStatus: '00',
  vnp_TransactionNo: buildTxnNo(),
  vnp_BankCode: 'NCB',
  vnp_PayDate: '20261029153000',
  ...overrides,
});

/** Ký như cổng: thêm `vnp_SecureHash` (và `vnp_SecureHashType` không thuộc chuỗi ký). */
export const signParams = (params: VnpParams, secret: string = TEST_HASH_SECRET): VnpParams => ({
  ...params,
  vnp_SecureHashType: 'HmacSHA512',
  vnp_SecureHash: signVnpayParams(params, secret),
});

/** URL IPN với query encode kiểu `URLSearchParams` (khoảng trắng → `+`). */
export const ipnUrl = (params: VnpParams): string =>
  `${IPN_URL}?${new URLSearchParams(params).toString()}`;
