'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { useAccountMenu } from '@/components/providers/account-menu-provider';
import { ERROR_CODES } from '@/constants/error-codes';
import { TICKET_MESSAGES } from '@/constants/messages';
import type { EventListing } from '@/features/events/types';
import type { CheckoutOutcome } from '@/features/orders/checkout';
import { useCheckout } from '@/features/orders/hooks/use-checkout';
import { ERROR_MESSAGES, getUnknownErrorMessage } from '@/lib/error-message';
import { AppError } from '@/lib/errors';
import { formatVnd } from '@/lib/format';

import { validateQuantity } from '../quantity';
import { quoteQueryOptions } from '../queries';
import { CheckoutAction } from './checkout-action';
import { QuantityField } from './quantity-field';
import { QuoteSummary } from './quote-summary';

// Lỗi cho thấy dữ liệu trang đã cũ → đóng khu chọn, báo, dựng lại trang (spec web § C ngoại lệ)
const CLOSING_CODES = new Set<string>([
  ERROR_CODES.LISTING_NOT_FOUND,
  ERROR_CODES.EVENT_NOT_ON_SALE,
  ERROR_CODES.CANNOT_BUY_OWN_LISTING,
]);
// Dữ liệu cũ nhưng vẫn giữ khu chọn (số vé còn lại đổi, tài khoản không còn)
const REFRESH_CODES = new Set<string>([
  ERROR_CODES.INSUFFICIENT_QUANTITY,
  ERROR_CODES.USER_NOT_FOUND,
]);

interface SelectionPanelProps {
  listing: EventListing;
  quantity: number | null;
  currentUserId: string | null;
  onQuantityChange: (quantity: number | null) => void;
  /** Đóng khu chọn kèm câu báo hiển thị trên danh sách tin bán */
  onClose: (notice: string | null) => void;
}

function shouldClose(err: AppError): boolean {
  if (CLOSING_CODES.has(err.code)) return true;
  return err.code === ERROR_CODES.INSUFFICIENT_QUANTITY && err.details?.available === 0;
}

export function SelectionPanel(props: SelectionPanelProps) {
  const { listing, quantity, currentUserId, onQuantityChange, onClose } = props;
  const router = useRouter();
  const { setOpen: openAccountMenu, setCheckoutPending } = useAccountMenu();
  const quantityError = validateQuantity(quantity, listing.availableQuantity);
  const valid = quantityError === null && quantity !== null;
  const query = useQuery({
    ...quoteQueryOptions(listing.id, quantity ?? 0, currentUserId ?? ''),
    enabled: valid && currentUserId !== null,
  });
  const err = query.error instanceof AppError ? query.error : null;

  useEffect(() => {
    if (!err) return;
    if (shouldClose(err)) {
      onClose(getUnknownErrorMessage(err));
      router.refresh();
    } else if (REFRESH_CODES.has(err.code)) {
      router.refresh();
    }
  }, [err, onClose, router]);

  const handleOutcome = useCallback(
    (outcome: CheckoutOutcome) => {
      if (outcome.openAccountMenu) openAccountMenu(true);
      if (outcome.close) onClose(outcome.message);
      if (outcome.refresh) router.refresh();
    },
    [openAccountMenu, onClose, router],
  );
  const checkout = useCheckout({ listingId: listing.id, quantity, onOutcome: handleOutcome });
  // Báo cho header / danh sách tin: khoá đổi tài khoản, đổi tin, đóng khu chọn khi đang thanh toán
  useEffect(() => {
    setCheckoutPending(checkout.pending);
    return () => setCheckoutPending(false);
  }, [checkout.pending, setCheckoutPending]);

  // keepPreviousData giữ quote của số lượng cũ trong lúc tính lại: chỉ hiện quote đúng số đang nhập
  const quote =
    valid &&
    !query.isPlaceholderData &&
    query.data?.listingId === listing.id &&
    query.data.quantity === quantity
      ? query.data
      : undefined;
  const calculating = valid && currentUserId !== null && !query.isError && !quote;
  const quoteError =
    currentUserId === null
      ? ERROR_MESSAGES[ERROR_CODES.USER_NOT_SELECTED]
      : valid && query.isError
        ? getUnknownErrorMessage(query.error)
        : null;
  const retryable = query.isError && !(err && REFRESH_CODES.has(err.code));

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{TICKET_MESSAGES.SELLER}</dt>
        <dd className="text-right break-words">{listing.seller.displayName}</dd>
        <dt className="text-muted-foreground">{TICKET_MESSAGES.UNIT_PRICE}</dt>
        <dd className="text-right whitespace-nowrap">{formatVnd(listing.unitPrice)}</dd>
        <dt className="text-muted-foreground">{TICKET_MESSAGES.AVAILABLE}</dt>
        <dd className="text-right">{listing.availableQuantity}</dd>
      </dl>
      <QuantityField
        value={quantity}
        max={listing.availableQuantity}
        error={quantityError}
        disabled={checkout.pending}
        onChange={onQuantityChange}
      />
      <QuoteSummary
        quote={quote}
        invalid={!valid}
        loading={calculating || (query.isFetching && valid)}
        error={quoteError}
        onRetry={retryable ? () => void query.refetch() : undefined}
      />
      <CheckoutAction
        disabled={!quote || query.isFetching}
        pending={checkout.pending}
        error={checkout.error}
        onSubmit={checkout.submit}
      />
    </div>
  );
}
