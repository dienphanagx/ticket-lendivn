import { randomBytes } from 'node:crypto';

// Mã đơn 16 ký tự [A-Z0-9] = `yyMMdd` (GMT+7) + 10 ký tự ngẫu nhiên; khớp CHECK `orders_id_format_ck`
// và dùng làm `vnp_TxnRef` (specs/database.md § `orders`).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const RANDOM_LENGTH = 10;
// 252 = 7 × 36: byte ≥ 252 bị loại để mọi ký tự cùng xác suất (không modulo bias)
const UNBIASED_BYTE_LIMIT = 256 - (256 % ALPHABET.length);
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
// `YYYY-MM-DD` của ISO → bỏ thế kỷ và dấu `-`
const ISO_DATE_START = 2;
const ISO_DATE_END = 10;

function randomPart(): string {
  let result = '';
  while (result.length < RANDOM_LENGTH) {
    for (const byte of randomBytes(RANDOM_LENGTH)) {
      if (byte < UNBIASED_BYTE_LIMIT && result.length < RANDOM_LENGTH) {
        result += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return result;
}

export function generateOrderId(now: Date = new Date()): string {
  const gmt7 = new Date(now.getTime() + GMT7_OFFSET_MS);
  const datePart = gmt7.toISOString().slice(ISO_DATE_START, ISO_DATE_END).replaceAll('-', '');
  return datePart + randomPart();
}
