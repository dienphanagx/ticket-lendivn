import { Icon } from '@/components/custom/icon';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { EVENT_MESSAGES } from '@/constants/messages';
import { listEvents } from '@/features/events/api';
import { sortEvents } from '@/features/events/sort';
import { apiFetch } from '@/lib/api/api-fetch';

import type { AdminEvent } from '../types';
import { AdminEventList } from './admin-event-list';

/** Server Component: sự kiện kèm ký quỹ / đơn chờ tại thời điểm dựng trang; lỗi api → error.tsx */
export async function AdminEventSection() {
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
  // Chỉ chuyển field cần hiển thị xuống Client Component
  const events: AdminEvent[] = sortEvents(data).map((e) => ({
    id: e.id,
    name: e.name,
    startsAt: e.startsAt,
    status: e.status,
    escrowTotal: e.escrowTotal,
    pendingOrderCount: e.pendingOrderCount,
    sellerCount: e.sellerCount,
  }));
  return <AdminEventList events={events} />;
}
