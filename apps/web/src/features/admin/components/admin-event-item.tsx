import { Button } from '@/components/ui/button';
import { ADMIN_MESSAGES } from '@/constants/messages';
import { EventStatusBadge } from '@/features/events/components/event-status-badge';
import { EVENT_STATUS } from '@/features/events/types';
import { formatDateTime, formatVnd } from '@/lib/format';

import type { AdminEvent } from '../types';

interface AdminEventItemProps {
  event: AdminEvent;
  /** Đang gửi yêu cầu kết thúc (bất kỳ sự kiện nào) → khoá mọi nút */
  disabled: boolean;
  onComplete: (event: AdminEvent) => void;
}

/** 1 sự kiện ở trang Quản trị (spec web § E bước 2); nút "Đánh dấu kết thúc" chỉ ở sự kiện đang bán */
export function AdminEventItem({ event, disabled, onComplete }: AdminEventItemProps) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-medium break-words">{event.name}</h2>
        <EventStatusBadge status={event.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{ADMIN_MESSAGES.EVENT_TIME}</dt>
        <dd className="text-right tabular-nums">{formatDateTime(event.startsAt)}</dd>
        <dt className="text-muted-foreground">{ADMIN_MESSAGES.ESCROW}</dt>
        <dd className="text-right font-semibold whitespace-nowrap tabular-nums">
          {formatVnd(event.escrowTotal)}
        </dd>
        <dt className="text-muted-foreground">{ADMIN_MESSAGES.PENDING_ORDERS}</dt>
        <dd className="text-right tabular-nums">{event.pendingOrderCount}</dd>
      </dl>
      {event.status === EVENT_STATUS.ON_SALE && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={disabled}
          onClick={() => onComplete(event)}
        >
          {ADMIN_MESSAGES.COMPLETE}
        </Button>
      )}
    </li>
  );
}
