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

/** Bộ lọc giữ nguyên khi đổi trang; key `undefined` bị bỏ */
export type PageQuery = Readonly<Record<string, string | undefined>>;

/** Link trang: trang 1 không kèm `page`; bộ lọc (nếu có) đứng trước `page` */
export function pageHref(pathname: string, page: number, query: PageQuery = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  if (page > FIRST_PAGE) search.set('page', String(page));
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
