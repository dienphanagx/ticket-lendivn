'use client';

import { useCallback, useMemo, useState } from 'react';

import { Icon } from '@/components/custom/icon';
import { useAccountMenu } from '@/components/providers/account-menu-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ACCOUNT_MESSAGES, EVENT_MESSAGES } from '@/constants/messages';
import { sortListings } from '@/features/events/sort';
import type { EventListing } from '@/features/events/types';

import { QUANTITY_DEFAULT } from '../quantity';
import { INITIAL_PICKER_STATE, reconcileSelection, type PickerContext } from '../selection';
import { ListingItem } from './listing-item';
import { SelectionPanel } from './selection-panel';
import { TicketSheet } from './ticket-sheet';

interface TicketPickerProps {
  listings: EventListing[];
  eventOnSale: boolean;
  currentUserId: string | null;
}

/** Danh sách tin bán + khu chọn số lượng / tạm tính (spec web § B Trang Sự Kiện, § C Chọn Vé) */
export function TicketPicker({ listings, eventOnSale, currentUserId }: TicketPickerProps) {
  const { setOpen: openAccountMenu } = useAccountMenu();
  const [state, setState] = useState(INITIAL_PICKER_STATE);
  // Đổi tài khoản / tải lại trang → props mới; chỉnh state ngay trong render (không qua effect)
  const [prevContext, setPrevContext] = useState<PickerContext>({
    listings,
    currentUserId,
    eventOnSale,
  });
  if (
    prevContext.listings !== listings ||
    prevContext.currentUserId !== currentUserId ||
    prevContext.eventOnSale !== eventOnSale
  ) {
    const context = { listings, currentUserId, eventOnSale };
    setPrevContext(context);
    setState(reconcileSelection(state, context));
  }

  const sorted = useMemo(() => sortListings(listings), [listings]);
  const { selection } = state;
  const selected = selection ? listings.find((l) => l.id === selection.listingId) : undefined;

  const select = (listing: EventListing) => {
    if (currentUserId === null) {
      setState({
        selection: null,
        pendingListingId: listing.id,
        notice: ACCOUNT_MESSAGES.REQUIRED,
      });
      openAccountMenu(true);
      return;
    }
    // Chọn tin khác → khu chọn chuyển sang tin mới, số lượng đặt lại 1
    setState({
      selection: { listingId: listing.id, quantity: QUANTITY_DEFAULT },
      pendingListingId: null,
      notice: null,
    });
  };
  const close = useCallback(
    (notice: string | null = null) => setState({ ...INITIAL_PICKER_STATE, notice }),
    [],
  );
  const closeSilently = useCallback(() => close(null), [close]);
  const changeQuantity = (quantity: number | null) =>
    setState((s) => (s.selection ? { ...s, selection: { ...s.selection, quantity } } : s));

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-3" aria-labelledby="listings-title">
        <h2 id="listings-title" className="text-lg font-semibold">
          {EVENT_MESSAGES.LISTINGS_TITLE}
        </h2>
        <div role="status" aria-live="polite">
          {state.notice && (
            <Alert>
              <Icon name="triangle-alert" />
              <AlertDescription>{state.notice}</AlertDescription>
            </Alert>
          )}
        </div>
        {sorted.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon name="ticket" />
              </EmptyMedia>
              <EmptyTitle>{EVENT_MESSAGES.NO_LISTINGS}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((listing) => (
              <ListingItem
                key={listing.id}
                listing={listing}
                eventOnSale={eventOnSale}
                selected={listing.id === selected?.id}
                onSelect={select}
              />
            ))}
          </ul>
        )}
      </section>
      <TicketSheet open={selected !== undefined} onClose={closeSilently}>
        {selected && selection && (
          <SelectionPanel
            listing={selected}
            quantity={selection.quantity}
            currentUserId={currentUserId}
            onQuantityChange={changeQuantity}
            onClose={close}
          />
        )}
      </TicketSheet>
    </div>
  );
}
