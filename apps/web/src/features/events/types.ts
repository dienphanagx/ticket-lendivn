// Shape theo response schema của api: apps/api/src/features/events/routes.ts
// (`eventListResponse`, `eventDetailResponse`); chỉ parse ở server nên dùng zod classic
import * as z from 'zod';

import '@/lib/zod-config';

export const EVENT_STATUS = { ON_SALE: 'ON_SALE', COMPLETED: 'COMPLETED' } as const;

const eventBaseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  venue: z.string(),
  startsAt: z.iso.datetime(),
  status: z.enum([EVENT_STATUS.ON_SALE, EVENT_STATUS.COMPLETED]),
  completedAt: z.iso.datetime().nullable(),
});

export const eventSummarySchema = eventBaseSchema.extend({
  listingCount: z.int(),
  availableQuantity: z.int(),
  minUnitPrice: z.int().nullable(),
  escrowTotal: z.int(),
  pendingOrderCount: z.int(),
  sellerCount: z.int(),
});

export const eventListingSchema = z.object({
  id: z.string(),
  seller: z.object({ id: z.string(), displayName: z.string() }),
  unitPrice: z.int(),
  quantityTotal: z.int(),
  availableQuantity: z.int(),
  isOwnListing: z.boolean(),
});

export const eventDetailSchema = eventBaseSchema.extend({
  description: z.string(),
  listings: z.array(eventListingSchema),
});

export const eventListResponseSchema = z.object({ data: z.array(eventSummarySchema) });
export const eventDetailResponseSchema = z.object({ data: eventDetailSchema });

export type EventStatus = z.infer<typeof eventBaseSchema>['status'];
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type EventListing = z.infer<typeof eventListingSchema>;
export type EventDetail = z.infer<typeof eventDetailSchema>;

// Slug trên URL (spec web § B Xem Trang Sự Kiện), khớp `SLUG_PATTERN` của api
export const eventSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
