import { TICKET_MESSAGES } from '@/constants/messages';
import { remainingTicketsMessage } from '@/lib/error-message';

export const QUANTITY_MIN = 1;
export const QUANTITY_DEFAULT = 1;

/** Câu lỗi ô số lượng (spec web § C Chọn Vé); hợp lệ → null */
export function validateQuantity(value: number | null, available: number): string | null {
  if (value === null || Number.isNaN(value)) return TICKET_MESSAGES.QUANTITY_REQUIRED;
  if (!Number.isInteger(value) || value < QUANTITY_MIN) return TICKET_MESSAGES.QUANTITY_MIN;
  if (value > available) return remainingTicketsMessage(available);
  return null;
}
