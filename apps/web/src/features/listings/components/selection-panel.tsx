'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { ERROR_CODES } from '@/constants/error-codes';
import { TICKET_MESSAGES } from '@/constants/messages';
import type { EventListing } from '@/features/events/types';
import { ERROR_MESSAGES, getUnknownErrorMessage } from '@/lib/error-message';
import { AppError } from '@/lib/errors';
import { formatVnd } from '@/lib/format';

import { validateQuantity } from '../quantity';
import { quoteQueryOptions } from '../queries';
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
        onChange={onQuantityChange}
      />
      <QuoteSummary
        quote={query.data}
        invalid={!valid}
        loading={query.isFetching}
        error={quoteError}
        onRetry={retryable ? () => void query.refetch() : undefined}
      />
      {/* Tạo đơn + chuyển sang VNPay làm ở batch W2; W1 chỉ hiển thị nút ở trạng thái khoá */}
      <Button type="button" className="w-full" disabled>
        {TICKET_MESSAGES.CHECKOUT}
      </Button>
    </div>
  );
}
