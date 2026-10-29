// Shape theo `completionResponse` của apps/api/src/features/events/routes.ts
// (`POST /v1/events/:eventId/complete`); parse ở cả BFF lẫn trình duyệt → zod/mini
import type { EventSummary } from '@/features/events/types';
import * as z from '@/lib/zod-mini';

export const eventCompletionResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    status: z.literal('COMPLETED'),
    completedAt: z.iso.datetime(),
    expiredOrderCount: z.int(),
    /** Σ tiền chuyển khỏi ký quỹ (người bán + phí sàn) */
    releasedTotal: z.int(),
    sellerReleases: z.array(
      z.object({
        seller: z.object({ id: z.string(), displayName: z.string() }),
        amount: z.int(),
      }),
    ),
    platformFeeAmount: z.int(),
    ledgerTransactionId: z.nullable(z.string()),
  }),
});

export type EventCompletion = z.infer<typeof eventCompletionResponseSchema>['data'];

/** Dòng sự kiện ở trang Quản trị (spec web § E bước 2) — chỉ field cần hiển thị, truyền xuống client */
export type AdminEvent = Pick<
  EventSummary,
  'id' | 'name' | 'startsAt' | 'status' | 'escrowTotal' | 'pendingOrderCount' | 'sellerCount'
>;
