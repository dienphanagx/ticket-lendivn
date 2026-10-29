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

/** HMAC-SHA512 hex chữ thường của `data`. */
export const hmacHex = (data: string, secret: string): string =>
  createHmac(HMAC_ALGORITHM, secret).update(data, 'utf8').digest(HEX_ENCODING);

/** Chữ ký hex chữ thường cho bộ tham số (dùng cho URL thanh toán, script gửi IPN, test). */
export const signVnpayParams = (params: VnpayParams, secret: string): string =>
  hmacHex(buildSignData(params), secret);

/**
 * So `providedHash` (hex, không phân biệt hoa thường) với HMAC-SHA512 của `data` bằng phép so sánh
 * thời gian hằng; sai dạng (không phải 128 hex) → false. Dùng chung cho mọi chuỗi ký của VNPay.
 */
export function matchesVnpayHash(data: string, providedHash: string, secret: string): boolean {
  const normalized = providedHash.toLowerCase();
  if (!SECURE_HASH_PATTERN.test(normalized)) {
    return false;
  }
  const expected = Buffer.from(hmacHex(data, secret), HEX_ENCODING);
  // Cùng độ dài 64 byte (đã kiểm 128 hex) → so sánh thời gian hằng
  return timingSafeEqual(Buffer.from(normalized, HEX_ENCODING), expected);
}

/**
 * Xác thực chữ ký trên tham số đã giải mã (query / body), không dùng chuỗi tham số thô.
 * Sai khi: chưa cấu hình khoá, thiếu / sai dạng `vnp_SecureHash`, một tham số `vnp_*` xuất hiện nhiều
 * lần (parser trả mảng) hoặc không phải chuỗi, hoặc HMAC lệch. Tham số không có tiền tố `vnp_` bị bỏ qua.
 *
 * Thử 2 kiểu chuỗi ký: (1) mọi tham số `vnp_*`, kể cả giá trị rỗng; (2) nếu (1) sai và có tham số rỗng,
 * bỏ các tham số `vnp_*` rỗng khỏi chuỗi ký (một số mẫu code của VNPay ký như vậy).
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
      providedHash = value;
    }
    entries.push([key, value]);
  }
  if (providedHash === undefined) {
    return false;
  }
  if (matchesVnpayHash(signData(entries), providedHash, secret)) {
    return true;
  }
  const nonEmpty = entries.filter(([, value]) => value !== '');
  return (
    nonEmpty.length !== entries.length && matchesVnpayHash(signData(nonEmpty), providedHash, secret)
  );
}
