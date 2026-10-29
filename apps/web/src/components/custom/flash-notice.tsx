'use client';

import { useEffect } from 'react';

interface FlashNoticeProps {
  message: string | null;
  /** Có giá trị → tự ẩn sau số ms này; không có → giữ tới khi caller xoá */
  autoHideMs?: number;
  onDismiss: () => void;
}

/**
 * Thông báo ngắn nổi trên đầu trang. Không dùng sonner: sonner chèn `<style>` không mang nonce,
 * bị CSP `style-src 'nonce-…'` của src/lib/csp.ts chặn.
 */
export function FlashNotice({ message, autoHideMs, onDismiss }: FlashNoticeProps) {
  useEffect(() => {
    if (!message || autoHideMs === undefined) return;
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
  }, [message, autoHideMs, onDismiss]);

  // Vùng live luôn có trong DOM để trình đọc màn hình đọc được câu mới chèn vào
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-4 sm:top-14"
    >
      {message && (
        <p className="pointer-events-auto max-w-sm rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
          {message}
        </p>
      )}
    </div>
  );
}
