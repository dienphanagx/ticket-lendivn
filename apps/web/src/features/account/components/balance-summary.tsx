import { BALANCE_MESSAGES } from '@/constants/messages';
import { formatVnd } from '@/lib/format';

import type { Balance } from '../types';

interface BalanceSummaryProps {
  balance: Pick<Balance, 'pendingBalance' | 'availableBalance' | 'availableBreakdown'>;
}

/** Hai ô số dư (spec web § D bước 2); số do api tính từ sổ cái, web không cộng lại */
export function BalanceSummary({ balance }: BalanceSummaryProps) {
  const { pendingBalance, availableBalance, availableBreakdown } = balance;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1 rounded-xl border p-4">
        <dt className="text-sm text-muted-foreground">{BALANCE_MESSAGES.PENDING}</dt>
        <dd className="text-2xl font-semibold tabular-nums">{formatVnd(pendingBalance)}</dd>
        <dd className="text-sm text-muted-foreground">{BALANCE_MESSAGES.PENDING_HINT}</dd>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border p-4">
        <dt className="text-sm text-muted-foreground">{BALANCE_MESSAGES.AVAILABLE}</dt>
        <dd className="text-2xl font-semibold tabular-nums">{formatVnd(availableBalance)}</dd>
        <dd className="text-sm text-muted-foreground tabular-nums">
          {BALANCE_MESSAGES.AVAILABLE_SALES}: {formatVnd(availableBreakdown.sales)} ·{' '}
          {BALANCE_MESSAGES.AVAILABLE_REFUNDS}: {formatVnd(availableBreakdown.refunds)}
        </dd>
      </div>
    </dl>
  );
}
