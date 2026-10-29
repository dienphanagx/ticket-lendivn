import { redirect, RedirectType } from 'next/navigation';

import { ListPagination } from '@/components/common/list-pagination';
import { Icon } from '@/components/custom/icon';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { isPageOutOfRange, pageHref } from '@/lib/pagination';

import { loadLedgerOverview } from '../loaders';
import type { LedgerFilter } from '../types';
import { toTransactionView } from '../view';
import { LedgerAccountTable } from './ledger-account-table';
import { LedgerStats } from './ledger-stats';
import { LedgerTransactionFilters } from './ledger-transaction-filters';
import { LedgerTransactionItem } from './ledger-transaction-item';

interface LedgerOverviewSectionProps {
  page: number;
  filter: LedgerFilter;
}

/** Sổ cái toàn sàn (spec web § E Xem Sổ Cái): tài khoản + Σ toàn sổ, giao dịch lọc + phân trang */
export async function LedgerOverviewSection({ page, filter }: LedgerOverviewSectionProps) {
  const result = await loadLedgerOverview(page, filter);
  // `eventId` không còn sự kiện → bỏ lọc sự kiện, giữ lọc loại
  if (!result) redirect(pageHref(ROUTES.LEDGER, 1, { type: filter.type }), RedirectType.replace);
  const { data, meta, eventNames } = result;
  if (isPageOutOfRange(page, meta)) {
    redirect(pageHref(ROUTES.LEDGER, 1, filter), RedirectType.replace);
  }
  const accountsById = new Map(data.accounts.map((account) => [account.id, account]));
  const events = [...eventNames].map(([id, name]) => ({ id, name }));
  return (
    <div className="flex flex-col gap-6">
      <LedgerStats
        items={[
          { label: LEDGER_MESSAGES.LEDGER_TOTAL_DEBIT, amount: data.totals.debit },
          { label: LEDGER_MESSAGES.LEDGER_TOTAL_CREDIT, amount: data.totals.credit },
        ]}
      />
      <section aria-labelledby="ledger-accounts-title" className="flex flex-col gap-3">
        <h2 id="ledger-accounts-title" className="font-semibold">
          {LEDGER_MESSAGES.ACCOUNTS_TITLE}
        </h2>
        <LedgerAccountTable accounts={data.accounts} />
      </section>
      <section aria-labelledby="ledger-transactions-title" className="flex flex-col gap-3">
        <h2 id="ledger-transactions-title" className="font-semibold">
          {LEDGER_MESSAGES.TRANSACTIONS_TITLE}
        </h2>
        <LedgerTransactionFilters filter={filter} events={events} />
        {data.transactions.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Icon name="receipt" />
              </EmptyMedia>
              <EmptyTitle>{LEDGER_MESSAGES.EMPTY}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {data.transactions.map((txn) => (
              <LedgerTransactionItem
                key={txn.id}
                transaction={toTransactionView(txn, accountsById)}
              />
            ))}
          </ul>
        )}
        <ListPagination pathname={ROUTES.LEDGER} meta={meta} query={filter} />
      </section>
    </div>
  );
}
