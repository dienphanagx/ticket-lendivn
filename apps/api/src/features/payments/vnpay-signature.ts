import { createHmac, timingSafeEqual } from 'node:crypto';

// Chữ ký HMAC-SHA512 của VNPay (specs/architecture.md § Các Quyết Định Kỹ Thuật → Chữ ký VNPay).
// Module thuần: không đọc env, không I/O — khoá bí mật do caller truyền vào.

export const VNP_PARAM_PREFIX = 'vnp_';
export const VNP_SECURE_HASH = 'vnp_SecureHash';
export const VNP_SECURE_HASH_TYPE = 'vnp_SecureHashType';

const HMAC_ALGORITHM = 'sha512';
const HEX_ENCODING = 'hex';
/** HMAC-SHA512 hex = 128 ký tự; so sau khi đã chuẩn hoá chữ thường. */
const SECURE_HASH_PATTERN = /^[0-9a-f]{128}$/;

/** Tham số `vnp_*` dạng chuỗi đã giải mã (1 giá trị mỗi key). */
export type VnpayParams = Readonly<Record<string, string>>;

const isSignedParam = (key: string): boolean =>
  key.startsWith(VNP_PARAM_PREFIX) && key !== VNP_SECURE_HASH && key !== VNP_SECURE_HASH_TYPE;

/**
 * Chuỗi ký: mọi tham số `vnp_*` trừ `vnp_SecureHash` / `vnp_SecureHashType`, sắp tăng dần theo tên
 * (so code unit), `key=value` URL-encode kiểu form (khoảng trắng → `+`), nối `&`.
 * `URLSearchParams` encode đúng `application/x-www-form-urlencoded` (giống `URLEncoder` của Java).
 */
function signData(entries: Iterable<readonly [string, string]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    if (isSignedParam(key)) {
      search.append(key, value);
    }
  }
  search.sort();
  return search.toString();
}

export const buildSignData = (params: VnpayParams): string => signData(Object.entries(params));

const hmacHex = (data: string, secret: string): string =>
  createHmac(HMAC_ALGORITHM, secret).update(data, 'utf8').digest(HEX_ENCODING);

/** Chữ ký hex chữ thường cho bộ tham số (dùng cho URL thanh toán, script gửi IPN, test). */
export const signVnpayParams = (params: VnpayParams, secret: string): string =>
  hmacHex(buildSignData(params), secret);

/**
 * Xác thực chữ ký trên tham số đã giải mã (query Fastify), không dùng chuỗi query thô.
 * Sai khi: chưa cấu hình khoá, thiếu / sai dạng `vnp_SecureHash`, một tham số `vnp_*` xuất hiện nhiều
 * lần (parser trả mảng), hoặc HMAC lệch. Tham số không có tiền tố `vnp_` bị bỏ qua.
 */
export function verifyVnpaySignature(query: unknown, secret: string | undefined): boolean {
  if (secret === undefined || secret === '' || typeof query !== 'object' || query === null) {
    return false;
  }
  const entries: [string, string][] = [];
  let providedHash: string | undefined;
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith(VNP_PARAM_PREFIX)) {
      continue;
    }
    if (typeof value !== 'string') {
      return false;
    }
    if (key === VNP_SECURE_HASH) {
      providedHash = value.toLowerCase();
    }
    entries.push([key, value]);
  }
  if (providedHash === undefined || !SECURE_HASH_PATTERN.test(providedHash)) {
    return false;
  }
  const expected = Buffer.from(hmacHex(signData(entries), secret), HEX_ENCODING);
  // Cùng độ dài 64 byte (đã kiểm 128 hex) → so sánh thời gian hằng
  return timingSafeEqual(Buffer.from(providedHash, HEX_ENCODING), expected);
}
