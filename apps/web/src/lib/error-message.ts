// Câu lỗi tiếng Việt theo `code` (rule policy-api § Response format: app không dùng lib i18n → 1 map hằng)
// Câu theo specs/functional-spec/web.md; không hiển thị `message` / value `details` của api
import { ERROR_CODES } from '@/constants/error-codes';

const GENERIC = 'Có lỗi xảy ra, vui lòng thử lại sau';

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  generic: GENERIC,
  'fields.invalid': 'Giá trị không hợp lệ',
  // Không có response từ trình duyệt → web; spec § Quy Tắc Chung
  NETWORK_ERROR: 'Mất kết nối, vui lòng kiểm tra mạng',
  TIMEOUT: GENERIC,
  INVALID_RESPONSE: GENERIC,
  UNKNOWN_ERROR: GENERIC,
  INTERNAL_ERROR: GENERIC,
  ROUTE_NOT_FOUND: GENERIC,
  BFF_UPSTREAM_UNAVAILABLE: GENERIC,
  BFF_UPSTREAM_TIMEOUT: GENERIC,
  BFF_UPSTREAM_INVALID_RESPONSE: GENERIC,
  BFF_CROSS_SITE_REJECTED: GENERIC,
  [ERROR_CODES.VALIDATION_FAILED]: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại',
  [ERROR_CODES.USER_NOT_SELECTED]: 'Vui lòng chọn tài khoản để tiếp tục',
  [ERROR_CODES.USER_NOT_FOUND]: 'Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại',
  [ERROR_CODES.EVENT_NOT_FOUND]: 'Không tìm thấy sự kiện',
  [ERROR_CODES.EVENT_NOT_ON_SALE]: 'Sự kiện đã kết thúc, ngừng bán vé',
  [ERROR_CODES.LISTING_NOT_FOUND]: 'Tin bán không còn tồn tại',
  [ERROR_CODES.CANNOT_BUY_OWN_LISTING]: 'Bạn không thể mua tin bán của chính mình',
  [ERROR_CODES.INSUFFICIENT_QUANTITY]: 'Không đủ vé, vui lòng chọn lại số lượng',
};

export const SOLD_OUT_MESSAGE = 'Tin bán này vừa hết vé';

export const remainingTicketsMessage = (available: number) => `Chỉ còn ${available} vé`;

type ErrorLike = { code: string; message?: string; details?: Record<string, unknown> };

export function getErrorMessage(err: ErrorLike): string {
  if (err.code === ERROR_CODES.INSUFFICIENT_QUANTITY) {
    // details `{ available }` (apps/api/src/features/listings/quote.ts)
    const available = err.details?.available;
    if (typeof available === 'number' && Number.isInteger(available) && available >= 0) {
      return available === 0 ? SOLD_OUT_MESSAGE : remainingTicketsMessage(available);
    }
  }
  const message = ERROR_MESSAGES[err.code];
  if (message !== undefined) return message;
  console.warn('Missing message for API error code', { code: err.code, message: err.message });
  return GENERIC;
}

/** Lỗi bất kỳ (kể cả không phải AppError) → câu hiển thị */
export function getUnknownErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return getErrorMessage(err as ErrorLike);
  }
  return GENERIC;
}
