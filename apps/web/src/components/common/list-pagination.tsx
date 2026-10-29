import Link from 'next/link';

import { Icon } from '@/components/custom/icon';
import { Button } from '@/components/ui/button';
import { PAGINATION_MESSAGES } from '@/constants/messages';
import { pageHref, type PageMeta } from '@/lib/pagination';

interface ListPaginationProps {
  pathname: string;
  meta: PageMeta;
}

/** Trang trước / sau theo `meta` api trả; `totalPages` ≤ 1 → ẩn; đổi trang = điều hướng dựng lại từ server */
export function ListPagination({ pathname, meta }: ListPaginationProps) {
  if (meta.totalPages <= 1) return null;
  const hasPrevious = meta.page > 1;
  const hasNext = meta.page < meta.totalPages;
  return (
    <nav
      aria-label={PAGINATION_MESSAGES.LABEL}
      className="flex items-center justify-between gap-2 sm:justify-end"
    >
      {hasPrevious ? (
        <Button asChild variant="outline" size="icon">
          <Link
            href={pageHref(pathname, meta.page - 1)}
            rel="prev"
            aria-label={PAGINATION_MESSAGES.PREVIOUS}
          >
            <Icon name="chevron-left" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label={PAGINATION_MESSAGES.PREVIOUS}>
          <Icon name="chevron-left" />
        </Button>
      )}
      <span aria-current="page" className="text-sm tabular-nums">
        {PAGINATION_MESSAGES.STATUS(meta.page, meta.totalPages)}
      </span>
      {hasNext ? (
        <Button asChild variant="outline" size="icon">
          <Link
            href={pageHref(pathname, meta.page + 1)}
            rel="next"
            aria-label={PAGINATION_MESSAGES.NEXT}
          >
            <Icon name="chevron-right" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="icon" disabled aria-label={PAGINATION_MESSAGES.NEXT}>
          <Icon name="chevron-right" />
        </Button>
      )}
    </nav>
  );
}
