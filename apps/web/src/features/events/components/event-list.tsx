import { Icon } from '@/components/custom/icon';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { EVENT_MESSAGES } from '@/constants/messages';
import { apiFetch } from '@/lib/api/api-fetch';

import { listEvents } from '../api';
import { sortEvents } from '../sort';
import { EventCard } from './event-card';

/** Server Component: lỗi api → bubble lên error.tsx (trang lỗi chung + "Thử lại") */
export async function EventList() {
  const { data } = await listEvents(apiFetch);
  if (data.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon name="ticket" />
          </EmptyMedia>
          <EmptyTitle>{EVENT_MESSAGES.EMPTY}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sortEvents(data).map((event) => (
        <li key={event.id}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}
