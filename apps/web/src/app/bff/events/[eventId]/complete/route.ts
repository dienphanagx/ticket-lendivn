// BFF đánh dấu sự kiện kết thúc (spec web § E): Khu Quản Trị không phân quyền nhưng cần đã chọn tài khoản
import type { NextRequest } from 'next/server';

import { completeEvent } from '@/features/admin/api';
import { apiFetch } from '@/lib/api/api-fetch';
import {
  bffCall,
  bffCrossSite,
  bffUserNotSelected,
  bffValidationError,
} from '@/lib/api/bff-response';
import { isSameOrigin } from '@/lib/api/same-origin';
import { getCurrentUserId } from '@/lib/current-user';
import { ENTITY_ID_MAX_LENGTH, ENTITY_ID_PATTERN } from '@/lib/ids';
import * as z from '@/lib/zod-mini';

// Khớp `entityIdSchema` của param `eventId` bên api
const paramsSchema = z.object({
  eventId: z
    .string()
    .check(z.minLength(1), z.maxLength(ENTITY_ID_MAX_LENGTH), z.regex(ENTITY_ID_PATTERN)),
});

export async function POST(
  request: NextRequest,
  { params }: RouteContext<'/bff/events/[eventId]/complete'>,
) {
  // Thao tác ghi một chiều: chặn request cross-site (cookie `current_user_id` tự gửi kèm)
  if (!(await isSameOrigin(request))) return bffCrossSite();
  const parsed = z.safeParse(paramsSchema, await params);
  if (!parsed.success) return bffValidationError(parsed.error);
  if (!(await getCurrentUserId())) return bffUserNotSelected();
  // Không chuyển `request.signal`: trình duyệt huỷ giữa chừng không được bỏ dở thao tác đã gửi api
  return bffCall(() => completeEvent(apiFetch, parsed.data.eventId));
}
