import { redirect, RedirectType } from 'next/navigation';

import { ListPagination } from '@/components/common/list-pagination';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { isPageOutOfRange } from '@/lib/pagination';

import { accountName, accountOwner } from '../labels';
import type { LedgerAccountData } from '../loaders';
import { LedgerAccountEntriesTable } from './ledger-account-entries-table';
import { LedgerStats } from './ledger-stats';

interface LedgerAccountDetailsProps {
  result: LedgerAccountData;
  page: number;
}

/** Chi tiết tài khoản sổ cái (spec web § E bước 4): tên, tổng nợ / có, số dư, dòng bút toán `limit` 50 */
export function LedgerAccountDetails({ result, page }: LedgerAccountDetailsProps) {
  const { data, meta, eventNames } = result;
  const { account } = data;
  const pathname = ROUTES.LEDGER_ACCOUNT(account.id);
  if (isPageOutOfRange(page, meta)) redirect(pathname, RedirectType.replace);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold break-words">{accountName(account)}</h1>
        <p className="text-sm text-muted-foreground">
          {LEDGER_MESSAGES.OWNER}: {accountOwner(account)}
          {account.event && ` · ${LEDGER_MESSAGES.EVENT}: ${account.event.name}`}
        </p>
      </div>
      <LedgerStats
        items={[
          { label: LEDGER_MESSAGES.TOTAL_DEBIT, amount: account.totalDebit },
          { label: LEDGER_MESSAGES.TOTAL_CREDIT, amount: account.totalCredit },
          { label: LEDGER_MESSAGES.BALANCE, amount: account.balance },
        ]}
      />
      <section aria-labelledby="ledger-entries-title" className="flex flex-col gap-3">
        <h2 id="ledger-entries-title" className="font-semibold">
          {LEDGER_MESSAGES.ENTRIES_TITLE}
        </h2>
        <LedgerAccountEntriesTable entries={data.entries} eventNames={eventNames} />
        <ListPagination pathname={pathname} meta={meta} />
      </section>
    </div>
  );
}
