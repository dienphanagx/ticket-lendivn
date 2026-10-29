// Chuỗi UI dùng chung (app chỉ tiếng Việt, không next-intl — specs/tech-stack.md § apps/web)
export const APP_NAME = 'Ticket Checkout';

export const UI_MESSAGES = {
  // specs/functional-spec/web.md § Quy Tắc Chung — lỗi khi dựng trang từ máy chủ
  ERROR_DESCRIPTION: 'Có lỗi xảy ra, vui lòng thử lại sau',
  RETRY: 'Thử lại',
  NOT_FOUND_TITLE: 'Không tìm thấy trang',
  BACK_HOME: 'Về trang chủ',
  MAIN_NAV: 'Điều hướng chính',
  CLOSE: 'Đóng',
  INCREASE: 'Tăng',
  DECREASE: 'Giảm',
  LOADING: 'Đang tải',
} as const;

// specs/functional-spec/web.md § A Chọn Người Dùng
export const ACCOUNT_MESSAGES = {
  PLACEHOLDER: 'Chọn tài khoản',
  MENU_LABEL: 'Tài khoản đang xem',
  LOAD_FAILED: 'Không tải được danh sách tài khoản',
  EMPTY: 'Chưa có tài khoản mẫu, vui lòng nạp dữ liệu mẫu',
  REQUIRED: 'Vui lòng chọn tài khoản để tiếp tục',
  STALE: 'Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại',
  SWITCHED: (displayName: string) => `Đang xem với tài khoản ${displayName}`,
} as const;

// specs/functional-spec/web.md § B Sự Kiện
export const EVENT_MESSAGES = {
  LIST_TITLE: 'Sự kiện',
  EMPTY: 'Chưa có sự kiện nào',
  NOT_FOUND: 'Không tìm thấy sự kiện',
  STATUS_ON_SALE: 'Đang bán',
  STATUS_COMPLETED: 'Đã kết thúc',
  SOLD_OUT: 'Hết vé',
  PRICE_FROM: (price: string) => `Từ ${price}`,
  REMAINING: (count: number) => `Còn ${count} vé`,
  ENDED_BANNER: 'Sự kiện đã kết thúc, ngừng bán vé',
  NO_LISTINGS: 'Sự kiện chưa có tin bán vé',
  LISTINGS_TITLE: 'Tin bán vé',
  OWN_LISTING: 'Tin của bạn',
  SELECT: 'Chọn',
  TIME: 'Thời gian',
  VENUE: 'Địa điểm',
} as const;

// specs/functional-spec/web.md § C Chọn Vé Và Xem Tổng Tiền
export const TICKET_MESSAGES = {
  PANEL_TITLE: 'Chọn số lượng vé',
  PANEL_HINT: 'Chọn một tin bán để xem tổng tiền',
  SELLER: 'Người bán',
  UNIT_PRICE: 'Giá mỗi vé',
  AVAILABLE: 'Số vé còn lại',
  QUANTITY: 'Số lượng',
  SUBTOTAL: 'Tiền vé',
  BUYER_FEE: 'Phí dịch vụ (10%)',
  TOTAL: 'Tổng thanh toán',
  CHECKOUT: 'Thanh toán',
  EMPTY_VALUE: '—',
  QUANTITY_REQUIRED: 'Vui lòng nhập số lượng',
  QUANTITY_MIN: 'Số lượng tối thiểu là 1',
} as const;

export const NAV_LABELS = {
  EVENTS: 'Sự kiện',
  ORDERS: 'Đơn hàng',
  ACCOUNT: 'Tài khoản',
  ADMIN: 'Quản trị',
} as const;
