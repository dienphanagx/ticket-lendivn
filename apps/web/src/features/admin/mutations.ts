import { useMutation } from '@tanstack/react-query';

import { bffFetch } from '@/lib/api/bff-fetch';

import { completeEventViaBff } from './api';
import type { EventCompletion } from './types';

/** Không tự gửi lại (mutation mặc định `retry: false`): mỗi lần bấm chỉ 1 yêu cầu */
export const useCompleteEventMutation = () =>
  useMutation<EventCompletion, unknown, string>({
    mutationFn: async (eventId) => (await completeEventViaBff(bffFetch, eventId)).data,
  });
