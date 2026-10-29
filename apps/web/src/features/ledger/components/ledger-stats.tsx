import { formatVnd } from '@/lib/format';

interface LedgerStatsProps {
  items: ReadonlyArray<{ label: string; amount: number }>;
}

/** Ô tổng (Σ nợ / Σ có / số dư) — số do api tính từ sổ cái, web không cộng lại */
export function LedgerStats({ items }: LedgerStatsProps) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 rounded-xl border p-4">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="text-lg font-semibold break-all tabular-nums">{formatVnd(item.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}
