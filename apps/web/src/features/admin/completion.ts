// Lỗi khi bấm "Xác nhận kết thúc" → câu + việc cần làm (spec web § E Đánh Dấu Sự Kiện Kết Thúc → Trường hợp ngoại lệ)
import { ERROR_CODES } from '@/constants/error-codes';
import { ACCOUNT_MESSAGES, ADMIN_MESSAGES } from '@/constants/messages';
import { getErrorMessage } from '@/lib/error-message';
import { AppError } from '@/lib/errors';

export type CompleteOutcome = {
  message: string;
  /** Đóng modal; câu hiện ở thông báo đầu trang thay vì trong modal */
  close: boolean;
  /** Dựng lại danh sách sự kiện (trạng thái, ký quỹ) */
  refresh: boolean;
  openAccountMenu: boolean;
};

export function resolveCompleteError(error: unknown): CompleteOutcome {
  const err = error instanceof AppError ? error : null;
  switch (err?.code) {
    // Kết thúc ở tab khác / người khác; sự kiện không còn → đóng modal, cập nhật dòng
    case ERROR_CODES.EVENT_ALREADY_COMPLETED:
    case ERROR_CODES.EVENT_NOT_FOUND:
      return { message: getErrorMessage(err), close: true, refresh: true, openAccountMenu: false };
    case ERROR_CODES.USER_NOT_SELECTED:
      return {
        message: ACCOUNT_MESSAGES.REQUIRED,
        close: true,
        refresh: false,
        openAccountMenu: true,
      };
    default:
      // Mất mạng, timeout 15 giây (BFF 504), lỗi hệ thống: giữ modal, bấm lại an toàn (api idempotent theo trạng thái)
      return {
        message: ADMIN_MESSAGES.COMPLETE_FAILED,
        close: false,
        refresh: false,
        openAccountMenu: false,
      };
  }
}
