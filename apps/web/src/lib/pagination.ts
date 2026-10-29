// Phân trang theo `?page=` + `meta` của api (specs/functional-spec/web.md § Quy Tắc Chung)
import * as z from '@/lib/zod-mini';

export const FIRST_PAGE = 1;

export const pageMetaSchema = z.object({
  total: z.int(),
  page: z.int(),
  limit: z.int(),
  totalPages: z.int(),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;

const DIGITS = /^\d+$/;

/** Tham số `page` trên URL: số nguyên ≥ 1, thiếu / sai dạng / lặp key → trang 1 */
export function parsePageParam(raw: string | string[] | undefined): number {
  if (typeof raw !== 'string' || !DIGITS.test(raw)) return FIRST_PAGE;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= FIRST_PAGE ? page : FIRST_PAGE;
}

/** `page` vượt `totalPages` (khi có ít nhất 1 trang) → về trang 1 */
export const isPageOutOfRange = (page: number, meta: PageMeta) =>
  meta.totalPages >= FIRST_PAGE && page > meta.totalPages;

/** Link trang: trang 1 không kèm query */
export const pageHref = (pathname: string, page: number) =>
  page <= FIRST_PAGE ? pathname : `${pathname}?page=${page}`;
