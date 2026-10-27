// Chuỗi UI dùng chung (app chỉ tiếng Việt, không next-intl — specs/tech-stack.md § apps/web)
export const APP_NAME = 'Ticket Checkout';

export const UI_MESSAGES = {
  // specs/functional-spec/web.md § Quy Tắc Chung — lỗi khi dựng trang từ máy chủ
  ERROR_DESCRIPTION: 'Có lỗi xảy ra, vui lòng thử lại sau',
  RETRY: 'Thử lại',
  NOT_FOUND_TITLE: 'Không tìm thấy trang',
  BACK_HOME: 'Về trang chủ',
  MAIN_NAV: 'Điều hướng chính',
} as const;

export const NAV_LABELS = {
  EVENTS: 'Sự kiện',
  ORDERS: 'Đơn hàng',
  ACCOUNT: 'Tài khoản',
  ADMIN: 'Quản trị',
} as const;
