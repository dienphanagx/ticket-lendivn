// Mã lỗi code so sánh hoặc tự trả — mã api theo apps/api/src/features/*/errors.ts, quote.ts, current-user.ts
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  EVENT_NOT_ON_SALE: 'EVENT_NOT_ON_SALE',
  LISTING_NOT_FOUND: 'LISTING_NOT_FOUND',
  CANNOT_BUY_OWN_LISTING: 'CANNOT_BUY_OWN_LISTING',
  INSUFFICIENT_QUANTITY: 'INSUFFICIENT_QUANTITY',
  // BFF tự sinh: Route Handler cần tài khoản mà cookie `current_user_id` chưa có
  USER_NOT_SELECTED: 'USER_NOT_SELECTED',
} as const;
