'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useAccountMenu } from '@/components/providers/account-menu-provider';
import { ADMIN_MESSAGES } from '@/constants/messages';
import { formatVnd } from '@/lib/format';

import { resolveCompleteError } from '../completion';
import { useCompleteEventMutation } from '../mutations';
import type { AdminEvent } from '../types';

/**
 * "Đánh dấu kết thúc" → modal xác nhận → `POST /bff/events/:id/complete` (spec web § E).
 * Mỗi lần bấm chỉ 1 yêu cầu; modal không đóng được khi đang gửi; xong → dựng lại danh sách từ server.
 */
export function useCompleteEvent() {
  const router = useRouter();
  const { setOpen: setAccountMenuOpen } = useAccountMenu();
  const mutation = useCompleteEventMutation();
  // Chặn lần bấm thứ 2 trước khi React kịp render trạng thái khoá
  const inFlight = useRef(false);
  const [target, setTarget] = useState<AdminEvent | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Dựng lại danh sách sau khi kết thúc: tới khi RSC mới về, dòng cũ vẫn ON_SALE → giữ khoá nút
  const [refreshing, startRefresh] = useTransition();
  const refresh = () => startRefresh(() => router.refresh());

  const open = (event: AdminEvent) => {
    if (inFlight.current || refreshing) return;
    setDialogError(null);
    setTarget(event);
  };

  const cancel = () => {
    if (inFlight.current) return;
    setTarget(null);
  };

  const confirm = () => {
    if (inFlight.current || !target) return;
    inFlight.current = true;
    setDialogError(null);
    const event = target;
    mutation.mutate(event.id, {
      onSuccess: (result) => {
        inFlight.current = false;
        setTarget(null);
        setNotice(
          ADMIN_MESSAGES.COMPLETED(
            event.name,
            formatVnd(result.releasedTotal),
            result.sellerReleases.length,
          ),
        );
        refresh();
      },
      onError: (err) => {
        inFlight.current = false;
        const outcome = resolveCompleteError(err);
        if (!outcome.close) {
          setDialogError(outcome.message);
          return;
        }
        setTarget(null);
        setNotice(outcome.message);
        if (outcome.openAccountMenu) setAccountMenuOpen(true);
        if (outcome.refresh) refresh();
      },
    });
  };

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    target,
    dialogError,
    notice,
    pending: mutation.isPending || refreshing,
    open,
    cancel,
    confirm,
    dismissNotice,
  };
}
