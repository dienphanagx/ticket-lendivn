import { randomBytes } from 'node:crypto';

import { PaymentSource } from '../../db/enums.js';
import { VNPAY_VERSION } from './payment-url.js';
import type { QuerydrGateway } from './vnpay-config.js';
import { hmacHex, matchesVnpayHash, VNP_SECURE_HASH } from './vnpay-signature.js';
import {
  buildOrderInfo,
  formatVnpayDate,
  toVerifiedPayment,
  VNPAY_SUCCESS_CODE,
  vnpayResultSchema,
  type VerifiedPayment,
} from './vnpay.js';

// Tra cứu `querydr` (spec api § D Tra Cứu Trạng Thái Từ Cổng): POST JSON tới `VNPAY_QUERY_URL`,
// timeout 5 giây, chữ ký request / response nối `|` theo thứ tự trường của tài liệu VNPay.

const QUERYDR_COMMAND = 'querydr';
/** Ngân sách tra cứu trong `GET /v1/orders/:orderId` (spec api § C Xem Trạng Thái Đơn Hàng). */
export const QUERYDR_TIMEOUT_MS = 5000;
/** 16 byte → 32 ký tự hex: ≤ 32 ký tự chữ và số, mới mỗi lần tra cứu. */
const REQUEST_ID_BYTES = 16;
const HEX_ENCODING = 'hex';
const SIGN_SEPARATOR = '|';
/** `vnp_IpAddr` của querydr là IP máy chủ gọi API (không phải IP người mua). */
const SERVER_IP = '127.0.0.1';
const JSON_CONTENT_TYPE = 'application/json';
/** `vnp_TransactionStatus` thất bại cuối cùng; `00` = thành công, mã khác chưa phải kết quả cuối. */
const TRANSACTION_FAILED_STATUS = '02';
const FINAL_TRANSACTION_STATUSES: ReadonlySet<string> = new Set([
  VNPAY_SUCCESS_CODE,
  TRANSACTION_FAILED_STATUS,
]);

const REQUEST_SIGN_FIELDS = [
  'vnp_RequestId',
  'vnp_Version',
  'vnp_Command',
  'vnp_TmnCode',
  'vnp_TxnRef',
  'vnp_TransactionDate',
  'vnp_CreateDate',
  'vnp_IpAddr',
  'vnp_OrderInfo',
] as const;

/**
 * Thứ tự trường của chuỗi ký response theo tài liệu querydr. Tài liệu VNPay định dạng lỗi ở đoạn này:
 * kiểm lại trên sandbox, lệch thì chỉ sửa danh sách này (có test riêng).
 */
export const QUERYDR_RESPONSE_SIGN_FIELDS = [
  'vnp_ResponseId',
  'vnp_Command',
  'vnp_ResponseCode',
  'vnp_Message',
  'vnp_TmnCode',
  'vnp_TxnRef',
  'vnp_Amount',
  'vnp_BankCode',
  'vnp_PayDate',
  'vnp_TransactionNo',
  'vnp_TransactionType',
  'vnp_TransactionStatus',
  'vnp_OrderInfo',
  'vnp_PromotionCode',
  'vnp_PromotionAmount',
] as const;

type QuerydrRequestField = (typeof REQUEST_SIGN_FIELDS)[number];
export type QuerydrRequest = Record<QuerydrRequestField | typeof VNP_SECURE_HASH, string>;
type FlatResponse = Readonly<Record<string, string>>;

export const QuerydrStatus = {
  /** Giao dịch có kết quả cuối (`00` / `02`), đã xác thực → ghi nhận. */
  FINAL: 'FINAL',
  /** Cổng trả lời hợp lệ nhưng chưa có kết quả cuối (`91`, `01`, …) → không đổi đơn. */
  NOT_FINAL: 'NOT_FINAL',
  /** Mạng / timeout / response không tin được → không đổi đơn, log cảnh báo. */
  FAILED: 'FAILED',
} as const;

export const QuerydrFailure = {
  TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error',
  HTTP_STATUS: 'http_status',
  INVALID_RESPONSE: 'invalid_response',
  INVALID_SIGNATURE: 'invalid_signature',
  TXN_REF_MISMATCH: 'txn_ref_mismatch',
  INVALID_FIELDS: 'invalid_fields',
} as const;
export type QuerydrFailure = (typeof QuerydrFailure)[keyof typeof QuerydrFailure];

export type QuerydrResult =
  | { status: typeof QuerydrStatus.FINAL; payment: VerifiedPayment }
  | { status: typeof QuerydrStatus.NOT_FINAL; responseCode: string; transactionStatus: string }
  | {
      status: typeof QuerydrStatus.FAILED;
      reason: QuerydrFailure;
      httpStatus?: number;
      /** Lỗi gốc của lời gọi mạng, để log. */
      error?: unknown;
    };

export interface QuerydrOrder {
  orderId: string;
  /** `orders.vnp_create_date` đã lưu khi tạo URL, gửi làm `vnp_TransactionDate`. */
  vnpCreateDate: string;
}

export interface QuerydrDeps {
  /** Inject để test dùng cổng giả, không gọi mạng thật. */
  fetch: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  requestId?: () => string;
}

export type QuerydrClient = (order: QuerydrOrder) => Promise<QuerydrResult>;

const joinSignData = (values: readonly string[]): string => values.join(SIGN_SEPARATOR);

/** Chuỗi ký response; trường thiếu = chuỗi rỗng. */
export const buildQuerydrResponseSignData = (response: FlatResponse): string =>
  joinSignData(QUERYDR_RESPONSE_SIGN_FIELDS.map((field) => response[field] ?? ''));

export function buildQuerydrRequest(
  gateway: QuerydrGateway,
  order: QuerydrOrder,
  now: Date,
  requestId: string,
): QuerydrRequest {
  const fields: Record<QuerydrRequestField, string> = {
    vnp_RequestId: requestId,
    vnp_Version: VNPAY_VERSION,
    vnp_Command: QUERYDR_COMMAND,
    vnp_TmnCode: gateway.tmnCode,
    vnp_TxnRef: order.orderId,
    vnp_TransactionDate: order.vnpCreateDate,
    vnp_CreateDate: formatVnpayDate(now),
    vnp_IpAddr: SERVER_IP,
    vnp_OrderInfo: buildOrderInfo(order.orderId),
  };
  const signData = joinSignData(REQUEST_SIGN_FIELDS.map((field) => fields[field]));
  return { ...fields, [VNP_SECURE_HASH]: hmacHex(signData, gateway.hashSecret) };
}

/** JSON object → map chuỗi (số đổi sang chuỗi, giá trị khác bỏ qua); không phải object → `undefined`. */
function flattenResponse(body: unknown): FlatResponse | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined;
  }
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' || typeof value === 'number') {
      flat[key] = String(value);
    }
  }
  return flat;
}

const failed = (
  reason: QuerydrFailure,
  extra: { httpStatus?: number; error?: unknown } = {},
): QuerydrResult => ({ status: QuerydrStatus.FAILED, reason, ...extra });

const isTimeout = (err: unknown): boolean =>
  err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

/** Diễn giải response đã parse JSON: chỉ tin khi chữ ký hợp lệ và `vnp_TxnRef` khớp mã đơn. */
export function interpretQuerydrResponse(
  body: unknown,
  order: QuerydrOrder,
  hashSecret: string,
): QuerydrResult {
  const response = flattenResponse(body);
  if (response === undefined) {
    return failed(QuerydrFailure.INVALID_RESPONSE);
  }
  const providedHash = response[VNP_SECURE_HASH];
  if (
    providedHash === undefined ||
    !matchesVnpayHash(buildQuerydrResponseSignData(response), providedHash, hashSecret)
  ) {
    return failed(QuerydrFailure.INVALID_SIGNATURE);
  }
  const responseCode = response.vnp_ResponseCode ?? '';
  const transactionStatus = response.vnp_TransactionStatus ?? '';
  // `vnp_ResponseCode` = kết quả của lời gọi API (vd `91` chưa có giao dịch), không phải của giao dịch
  if (responseCode !== VNPAY_SUCCESS_CODE || !FINAL_TRANSACTION_STATUSES.has(transactionStatus)) {
    return { status: QuerydrStatus.NOT_FINAL, responseCode, transactionStatus };
  }
  if (response.vnp_TxnRef !== order.orderId) {
    return failed(QuerydrFailure.TXN_REF_MISMATCH);
  }
  const parsed = vnpayResultSchema.safeParse(response);
  if (!parsed.success) {
    return failed(QuerydrFailure.INVALID_FIELDS);
  }
  return {
    status: QuerydrStatus.FINAL,
    payment: toVerifiedPayment(parsed.data, PaymentSource.QUERYDR),
  };
}

/** Client `querydr`: không throw — mọi lỗi mạng / response thành `FAILED`. */
export function createQuerydrClient(gateway: QuerydrGateway, deps: QuerydrDeps): QuerydrClient {
  const timeoutMs = deps.timeoutMs ?? QUERYDR_TIMEOUT_MS;
  const now = deps.now ?? (() => new Date());
  const requestId = deps.requestId ?? (() => randomBytes(REQUEST_ID_BYTES).toString(HEX_ENCODING));

  return async (order) => {
    const request = buildQuerydrRequest(gateway, order, now(), requestId());
    let body: unknown;
    try {
      const res = await deps.fetch(gateway.queryUrl, {
        method: 'POST',
        headers: { 'content-type': JSON_CONTENT_TYPE, accept: JSON_CONTENT_TYPE },
        body: JSON.stringify(request),
        // Ngân sách gồm cả đọc body, không chỉ chờ header
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        return failed(QuerydrFailure.HTTP_STATUS, { httpStatus: res.status });
      }
      body = await res.json();
    } catch (err) {
      if (isTimeout(err)) {
        return failed(QuerydrFailure.TIMEOUT);
      }
      const reason =
        err instanceof SyntaxError ? QuerydrFailure.INVALID_RESPONSE : QuerydrFailure.NETWORK_ERROR;
      return failed(reason, { error: err });
    }
    return interpretQuerydrResponse(body, order, gateway.hashSecret);
  };
}
