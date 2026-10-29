import Link from 'next/link';

import { Icon } from '@/components/custom/icon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EVENT_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatVnd } from '@/lib/format';

import { EVENT_STATUS, type EventSummary } from '../types';
import { EventStatusBadge } from './event-status-badge';

interface EventCardProps {
  event: EventSummary;
}

/** Giá thấp nhất + số vé còn lại; hết vé → "Hết vé"; đã kết thúc → không hiện (spec web § B) */
function EventStock({ event }: EventCardProps) {
  if (event.status !== EVENT_STATUS.ON_SALE) return null;
  if (event.availableQuantity === 0 || event.minUnitPrice === null) {
    return <p className="font-medium text-muted-foreground">{EVENT_MESSAGES.SOLD_OUT}</p>;
  }
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-semibold whitespace-nowrap">
        {EVENT_MESSAGES.PRICE_FROM(formatVnd(event.minUnitPrice))}
      </span>
      <span className="text-muted-foreground">
        {EVENT_MESSAGES.REMAINING(event.availableQuantity)}
      </span>
    </p>
  );
}

export function EventCard({ event }: EventCardProps) {
  return (
    <Link
      href={ROUTES.EVENT(event.slug)}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader className="gap-2">
          <EventStatusBadge status={event.status} />
          <CardTitle className="text-base break-words">{event.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <ul className="flex flex-col gap-1 text-muted-foreground">
            <li className="flex items-center gap-2">
              <Icon name="calendar" className="size-4 shrink-0" />
              <time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="map-pin" className="size-4 shrink-0" />
              <span className="min-w-0 break-words">{event.venue}</span>
            </li>
          </ul>
          <EventStock event={event} />
        </CardContent>
      </Card>
    </Link>
  );
}
