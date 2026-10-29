// Trạng thái khu chọn vé và cách giữ / bỏ khi dữ liệu trang đổi (đổi tài khoản, tải lại tin bán)
import { ERROR_CODES } from '@/constants/error-codes';
import type { EventListing } from '@/features/events/types';
import { ERROR_MESSAGES, SOLD_OUT_MESSAGE } from '@/lib/error-message';

import { QUANTITY_DEFAULT } from './quantity';

export type Selection = { listingId: string; quantity: number | null };

export type PickerState = {
  selection: Selection | null;
  /** Tin vừa nhấn "Chọn" khi chưa chọn tài khoản — mở sau khi chọn tài khoản */
  pendingListingId: string | null;
  notice: string | null;
};

export type PickerContext = {
  listings: readonly EventListing[];
  currentUserId: string | null;
  eventOnSale: boolean;
};

export const OWN_LISTING_MESSAGE = ERROR_MESSAGES[ERROR_CODES.CANNOT_BUY_OWN_LISTING];

export const INITIAL_PICKER_STATE: PickerState = {
  selection: null,
  pendingListingId: null,
  notice: null,
};

export const isSelectable = (listing: EventListing, eventOnSale: boolean) =>
  eventOnSale && listing.availableQuantity > 0 && !listing.isOwnListing;

/**
 * Áp dữ liệu trang mới lên lựa chọn (spec web § A ngoại lệ "Đổi tài khoản khi đang chọn vé",
 * § B "Chưa chọn tài khoản và nhấn Chọn"): tin của tài khoản mới → bỏ chọn + báo; khác → giữ nguyên.
 */
export function reconcileSelection(state: PickerState, ctx: PickerContext): PickerState {
  const { selection, pendingListingId } = state;
  const find = (id: string) => ctx.listings.find((l) => l.id === id);
  if (selection) {
    const listing = find(selection.listingId);
    if (!listing || !ctx.eventOnSale) return { ...state, selection: null };
    if (listing.isOwnListing) return { ...INITIAL_PICKER_STATE, notice: OWN_LISTING_MESSAGE };
    if (listing.availableQuantity === 0) {
      return { ...INITIAL_PICKER_STATE, notice: SOLD_OUT_MESSAGE };
    }
    return state;
  }
  if (pendingListingId && ctx.currentUserId) {
    const listing = find(pendingListingId);
    if (listing?.isOwnListing) return { ...INITIAL_PICKER_STATE, notice: OWN_LISTING_MESSAGE };
    if (!listing || !isSelectable(listing, ctx.eventOnSale)) {
      return { ...state, pendingListingId: null };
    }
    return {
      selection: { listingId: listing.id, quantity: QUANTITY_DEFAULT },
      pendingListingId: null,
      notice: null,
    };
  }
  return state;
}
