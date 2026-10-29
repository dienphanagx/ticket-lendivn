// Nạp dữ liệu trang sự kiện, dùng chung page + generateMetadata trong 1 request
import 'server-only';

import { cache } from 'react';

import { ERROR_CODES } from '@/constants/error-codes';
import { apiFetch, apiFetchAnonymous, isApiError } from '@/lib/api/api-fetch';
import { getCurrentUserId } from '@/lib/current-user';

import { getEventBySlug } from './api';
import { eventSlugSchema, type EventDetail } from './types';

export type EventPageData = { event: EventDetail; currentUserId: string | null };

/** null = slug sai dạng (không gọi api) hoặc sự kiện không tồn tại → trang 404 */
export const loadEventPage = cache(async (slug: string): Promise<EventPageData | null> => {
  if (!eventSlugSchema.safeParse(slug).success) return null;
  const currentUserId = await getCurrentUserId();
  try {
    const { data } = await getEventBySlug(apiFetch, slug);
    return { event: data, currentUserId };
  } catch (err) {
    if (isApiError(err, ERROR_CODES.EVENT_NOT_FOUND)) return null;
    // Tài khoản trong cookie không còn: vẫn xem được sự kiện như chưa chọn (header báo chọn lại)
    if (isApiError(err, ERROR_CODES.USER_NOT_FOUND)) {
      const { data } = await getEventBySlug(apiFetchAnonymous, slug).catch((retryErr: unknown) => {
        if (isApiError(retryErr, ERROR_CODES.EVENT_NOT_FOUND)) return { data: null };
        throw retryErr;
      });
      return data ? { event: data, currentUserId: null } : null;
    }
    throw err; // lỗi hệ thống / timeout → error.tsx
  }
});
