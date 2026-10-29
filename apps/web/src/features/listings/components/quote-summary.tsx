import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TICKET_MESSAGES, UI_MESSAGES } from '@/constants/messages';
import { formatVnd } from '@/lib/format';

import type { Quote } from '../types';

interface QuoteSummaryProps {
  /** Chỉ quote của đúng số lượng đang nhập; chưa có → skeleton (đang tính) hoặc "—" */
  quote: Quote | undefined;
  /** Số lượng không hợp lệ → mọi ô hiện "—" */
  invalid: boolean;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

const ROWS = [
  { label: TICKET_MESSAGES.SUBTOTAL, pick: (q: Quote) => q.subtotal },
  { label: TICKET_MESSAGES.BUYER_FEE, pick: (q: Quote) => q.buyerFee },
  { label: TICKET_MESSAGES.TOTAL, pick: (q: Quote) => q.buyerTotal, total: true },
] as const;

/** Bảng tạm tính từ quote của api (tiền vé, phí dịch vụ 10%, tổng) */
export function QuoteSummary({ quote, invalid, loading, error, onRetry }: QuoteSummaryProps) {
  const shown = invalid ? undefined : quote;
  return (
    <div className="flex flex-col gap-2">
      <dl aria-busy={loading} className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
        {ROWS.map((row) => (
          <div
            key={row.label}
            className={
              'total' in row
                ? 'flex justify-between gap-4 border-t pt-2 font-semibold'
                : 'flex justify-between gap-4'
            }
          >
            <dt>{row.label}</dt>
            <dd className="whitespace-nowrap tabular-nums">
              {shown ? (
                formatVnd(row.pick(shown))
              ) : loading && !invalid ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                TICKET_MESSAGES.EMPTY_VALUE
              )}
            </dd>
          </div>
        ))}
      </dl>
      {error && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          {onRetry && (
            <Button type="button" variant="outline" onClick={onRetry}>
              {UI_MESSAGES.RETRY}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
