// Shape theo response schema của api: apps/api/src/features/listings/routes.ts (`quoteResponse`)
// Parse ở cả BFF (server) lẫn trình duyệt → zod/mini
import * as z from '@/lib/zod-mini';

export const quoteSchema = z.object({
  listingId: z.string(),
  unitPrice: z.int(),
  quantity: z.int(),
  subtotal: z.int(),
  buyerFee: z.int(),
  buyerTotal: z.int(),
  availableQuantity: z.int(),
});

export const quoteResponseSchema = z.object({ data: quoteSchema });

export type Quote = z.infer<typeof quoteSchema>;
