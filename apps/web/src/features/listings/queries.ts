import { keepPreviousData, queryOptions } from '@tanstack/react-query';

import { bffFetch } from '@/lib/api/bff-fetch';

import { getListingQuoteViaBff } from './api';

export const listingKeys = {
  all: ['listings'] as const,
  quote: (listingId: string, quantity: number, userId: string) =>
    [...listingKeys.all, 'quote', listingId, quantity, userId] as const,
};

/**
 * Bảng tạm tính; giữ quote lần trước (cùng tin bán) trong lúc tính lại để query không về rỗng.
 * Quote giữ lại là của số lượng cũ: UI chỉ hiện khi `quote.quantity` khớp số đang nhập (selection-panel.tsx)
 */
export const quoteQueryOptions = (listingId: string, quantity: number, userId: string) =>
  queryOptions({
    queryKey: listingKeys.quote(listingId, quantity, userId),
    queryFn: ({ signal }) => getListingQuoteViaBff(bffFetch, listingId, quantity, { signal }),
    select: (res) => res.data,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === listingId ? keepPreviousData(previous) : undefined,
  });
