import { redirect, RedirectType } from 'next/navigation';

import { AccountRequired } from '@/components/common/account-required';
import { ListPagination } from '@/components/common/list-pagination';
import { ACCOUNT_MESSAGES, BALANCE_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { isPageOutOfRange } from '@/lib/pagination';

import { loadAccountBalance } from '../loaders';
import { BalanceEntryList } from './balance-entry-list';
import { BalanceSummary } from './balance-summary';

interface BalanceSectionProps {
  userId: string;
  page: number;
}

/** Số dư + lịch sử bút toán của tài khoản đang chọn; lỗi hệ thống → error.tsx */
export async function BalanceSection({ userId, page }: BalanceSectionProps) {
  const result = await loadAccountBalance(userId, page);
  if (!result) return <AccountRequired message={ACCOUNT_MESSAGES.STALE} />;
  const { data, meta, displayName } = result;
  if (isPageOutOfRange(page, meta)) redirect(ROUTES.ACCOUNT, RedirectType.replace);
  return (
    <div className="flex flex-col gap-6">
      {displayName && <p className="text-lg font-medium break-words">{displayName}</p>}
      <BalanceSummary balance={data} />
      <section aria-labelledby="balance-history-title" className="flex flex-col gap-3">
        <h2 id="balance-history-title" className="font-semibold">
          {BALANCE_MESSAGES.HISTORY_TITLE}
        </h2>
        <BalanceEntryList entries={data.entries} />
        <ListPagination pathname={ROUTES.ACCOUNT} meta={meta} />
      </section>
    </div>
  );
}
