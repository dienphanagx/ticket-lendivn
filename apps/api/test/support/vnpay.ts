import { createHmac, randomInt } from 'node:crypto';

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

export const RETURN_URL = '/api/v1/payments/vnpay/return';
export const TEST_TMN_CODE = 'TESTTMN1';
export const TEST_PAYMENT_URL = 'https://sandbox.vnpay.test/paymentv2/vpcpay.html';
export const TEST_QUERY_URL = 'https://sandbox.vnpay.test/merchant_webapi/api/transaction';
export const TEST_RETURN_URL_BASE = 'http://localhost:3000/don-hang';

/** Cấu hình cổng đầy đủ bằng giá trị giả (không phải khoá VNPay thật). */
export const TEST_VNPAY_CONFIG = {
  VNPAY_TMN_CODE: TEST_TMN_CODE,
  VNPAY_HASH_SECRET: TEST_HASH_SECRET,
  VNPAY_PAYMENT_URL: TEST_PAYMENT_URL,
  VNPAY_QUERY_URL: TEST_QUERY_URL,
  VNPAY_RETURN_URL_BASE: TEST_RETURN_URL_BASE,
};

const hmacSha512 = (data: string, secret: string): string =>
  createHmac('sha512', secret).update(data, 'utf8').digest('hex');

/** Thứ tự trường chuỗi ký response querydr, viết lại độc lập với code app. */
const QUERYDR_RESPONSE_FIELDS = [
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
];

/** Thứ tự trường chuỗi ký request querydr. */
export const QUERYDR_REQUEST_FIELDS = [
  'vnp_RequestId',
  'vnp_Version',
  'vnp_Command',
  'vnp_TmnCode',
  'vnp_TxnRef',
  'vnp_TransactionDate',
  'vnp_CreateDate',
  'vnp_IpAddr',
  'vnp_OrderInfo',
];

export const signPipe = (
  fields: readonly string[],
  values: VnpParams,
  secret: string = TEST_HASH_SECRET,
): string => hmacSha512(fields.map((field) => values[field] ?? '').join('|'), secret);

/** Response querydr giao dịch thành công đúng số tiền (chưa ký). */
export const buildQuerydrResponse = (
  order: Pick<Order, 'id' | 'buyer_total'>,
  overrides: VnpParams = {},
): VnpParams => ({
  vnp_ResponseId: 'f1c3a9e2b7d84c6f9a0e1b2c3d4e5f60',
  vnp_Command: 'querydr',
  vnp_ResponseCode: '00',
  vnp_Message: 'QueryDR Success',
  vnp_TmnCode: TEST_TMN_CODE,
  vnp_TxnRef: order.id,
  vnp_Amount: String(order.buyer_total * VNPAY_AMOUNT_MULTIPLIER),
  vnp_BankCode: 'NCB',
  vnp_PayDate: '20261029153000',
  vnp_TransactionNo: buildTxnNo(),
  vnp_TransactionType: '01',
  vnp_TransactionStatus: '00',
  vnp_OrderInfo: `Thanh toan don ${order.id}`,
  vnp_PromotionCode: '',
  vnp_PromotionAmount: '',
  ...overrides,
});

export const signQuerydrResponse = (
  response: VnpParams,
  secret: string = TEST_HASH_SECRET,
): VnpParams => ({
  ...response,
  vnp_SecureHash: signPipe(QUERYDR_RESPONSE_FIELDS, response, secret),
});

export type FakeGatewayReply = { status?: number; body: unknown } | { error: Error };

export interface FakeQuerydrGateway {
  fetch: typeof fetch;
  /** Body JSON của mọi request đã nhận. */
  requests: VnpParams[];
  /** Phản hồi cho các request tiếp theo. */
  reply: (next: FakeGatewayReply) => void;
  /**
   * Giữ request kế tiếp: `requested` resolve khi app đã gọi cổng, response chỉ trả về khi `release`
   * (điểm đồng bộ tất định cho test chạy đồng thời, không sleep).
   */
  holdNext: () => HeldRequest;
}

export interface HeldRequest {
  requested: Promise<void>;
  release: (reply: FakeGatewayReply) => void;
}

const HTTP_OK = 200;

/** Cổng querydr giả: `fetch` inject vào app, không gọi mạng thật. */
export function createFakeQuerydrGateway(): FakeQuerydrGateway {
  const requests: VnpParams[] = [];
  let next: FakeGatewayReply = { error: new TypeError('fetch failed') };
  let held: { onRequest: () => void; reply: Promise<FakeGatewayReply> } | undefined;

  const respond = (reply: FakeGatewayReply): Promise<Response> =>
    'error' in reply
      ? Promise.reject(reply.error)
      : Promise.resolve(Response.json(reply.body, { status: reply.status ?? HTTP_OK }));

  const fakeFetch = (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push(JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as VnpParams);
    if (held !== undefined) {
      const { onRequest, reply } = held;
      held = undefined;
      onRequest();
      return reply.then(respond);
    }
    return respond(next);
  };
  return {
    fetch: fakeFetch,
    requests,
    reply: (value) => {
      next = value;
    },
    holdNext: () => {
      const requested = Promise.withResolvers<void>();
      const reply = Promise.withResolvers<FakeGatewayReply>();
      held = { onRequest: requested.resolve, reply: reply.promise };
      return { requested: requested.promise, release: reply.resolve };
    },
  };
}
