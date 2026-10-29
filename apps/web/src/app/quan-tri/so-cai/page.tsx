import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountRequired } from '@/components/common/account-required';
import { Icon } from '@/components/custom/icon';
import { Button } from '@/components/ui/button';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { LedgerOverviewSection } from '@/features/ledger/components/ledger-overview-section';
import { LedgerSkeleton } from '@/features/ledger/components/ledger-skeleton';
import { parseLedgerFilter } from '@/features/ledger/types';
import { getCurrentUserId } from '@/lib/current-user';
import { parsePageParam } from '@/lib/pagination';

export const metadata: Metadata = { title: LEDGER_MESSAGES.TITLE };

// Sổ cái toàn sàn (spec web § E Xem Sổ Cái); `?page=&type=&eventId=`, chuyển trang = dựng lại từ server
export default async function LedgerPage({ searchParams }: PageProps<'/quan-tri/so-cai'>) {
  const search = await searchParams;
  const page = parsePageParam(search.page);
  const filter = parseLedgerFilter(search);
  const currentUserId = await getCurrentUserId();
  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" className="self-start">
        <Link href={ROUTES.ADMIN}>
          <Icon name="chevron-left" data-icon="inline-start" />
          {LEDGER_MESSAGES.BACK_TO_ADMIN}
        </Link>
      </Button>
      <h1 className="text-xl font-semibold">{LEDGER_MESSAGES.TITLE}</h1>
      {currentUserId ? (
        <Suspense
          key={`${page}:${filter.type ?? ''}:${filter.eventId ?? ''}`}
          fallback={<LedgerSkeleton />}
        >
          <LedgerOverviewSection page={page} filter={filter} />
        </Suspense>
      ) : (
        <AccountRequired />
      )}
    </div>
  );
}
