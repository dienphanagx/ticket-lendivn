import { describe, expect, it } from 'vitest';

import { sortEvents, sortListings } from '@/features/events/sort';
import { validateQuantity } from '@/features/listings/quantity';
import {
  INITIAL_PICKER_STATE,
  OWN_LISTING_MESSAGE,
  reconcileSelection,
  type PickerState,
} from '@/features/listings/selection';

import { buildEventSummary, buildListing, USER_A, USER_B } from '../support/factories';

describe('validateQuantity', () => {
  it.each([
    [null, 'Vui lòng nhập số lượng'],
    [Number.NaN, 'Vui lòng nhập số lượng'],
    [0, 'Số lượng tối thiểu là 1'],
    [-2, 'Số lượng tối thiểu là 1'],
    [1.5, 'Số lượng tối thiểu là 1'],
    [6, 'Chỉ còn 5 vé'],
  ])('should reject %s with the spec sentence', (value, expected) => {
    expect(validateQuantity(value, 5)).toBe(expected);
  });

  it.each([1, 3, 5])('should accept %d when 5 tickets remain', (value) => {
    expect(validateQuantity(value, 5)).toBeNull();
  });
});

describe('sortEvents', () => {
  it('should put on-sale events first, then by start time ascending', () => {
    const endedEarly = buildEventSummary({
      id: 'e1',
      status: 'COMPLETED',
      startsAt: '2026-01-01T00:00:00Z',
    });
    const onSaleLate = buildEventSummary({ id: 'e2', startsAt: '2026-12-01T00:00:00Z' });
    const onSaleEarly = buildEventSummary({ id: 'e3', startsAt: '2026-06-01T00:00:00Z' });

    const ids = sortEvents([endedEarly, onSaleLate, onSaleEarly]).map((e) => e.id);

    expect(ids).toEqual(['e3', 'e2', 'e1']);
  });
});

describe('sortListings', () => {
  it('should sort by unit price ascending, more tickets first on equal price', () => {
    const expensive = buildListing({ id: 'l1', unitPrice: 2_000_000 });
    const cheapFew = buildListing({ id: 'l2', unitPrice: 1_000_000, availableQuantity: 1 });
    const cheapMany = buildListing({ id: 'l3', unitPrice: 1_000_000, availableQuantity: 9 });

    const ids = sortListings([expensive, cheapFew, cheapMany]).map((l) => l.id);

    expect(ids).toEqual(['l3', 'l2', 'l1']);
  });
});

describe('reconcileSelection', () => {
  const listing = buildListing({ id: 'l1' });
  const selected: PickerState = {
    ...INITIAL_PICKER_STATE,
    selection: { listingId: 'l1', quantity: 3 },
  };

  it('should drop the selection with a notice when the new account owns the listing', () => {
    const next = reconcileSelection(selected, {
      listings: [{ ...listing, isOwnListing: true }],
      currentUserId: USER_B,
      eventOnSale: true,
    });

    expect(next).toEqual({ ...INITIAL_PICKER_STATE, notice: OWN_LISTING_MESSAGE });
  });

  it('should keep listing and quantity when switching to another buyer', () => {
    const next = reconcileSelection(selected, {
      listings: [listing],
      currentUserId: USER_A,
      eventOnSale: true,
    });

    expect(next).toBe(selected);
  });

  it('should close the selection when the event has ended', () => {
    const next = reconcileSelection(selected, {
      listings: [listing],
      currentUserId: USER_A,
      eventOnSale: false,
    });

    expect(next.selection).toBeNull();
  });

  it('should close with a sold-out notice when the listing has no tickets left', () => {
    const next = reconcileSelection(selected, {
      listings: [{ ...listing, availableQuantity: 0 }],
      currentUserId: USER_A,
      eventOnSale: true,
    });

    expect(next).toEqual({ ...INITIAL_PICKER_STATE, notice: 'Tin bán này vừa hết vé' });
  });

  it('should open the pending listing with quantity 1 once an account is chosen', () => {
    const pending: PickerState = { ...INITIAL_PICKER_STATE, pendingListingId: 'l1', notice: 'x' };

    const next = reconcileSelection(pending, {
      listings: [listing],
      currentUserId: USER_A,
      eventOnSale: true,
    });

    expect(next).toEqual({
      selection: { listingId: 'l1', quantity: 1 },
      pendingListingId: null,
      notice: null,
    });
  });

  it('should not open the pending listing when it belongs to the chosen account', () => {
    const pending: PickerState = { ...INITIAL_PICKER_STATE, pendingListingId: 'l1' };

    const next = reconcileSelection(pending, {
      listings: [{ ...listing, isOwnListing: true }],
      currentUserId: USER_B,
      eventOnSale: true,
    });

    expect(next).toEqual({ ...INITIAL_PICKER_STATE, notice: OWN_LISTING_MESSAGE });
  });
});
