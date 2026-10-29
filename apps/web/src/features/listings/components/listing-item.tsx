import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EVENT_MESSAGES } from '@/constants/messages';
import type { EventListing } from '@/features/events/types';
import { formatVnd } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ListingItemProps {
  listing: EventListing;
  eventOnSale: boolean;
  selected: boolean;
  /** Đang thanh toán tin khác → không đổi tin */
  locked?: boolean;
  onSelect: (listing: EventListing) => void;
}

/** 1 tin bán: người bán, giá mỗi vé, số vé còn lại, nhãn, nút "Chọn" (spec web § B Trang Sự Kiện) */
export function ListingItem(props: ListingItemProps) {
  const { listing, eventOnSale, selected, locked = false, onSelect } = props;
  const soldOut = eventOnSale && listing.availableQuantity === 0;
  const sellerId = `listing-${listing.id}-seller`;
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        selected && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span id={sellerId} className="break-words">
            {listing.seller.displayName}
          </span>
          {listing.isOwnListing && <Badge variant="outline">{EVENT_MESSAGES.OWN_LISTING}</Badge>}
          {soldOut && <Badge variant="secondary">{EVENT_MESSAGES.SOLD_OUT}</Badge>}
        </p>
        <p className="text-sm font-semibold whitespace-nowrap">{formatVnd(listing.unitPrice)}</p>
        {eventOnSale && !soldOut && (
          <p className="text-sm text-muted-foreground">
            {EVENT_MESSAGES.REMAINING(listing.availableQuantity)}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant={selected ? 'default' : 'outline'}
        className="w-full sm:w-auto"
        disabled={!eventOnSale || soldOut || listing.isOwnListing || locked}
        aria-describedby={sellerId}
        onClick={() => onSelect(listing)}
      >
        {EVENT_MESSAGES.SELECT}
      </Button>
    </li>
  );
}
