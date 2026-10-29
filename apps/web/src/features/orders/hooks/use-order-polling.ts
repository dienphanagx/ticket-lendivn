'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ERROR_CODES } from '@/constants/error-codes';
import { AppError } from '@/lib/errors';

import { orderDetailQueryOptions } from '../queries';
import type { OrderDetail } from '../types';

// spec web § C Xem Kết Quả Thanh Toán: hỏi lại tối đa 120 giây tính từ lúc tải trang / bấm "Kiểm tra lại"
export const POLL_WINDOW_MS = 120_000;
const MS_PER_SECOND = 1_000;

/** Lỗi dừng hỏi lại: đơn không còn trong phạm vi xem (đổi tài khoản) hoặc cookie tài khoản đã mất */
export type PollStop = 'notFound' | 'accountRequired' | null;

function stopReason(error: unknown): PollStop {
  if (!(error instanceof AppError)) return null;
  if (error.code === ERROR_CODES.ORDER_NOT_FOUND) return 'notFound';
  if (error.code === ERROR_CODES.USER_NOT_SELECTED) return 'accountRequired';
  return null;
}

/**
 * Hỏi lại `/bff/orders/:orderId` sau `retryAfterSeconds` của lần phản hồi thành công gần nhất (chỉ có
 * khi đơn còn chờ); lỗi mạng / hệ thống giữ khối trạng thái và hẹn lần kế tiếp theo cùng nhịp.
 */
export function useOrderPolling(initialOrder: OrderDetail, userId: string) {
  const query = useQuery(orderDetailQueryOptions(initialOrder, userId));
  const { refetch, isFetching } = query;
  const order = query.data;
  const stop = stopReason(query.error);
  const retryAfterSeconds = stop ? null : order.retryAfterSeconds;
  const awaiting = retryAfterSeconds !== null;
  // Mỗi lần bấm "Kiểm tra lại" mở 1 chu kỳ 120 giây mới
  const [cycle, setCycle] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const lastSettledAt = Math.max(query.dataUpdatedAt, query.errorUpdatedAt);

  useEffect(() => {
    if (!awaiting || timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), POLL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [awaiting, timedOut, cycle]);

  useEffect(() => {
    if (retryAfterSeconds === null || timedOut || isFetching) return;
    const timer = setTimeout(() => void refetch(), retryAfterSeconds * MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [retryAfterSeconds, timedOut, isFetching, lastSettledAt, refetch]);

  const checkAgain = () => {
    setTimedOut(false);
    setCycle((c) => c + 1);
    void refetch();
  };

  return { order, stop, timedOut: awaiting && timedOut, checking: isFetching, checkAgain };
}
