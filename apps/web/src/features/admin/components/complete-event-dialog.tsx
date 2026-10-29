'use client';

import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ADMIN_MESSAGES } from '@/constants/messages';
import { formatVnd } from '@/lib/format';

import type { AdminEvent } from '../types';

interface CompleteEventDialogProps {
  /** `null` = modal đóng */
  event: AdminEvent | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal xác nhận kết thúc sự kiện (spec web § E bước 4); số liệu lấy từ `GET /v1/events` */
export function CompleteEventDialog({
  event,
  pending,
  error,
  onConfirm,
  onCancel,
}: CompleteEventDialogProps) {
  // Giữ nội dung sự kiện cuối trong lúc modal chạy hiệu ứng đóng
  const [shown, setShown] = useState(event);
  if (event && event !== shown) setShown(event);

  return (
    <AlertDialog open={event !== null} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent>
        {shown && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="break-words">
                {ADMIN_MESSAGES.CONFIRM_TITLE(shown.name)}
              </AlertDialogTitle>
              <AlertDialogDescription>{ADMIN_MESSAGES.CONFIRM_IRREVERSIBLE}</AlertDialogDescription>
            </AlertDialogHeader>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{ADMIN_MESSAGES.RELEASE_AMOUNT}</dt>
              <dd className="text-right font-semibold whitespace-nowrap tabular-nums">
                {formatVnd(shown.escrowTotal)}
              </dd>
              <dt className="text-muted-foreground">{ADMIN_MESSAGES.SELLER_COUNT}</dt>
              <dd className="text-right tabular-nums">{shown.sellerCount}</dd>
              <dt className="text-muted-foreground">{ADMIN_MESSAGES.EXPIRING_ORDERS}</dt>
              <dd className="text-right tabular-nums">{shown.pendingOrderCount}</dd>
            </dl>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{ADMIN_MESSAGES.CANCEL}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                aria-busy={pending}
                onClick={(e) => {
                  // Action của Radix tự đóng modal → giữ mở tới khi có phản hồi
                  e.preventDefault();
                  onConfirm();
                }}
              >
                {pending ? ADMIN_MESSAGES.CONFIRM_PENDING : ADMIN_MESSAGES.CONFIRM}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
