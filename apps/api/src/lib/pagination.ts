import * as z from 'zod';

// Phân trang offset (spec api § Quy Tắc Chung): `page` ≥ 1 mặc định 1, `limit` 1–100 mặc định 20.
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export type PageParams = z.infer<typeof paginationQuerySchema>;

export const pageMetaSchema = z.object({
  total: z.int(),
  page: z.int(),
  limit: z.int(),
  totalPages: z.int(),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;

export const toOffset = ({ page, limit }: PageParams): number => (page - 1) * limit;

/** `totalPages` = làm tròn lên `total / limit`, bằng 0 khi `total` = 0. */
export const buildPageMeta = (total: number, { page, limit }: PageParams): PageMeta => ({
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
});
