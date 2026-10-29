import { Suspense } from 'react';
import type { Metadata } from 'next';

import { EVENT_MESSAGES } from '@/constants/messages';
import { EventList } from '@/features/events/components/event-list';
import { EventListSkeleton } from '@/features/events/components/event-list-skeleton';

export const metadata: Metadata = { title: EVENT_MESSAGES.LIST_TITLE };

// Không đặt loading.tsx ở root: nó bọc cả /su-kien/[slug] (cần 404 thật) — skeleton qua Suspense tại trang
export default function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{EVENT_MESSAGES.LIST_TITLE}</h1>
      <Suspense fallback={<EventListSkeleton />}>
        <EventList />
      </Suspense>
    </div>
  );
}
