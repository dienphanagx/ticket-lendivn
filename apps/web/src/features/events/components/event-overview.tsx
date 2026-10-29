import { Icon } from '@/components/custom/icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EVENT_MESSAGES } from '@/constants/messages';
import { formatDateTime } from '@/lib/format';

import { EVENT_STATUS, type EventDetail } from '../types';
import { EventStatusBadge } from './event-status-badge';

interface EventOverviewProps {
  event: EventDetail;
}

/** Phần đầu trang sự kiện: tên, thời gian, địa điểm, mô tả, trạng thái */
export function EventOverview({ event }: EventOverviewProps) {
  return (
    <section className="flex flex-col gap-3">
      <EventStatusBadge status={event.status} />
      <h1 className="text-2xl font-semibold break-words">{event.name}</h1>
      <dl className="grid gap-1 text-sm text-muted-foreground">
        <div>
          <dt className="sr-only">{EVENT_MESSAGES.TIME}</dt>
          <dd className="flex items-center gap-2">
            <Icon name="calendar" className="size-4 shrink-0" />
            <time dateTime={event.startsAt}>{formatDateTime(event.startsAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="sr-only">{EVENT_MESSAGES.VENUE}</dt>
          <dd className="flex items-center gap-2">
            <Icon name="map-pin" className="size-4 shrink-0" />
            <span className="min-w-0 break-words">{event.venue}</span>
          </dd>
        </div>
      </dl>
      {event.description && <p className="text-sm whitespace-pre-line">{event.description}</p>}
      {event.status === EVENT_STATUS.COMPLETED && (
        <Alert>
          <Icon name="triangle-alert" />
          <AlertDescription>{EVENT_MESSAGES.ENDED_BANNER}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
