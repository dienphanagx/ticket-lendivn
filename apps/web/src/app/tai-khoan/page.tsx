import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AccountRequired } from '@/components/common/account-required';
import { BALANCE_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { BalanceSection } from '@/features/account/components/balance-section';
import { BalanceSkeleton } from '@/features/account/components/balance-skeleton';
import { ResetPageOnAccountChange } from '@/features/orders/components/reset-page-on-account-change';
import { getCurrentUserId } from '@/lib/current-user';
import { parsePageParam } from '@/lib/pagination';

export const metadata: Metadata = { title: BALANCE_MESSAGES.TITLE };

// Số dư + lịch sử bút toán của tài khoản đang chọn (spec web § D); chuyển trang = dựng lại từ server
export default async function AccountPage({ searchParams }: PageProps<'/tai-khoan'>) {
  const page = parsePageParam((await searchParams).page);
  const currentUserId = await getCurrentUserId();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{BALANCE_MESSAGES.TITLE}</h1>
      {currentUserId ? (
        <>
          <Suspense key={`${currentUserId}:${page}`} fallback={<BalanceSkeleton />}>
            <BalanceSection userId={currentUserId} page={page} />
          </Suspense>
          <ResetPageOnAccountChange userId={currentUserId} page={page} pathname={ROUTES.ACCOUNT} />
        </>
      ) : (
        <AccountRequired />
      )}
    </div>
  );
}
