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
  CHECKOUT_PENDING: 'Đang tạo đơn…',
  EMPTY_VALUE: '—',
  QUANTITY_REQUIRED: 'Vui lòng nhập số lượng',
  QUANTITY_MIN: 'Số lượng tối thiểu là 1',
} as const;

// specs/functional-spec/web.md § C Xác Nhận Thanh Toán — ngoại lệ khi bấm "Thanh toán"
export const CHECKOUT_MESSAGES = {
  ORDER_NOT_CREATED: 'Chưa tạo được đơn, vui lòng thử lại',
  GATEWAY_UNREACHABLE: 'Không kết nối được cổng thanh toán, vui lòng thử lại sau',
  REMAINING: (available: number) => `Chỉ còn ${available} vé, vui lòng chọn lại số lượng`,
} as const;

// specs/functional-spec/web.md § C Xem Kết Quả Thanh Toán, § D Xem Danh Sách Đơn Hàng
export const ORDER_MESSAGES = {
  RESULT_TITLE: 'Kết quả thanh toán',
  LIST_TITLE: 'Đơn hàng',
  NOT_FOUND: 'Không tìm thấy đơn hàng',
  ORDER_ID: 'Mã đơn',
  EVENT: 'Sự kiện',
  SELLER: 'Người bán',
  QUANTITY: 'Số lượng',
  TICKET_COUNT: (count: number) => `${count} vé`,
  UNIT_PRICE: 'Giá mỗi vé',
  SUBTOTAL: 'Tiền vé',
  BUYER_FEE: 'Phí dịch vụ',
  TOTAL: 'Tổng thanh toán',
  CREATED_AT: 'Thời điểm tạo đơn',
  PAID_AT: 'Thời điểm thanh toán',
  HOLD_UNTIL: (time: string) => `Giữ vé đến ${time}`,
  STATUS_PAID: 'Đã thanh toán',
  STATUS_PENDING: 'Đang chờ xác nhận',
  STATUS_FAILED: 'Thất bại',
  STATUS_EXPIRED: 'Hết hạn',
  STATUS_REFUND_REQUIRED: 'Cần hoàn tiền',
  PAID_TITLE: 'Thanh toán thành công',
  PENDING_TITLE: 'Đang chờ xác nhận thanh toán từ cổng…',
  FAILED_TITLE: 'Thanh toán không thành công. Vé đã được trả lại cho tin bán.',
  EXPIRED_TITLE: 'Đơn đã hết hạn giữ chỗ. Vé đã được trả lại cho tin bán.',
  REFUND_TITLE: (amount: string) =>
    `Đã nhận thanh toán nhưng vé không còn đủ. ${amount} sẽ được hoàn lại và đang hiển thị ở số dư khả dụng của bạn.`,
  POLL_TIMEOUT:
    'Chưa nhận được xác nhận từ cổng thanh toán. Kết quả sẽ được cập nhật tại trang Đơn hàng.',
  CHECK_AGAIN: 'Kiểm tra lại',
  VIEW_ORDERS: 'Xem đơn hàng',
  BACK_TO_EVENT: 'Quay lại sự kiện',
  VIEW_ACCOUNT: 'Xem tài khoản',
  EMPTY: 'Bạn chưa có đơn hàng nào',
  BROWSE_EVENTS: 'Xem sự kiện',
} as const;

// specs/functional-spec/web.md § D Xem Số Dư Và Lịch Sử Bút Toán
export const BALANCE_MESSAGES = {
  TITLE: 'Tài khoản',
  PENDING: 'Số dư đang chờ',
  PENDING_HINT: 'Tiền bán vé đang được giữ ký quỹ đến khi sự kiện kết thúc',
  AVAILABLE: 'Số dư khả dụng',
  AVAILABLE_SALES: 'Tiền bán vé',
  AVAILABLE_REFUNDS: 'Khoản hoàn tiền',
  HISTORY_TITLE: 'Lịch sử giao dịch',
  EMPTY: 'Chưa có giao dịch nào',
  BALANCE_TYPE_PENDING: 'Đang chờ',
  BALANCE_TYPE_AVAILABLE: 'Khả dụng',
  INCREASE: 'Tăng',
  DECREASE: 'Giảm',
  VIEW_ORDER: (orderId: string) => `Xem đơn ${orderId}`,
} as const;

// specs/functional-spec/web.md § E Đánh Dấu Sự Kiện Kết Thúc
export const ADMIN_MESSAGES = {
  TITLE: 'Quản trị',
  VIEW_LEDGER: 'Xem sổ cái',
  EVENT_TIME: 'Thời gian diễn ra',
  ESCROW: 'Đang ký quỹ',
  PENDING_ORDERS: 'Đơn đang chờ thanh toán',
  COMPLETE: 'Đánh dấu kết thúc',
  CONFIRM_TITLE: (eventName: string) => `Kết thúc sự kiện ${eventName}?`,
  CONFIRM_IRREVERSIBLE: 'Thao tác không thể hoàn tác.',
  RELEASE_AMOUNT: 'Số tiền ký quỹ sẽ giải phóng',
  SELLER_COUNT: 'Số người bán nhận tiền',
  EXPIRING_ORDERS: 'Số đơn đang chờ thanh toán sẽ chuyển hết hạn',
  CANCEL: 'Huỷ',
  CONFIRM: 'Xác nhận kết thúc',
  CONFIRM_PENDING: 'Đang xử lý…',
  COMPLETED: (eventName: string, amount: string, sellerCount: number) =>
    `Đã kết thúc sự kiện ${eventName}, giải phóng ${amount} cho ${sellerCount} người bán`,
  COMPLETE_FAILED: 'Chưa kết thúc được sự kiện, vui lòng thử lại',
} as const;

// specs/functional-spec/web.md § E Xem Sổ Cái Và Số Dư Sàn
export const LEDGER_MESSAGES = {
  TITLE: 'Sổ cái',
  BACK_TO_ADMIN: 'Quản trị',
  BACK_TO_LEDGER: 'Sổ cái',
  ACCOUNTS_TITLE: 'Tài khoản sổ cái',
  ACCOUNT: 'Tài khoản',
  OWNER: 'Chủ sở hữu',
  PLATFORM_OWNER: 'Sàn',
  EVENT: 'Sự kiện',
  TOTAL_DEBIT: 'Tổng ghi nợ',
  TOTAL_CREDIT: 'Tổng ghi có',
  BALANCE: 'Số dư',
  LEDGER_TOTAL_DEBIT: 'Tổng ghi nợ toàn sổ',
  LEDGER_TOTAL_CREDIT: 'Tổng ghi có toàn sổ',
  TRANSACTIONS_TITLE: 'Giao dịch',
  FILTER_TYPE: 'Lọc theo loại giao dịch',
  FILTER_EVENT: 'Lọc theo sự kiện',
  ALL_TYPES: 'Mọi loại',
  ALL_EVENTS: 'Mọi sự kiện',
  EMPTY: 'Chưa có bút toán nào',
  ENTRIES_TITLE: 'Dòng bút toán',
  TIME: 'Thời điểm',
  TRANSACTION_ID: 'Mã giao dịch',
  DESCRIPTION: 'Diễn giải',
  REFERENCE: 'Tham chiếu',
  DEBIT: 'Ghi nợ',
  CREDIT: 'Ghi có',
  ORDER_REF: (orderId: string) => `Đơn ${orderId}`,
  EVENT_REF: (eventName: string) => `Sự kiện ${eventName}`,
  SHOW_ENTRIES: 'Xem dòng bút toán',
  HIDE_ENTRIES: 'Ẩn dòng bút toán',
  NOT_FOUND: 'Không tìm thấy tài khoản sổ cái',
  ACCOUNT_TYPE_GATEWAY_CASH: 'Tiền tại cổng thanh toán',
  ACCOUNT_TYPE_ESCROW_SELLER: 'Ký quỹ người bán',
  ACCOUNT_TYPE_ESCROW_FEE: 'Ký quỹ phí sàn',
  ACCOUNT_TYPE_SELLER_PAYABLE: 'Phải trả người bán',
  ACCOUNT_TYPE_BUYER_REFUND_PAYABLE: 'Phải hoàn người mua',
  ACCOUNT_TYPE_PLATFORM_FEE_REVENUE: 'Doanh thu phí sàn',
  TXN_TYPE_PAYMENT_CAPTURED: 'Ghi nhận thanh toán',
  TXN_TYPE_PAYMENT_REFUND_REQUIRED: 'Khoản cần hoàn tiền',
  TXN_TYPE_EVENT_RELEASE: 'Giải phóng ký quỹ',
} as const;

export const PAGINATION_MESSAGES = {
  LABEL: 'Phân trang',
  PREVIOUS: 'Trang trước',
  NEXT: 'Trang sau',
  STATUS: (page: number, totalPages: number) => `Trang ${page}/${totalPages}`,
} as const;

export const NAV_LABELS = {
  EVENTS: 'Sự kiện',
  ORDERS: 'Đơn hàng',
  ACCOUNT: 'Tài khoản',
  ADMIN: 'Quản trị',
} as const;
