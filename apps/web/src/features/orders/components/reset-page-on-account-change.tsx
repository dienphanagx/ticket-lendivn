'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { FIRST_PAGE } from '@/lib/pagination';

interface ResetPageOnAccountChangeProps {
  userId: string;
  page: number;
  pathname: string;
}

/**
 * Đổi tài khoản khi đang ở trang Đơn hàng (spec web § D): dropdown dựng lại trang giữ `?page=`,
 * nên khi tài khoản đổi mà đang ở trang > 1 thì về trang 1.
 */
export function ResetPageOnAccountChange({
  userId,
  page,
  pathname,
}: ResetPageOnAccountChangeProps) {
  const router = useRouter();
  const previousUserId = useRef(userId);
  useEffect(() => {
    if (previousUserId.current === userId) return;
    previousUserId.current = userId;
    if (page > FIRST_PAGE) router.replace(pathname);
  }, [userId, page, pathname, router]);
  return null;
}
