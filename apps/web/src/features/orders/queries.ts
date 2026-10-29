import { queryOptions } from '@tanstack/react-query';

import { bffFetch } from '@/lib/api/bff-fetch';

import { getOrderViaBff } from './api';
import type { OrderDetail } from './types';

export const orderKeys = {
  all: ['orders'] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (orderId: string, userId: string) => [...orderKeys.details(), orderId, userId] as const,
};

/**
 * Trạng thái đơn ở trang kết quả: dữ liệu đầu từ server (SSR); nhịp hỏi lại do `useOrderPolling` đặt.
 * `staleTime: Infinity` để mount không gọi lại ngay; `gcTime: 0` để lần vào trang sau lấy lại dữ liệu SSR mới
 */
export const orderDetailQueryOptions = (initialOrder: OrderDetail, userId: string) =>
  queryOptions({
    queryKey: orderKeys.detail(initialOrder.id, userId),
    queryFn: async ({ signal }) =>
      (await getOrderViaBff(bffFetch, initialOrder.id, { signal })).data,
    initialData: initialOrder,
    staleTime: Infinity,
    gcTime: 0,
  });
