import { EVENT_STATUS, type EventListing, type EventSummary } from './types';

/** "Đang bán" trước, trong mỗi nhóm theo thời gian diễn ra tăng dần (spec web § B Danh Sách) */
export function sortEvents(events: readonly EventSummary[]): EventSummary[] {
  const rank = (e: EventSummary) => (e.status === EVENT_STATUS.ON_SALE ? 0 : 1);
  return [...events].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

/** Giá mỗi vé tăng dần; cùng giá thì tin còn nhiều vé hơn trước (spec web § B Trang Sự Kiện) */
export function sortListings(listings: readonly EventListing[]): EventListing[] {
  return [...listings].sort(
    (a, b) => a.unitPrice - b.unitPrice || b.availableQuantity - a.availableQuantity,
  );
}
