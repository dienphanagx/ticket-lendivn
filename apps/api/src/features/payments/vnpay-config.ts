import type { Env } from '../../config/env.js';

// Cấu hình VNPay theo từng lời gọi cổng; thiếu biến nào thì phần đó coi như chưa cấu hình, api vẫn chạy
// (specs/architecture.md § Dịch Vụ Ngoài).

export type VnpayEnv = Pick<
  Env,
  | 'VNPAY_TMN_CODE'
  | 'VNPAY_HASH_SECRET'
  | 'VNPAY_PAYMENT_URL'
  | 'VNPAY_QUERY_URL'
  | 'VNPAY_RETURN_URL_BASE'
>;

export interface PaymentUrlGateway {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrlBase: string;
}

export interface QuerydrGateway {
  tmnCode: string;
  hashSecret: string;
  queryUrl: string;
}

/** Đủ mã merchant, khoá bí mật, URL cổng, URL quay về; thiếu 1 → `undefined` (`503`). */
export function resolvePaymentUrlGateway(env: Partial<VnpayEnv>): PaymentUrlGateway | undefined {
  const {
    VNPAY_TMN_CODE: tmnCode,
    VNPAY_HASH_SECRET: hashSecret,
    VNPAY_PAYMENT_URL: paymentUrl,
    VNPAY_RETURN_URL_BASE: returnUrlBase,
  } = env;
  if (!tmnCode || !hashSecret || !paymentUrl || !returnUrlBase) {
    return undefined;
  }
  return { tmnCode, hashSecret, paymentUrl, returnUrlBase };
}

/** Đủ mã merchant, khoá bí mật, URL `querydr`; thiếu 1 → `undefined` (bỏ qua tra cứu). */
export function resolveQuerydrGateway(env: Partial<VnpayEnv>): QuerydrGateway | undefined {
  const { VNPAY_TMN_CODE: tmnCode, VNPAY_HASH_SECRET: hashSecret, VNPAY_QUERY_URL: queryUrl } = env;
  if (!tmnCode || !hashSecret || !queryUrl) {
    return undefined;
  }
  return { tmnCode, hashSecret, queryUrl };
}
