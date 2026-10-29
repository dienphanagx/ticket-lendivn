// Shape theo response schema của api: apps/api/src/features/users/routes.ts (`userListResponse`)
// Không có OpenAPI / gen:api (specs/architecture.md § API Conventions) → schema viết tay, parse lúc chạy
import * as z from 'zod';

export const userSummarySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  hasListings: z.boolean(),
});

export const userListResponseSchema = z.object({ data: z.array(userSummarySchema) });

export type UserSummary = z.infer<typeof userSummarySchema>;
