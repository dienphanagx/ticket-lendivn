import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EventOverview } from '@/features/events/components/event-overview';
import { loadEventPage } from '@/features/events/loaders';
import { EVENT_STATUS } from '@/features/events/types';
import { TicketPicker } from '@/features/listings/components/ticket-picker';

// Không có loading.tsx ở segment này: nạp + notFound() trước khi stream để 404 giữ đúng status
export async function generateMetadata({
  params,
}: PageProps<'/su-kien/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadEventPage(slug);
  return page ? { title: page.event.name } : {};
}

export default async function EventPage({ params }: PageProps<'/su-kien/[slug]'>) {
  const { slug } = await params;
  const page = await loadEventPage(slug);
  if (!page) notFound();
  const { event, currentUserId } = page;
  return (
    <div className="flex flex-col gap-6">
      <EventOverview event={event} />
      <TicketPicker
        listings={event.listings}
        eventOnSale={event.status === EVENT_STATUS.ON_SALE}
        currentUserId={currentUserId}
      />
    </div>
  );
}
