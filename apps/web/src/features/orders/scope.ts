// Phạm vi xem đơn (spec web § C Xem Kết Quả Thanh Toán → Quy tắc nghiệp vụ): chỉ người mua xem được.
// Đơn-related endpoint của api là public nên web tự kiểm; id là UUID, so như api (không phân biệt hoa thường)
import { ERROR_CODES } from '@/constants/error-codes';
import { AppError } from '@/lib/errors';

export const isBuyerOf = (order: { buyer: { id: string } }, userId: string): boolean =>
  order.buyer.id.toLowerCase() === userId.toLowerCase();

const ORDER_NOT_FOUND_STATUS = 404;

/** Cùng mã + câu với api khi không có đơn: không lộ "đơn tồn tại nhưng của người khác" */
export const orderNotFound = () =>
  new AppError(ERROR_CODES.ORDER_NOT_FOUND, 'Order not found', ORDER_NOT_FOUND_STATUS);
