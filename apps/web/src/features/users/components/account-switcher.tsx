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
import { ERROR_MESSAGES, getErrorMessage } from '@/lib/error-message';

import { actionFailure } from '../action-failure';
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

// retryUserId: lỗi hệ thống → nút "Thử lại" chọn lại đúng tài khoản đó (spec web § Quy Tắc Chung)
type Notice = { text: string; autoHide: boolean; retryUserId?: string };

export function AccountSwitcher({ users, currentUserId, loadFailed, stale }: AccountSwitcherProps) {
  const { open, setOpen, checkoutPending } = useAccountMenu();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Giữ câu báo sau khi cookie đã xoá (lần dựng lại kế tiếp `stale` = false)
  const [showStale, setShowStale] = useState(stale);
  if (stale && !showStale) setShowStale(true);
  const current = users.find((u) => u.id === currentUserId);

  useEffect(() => {
    // Mất mạng: cookie cũ còn đó, lần tải trang sau thử xoá lại
    if (stale) clearCurrentUser().catch(() => undefined);
  }, [stale]);

  const dismiss = useCallback(() => setNotice(null), []);

  const choose = (userId: string) => {
    setOpen(false);
    // Đang thanh toán: đổi cookie lúc này làm bước lấy URL cổng chạy dưới tài khoản khác
    if (userId === currentUserId || checkoutPending) return;
    setNotice(null); // câu lỗi cũ (kèm nút "Thử lại") không còn đúng khi đang đổi tài khoản
    startTransition(async () => {
      const result = await selectUser(userId).catch(actionFailure);
      if (result.success) {
        setShowStale(false);
        setNotice({ text: ACCOUNT_MESSAGES.SWITCHED(result.data.displayName), autoHide: true });
        return;
      }
      const text = getErrorMessage(result);
      // Mất mạng / mã nghiệp vụ không kèm nút; chỉ lỗi hệ thống (câu chung) mới có "Thử lại"
      setNotice({
        text,
        autoHide: false,
        retryUserId: text === ERROR_MESSAGES.generic ? userId : undefined,
      });
      if (result.code === ERROR_CODES.USER_NOT_FOUND) router.refresh(); // tải lại danh sách
    });
  };

  const retry = () => {
    // Offline: router.refresh() rơi về tải lại toàn trang → trang "No internet" của trình duyệt.
    // Chỉ chặn được khi trình duyệt biết đã offline; mạng chập chờn vẫn đi tiếp refresh
    if (!navigator.onLine) {
      setNotice({ text: ERROR_MESSAGES.NETWORK_ERROR, autoHide: false });
      return;
    }
    startTransition(() => router.refresh());
  };

  // Đang thanh toán: không đổi được tài khoản → ẩn nút (choose cũng thoát sớm)
  const retryUserId = checkoutPending ? undefined : notice?.retryUserId;
  const retryChoose = () => {
    if (retryUserId) choose(retryUserId);
  };

  const message = notice?.text ?? (showStale ? ACCOUNT_MESSAGES.STALE : null);

  return (
    <>
      <DropdownMenu open={open && !checkoutPending} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            disabled={isPending || checkoutPending}
            aria-busy={isPending}
            className="max-w-48"
          >
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
        action={retryUserId ? { label: UI_MESSAGES.RETRY, onClick: retryChoose } : undefined}
        onDismiss={dismiss}
      />
    </>
  );
}
