'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { FlashNotice } from '@/components/custom/flash-notice';
import { Icon } from '@/components/custom/icon';
import { useAccountMenu } from '@/components/providers/account-menu-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ERROR_CODES } from '@/constants/error-codes';
import { ACCOUNT_MESSAGES, UI_MESSAGES } from '@/constants/messages';
import { getErrorMessage } from '@/lib/error-message';

import { clearCurrentUser, selectUser } from '../actions';
import type { UserSummary } from '../types';

const SWITCH_NOTICE_MS = 3_000; // spec web § A: thông báo tự ẩn sau 3 giây

interface AccountSwitcherProps {
  users: UserSummary[];
  currentUserId: string | null;
  loadFailed: boolean;
  /** Cookie trỏ tới tài khoản không còn trong danh sách (dữ liệu mẫu được nạp lại) */
  stale: boolean;
}

type Notice = { text: string; autoHide: boolean };

export function AccountSwitcher({ users, currentUserId, loadFailed, stale }: AccountSwitcherProps) {
  const { open, setOpen } = useAccountMenu();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Giữ câu báo sau khi cookie đã xoá (lần dựng lại kế tiếp `stale` = false)
  const [showStale, setShowStale] = useState(stale);
  if (stale && !showStale) setShowStale(true);
  const current = users.find((u) => u.id === currentUserId);

  useEffect(() => {
    if (stale) void clearCurrentUser();
  }, [stale]);

  const dismiss = useCallback(() => setNotice(null), []);

  const choose = (userId: string) => {
    setOpen(false);
    if (userId === currentUserId) return;
    startTransition(async () => {
      const result = await selectUser(userId);
      if (result.success) {
        setShowStale(false);
        setNotice({ text: ACCOUNT_MESSAGES.SWITCHED(result.data.displayName), autoHide: true });
        return;
      }
      setNotice({ text: getErrorMessage(result), autoHide: false });
      if (result.code === ERROR_CODES.USER_NOT_FOUND) router.refresh(); // tải lại danh sách
    });
  };

  const retry = () => startTransition(() => router.refresh());

  const message = notice?.text ?? (showStale ? ACCOUNT_MESSAGES.STALE : null);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={isPending} aria-busy={isPending} className="max-w-48">
            <span className="truncate">{current?.displayName ?? ACCOUNT_MESSAGES.PLACEHOLDER}</span>
            <Icon name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{ACCOUNT_MESSAGES.MENU_LABEL}</DropdownMenuLabel>
          {loadFailed ? (
            <>
              <p className="px-1.5 py-2 text-sm text-destructive">{ACCOUNT_MESSAGES.LOAD_FAILED}</p>
              {/* Mục menu cao 44px (spec § Quy Tắc Chung); dropdown-menu.tsx không có variant cỡ */}
              <DropdownMenuItem className="min-h-11" onSelect={retry}>
                {UI_MESSAGES.RETRY}
              </DropdownMenuItem>
            </>
          ) : users.length === 0 ? (
            <p className="px-1.5 py-2 text-sm text-muted-foreground">{ACCOUNT_MESSAGES.EMPTY}</p>
          ) : (
            <DropdownMenuRadioGroup value={current?.id ?? ''} onValueChange={choose}>
              {users.map((user) => (
                <DropdownMenuRadioItem key={user.id} value={user.id} className="min-h-11">
                  {user.displayName}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <FlashNotice
        message={message}
        autoHideMs={notice?.autoHide ? SWITCH_NOTICE_MS : undefined}
        onDismiss={dismiss}
      />
    </>
  );
}
