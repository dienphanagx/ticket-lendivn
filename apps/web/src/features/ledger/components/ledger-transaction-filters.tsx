import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { pageHref } from '@/lib/pagination';

import { txnTypeLabel } from '../labels';
import { LEDGER_TXN_TYPE, type LedgerFilter } from '../types';

interface LedgerTransactionFiltersProps {
  filter: LedgerFilter;
  events: ReadonlyArray<{ id: string; name: string }>;
}

type Option = { key: string; label: string; href: string; active: boolean };

function FilterGroup({ label, options }: { label: string; options: Option[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.key}
          asChild
          variant={option.active ? 'default' : 'outline'}
          className="max-w-full"
        >
          <Link href={option.href} aria-current={option.active ? 'true' : undefined}>
            <span className="truncate">{option.label}</span>
          </Link>
        </Button>
      ))}
    </nav>
  );
}

/** Lọc giao dịch theo `type` / `eventId` trên URL; đổi lọc → về trang 1 (link không mang `page`) */
export function LedgerTransactionFilters({ filter, events }: LedgerTransactionFiltersProps) {
  const href = (next: LedgerFilter) => pageHref(ROUTES.LEDGER, 1, next);
  const typeOptions: Option[] = [
    {
      key: 'all',
      label: LEDGER_MESSAGES.ALL_TYPES,
      href: href({ eventId: filter.eventId }),
      active: !filter.type,
    },
    ...Object.values(LEDGER_TXN_TYPE).map((type) => ({
      key: type,
      label: txnTypeLabel(type),
      href: href({ type, eventId: filter.eventId }),
      active: filter.type === type,
    })),
  ];
  const eventOptions: Option[] = [
    {
      key: 'all',
      label: LEDGER_MESSAGES.ALL_EVENTS,
      href: href({ type: filter.type }),
      active: !filter.eventId,
    },
    ...events.map((event) => ({
      key: event.id,
      label: event.name,
      href: href({ type: filter.type, eventId: event.id }),
      active: filter.eventId === event.id,
    })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <FilterGroup label={LEDGER_MESSAGES.FILTER_TYPE} options={typeOptions} />
      {events.length > 0 && (
        <FilterGroup label={LEDGER_MESSAGES.FILTER_EVENT} options={eventOptions} />
      )}
    </div>
  );
}
