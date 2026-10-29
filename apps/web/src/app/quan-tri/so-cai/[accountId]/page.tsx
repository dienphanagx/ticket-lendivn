import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AccountRequired } from '@/components/common/account-required';
import { Icon } from '@/components/custom/icon';
import { Button } from '@/components/ui/button';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { LedgerAccountDetails } from '@/features/ledger/components/ledger-account-details';
import { loadLedgerAccount } from '@/features/ledger/loaders';
import { isLedgerAccountId } from '@/features/ledger/types';
import { getCurrentUserId } from '@/lib/current-user';
import { parsePageParam } from '@/lib/pagination';

export const metadata: Metadata = { title: LEDGER_MESSAGES.TITLE };

// Chi tiết tài khoản sổ cái (spec web § E bước 4). Không có loading.tsx: nạp + notFound() trước khi
// stream để 404 giữ đúng status
export default async function LedgerAccountPage({
  params,
  searchParams,
}: PageProps<'/quan-tri/so-cai/[accountId]'>) {
  const { accountId } = await params;
  // Sai dạng → 404, không gọi api
  if (!isLedgerAccountId(accountId)) notFound();
  const page = parsePageParam((await searchParams).page);
  const back = (
    <Button asChild variant="ghost" className="self-start">
      <Link href={ROUTES.LEDGER}>
        <Icon name="chevron-left" data-icon="inline-start" />
        {LEDGER_MESSAGES.BACK_TO_LEDGER}
      </Link>
    </Button>
  );
  if (!(await getCurrentUserId())) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <AccountRequired />
      </div>
    );
  }
  const result = await loadLedgerAccount(accountId, page);
  if (!result) notFound();
  return (
    <div className="flex flex-col gap-4">
      {back}
      <LedgerAccountDetails result={result} page={page} />
    </div>
  );
}
