'use client';

import { FlashNotice } from '@/components/custom/flash-notice';

import { useCompleteEvent } from '../hooks/use-complete-event';
import type { AdminEvent } from '../types';
import { AdminEventItem } from './admin-event-item';
import { CompleteEventDialog } from './complete-event-dialog';

const NOTICE_MS = 6_000;

interface AdminEventListProps {
  events: AdminEvent[];
}

/** Danh sách sự kiện + modal kết thúc; danh sách mới đến từ server sau `router.refresh()` */
export function AdminEventList({ events }: AdminEventListProps) {
  const { target, dialogError, notice, pending, open, cancel, confirm, dismissNotice } =
    useCompleteEvent();
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {events.map((event) => (
          <AdminEventItem key={event.id} event={event} disabled={pending} onComplete={open} />
        ))}
      </ul>
      <CompleteEventDialog
        event={target}
        pending={pending}
        error={dialogError}
        onConfirm={confirm}
        onCancel={cancel}
      />
      <FlashNotice message={notice} autoHideMs={NOTICE_MS} onDismiss={dismissNotice} />
    </>
  );
}
