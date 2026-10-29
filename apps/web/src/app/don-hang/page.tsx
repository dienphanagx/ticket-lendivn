import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AccountRequired } from '@/components/common/account-required';
import { ORDER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { OrderListSection } from '@/features/orders/components/order-list-section';
import { OrderListSkeleton } from '@/features/orders/components/order-list-skeleton';
import { ResetPageOnAccountChange } from '@/features/orders/components/reset-page-on-account-change';
import { getCurrentUserId } from '@/lib/current-user';
import { parsePageParam } from '@/lib/pagination';

export const metadata: Metadata = { title: ORDER_MESSAGES.LIST_TITLE };

// Không đặt loading.tsx ở segment này: nó bọc cả /don-hang/[orderId] (cần 404 thật) → Suspense trong page
export default async function OrdersPage({ searchParams }: PageProps<'/don-hang'>) {
  const page = parsePageParam((await searchParams).page);
  const currentUserId = await getCurrentUserId();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{ORDER_MESSAGES.LIST_TITLE}</h1>
      {currentUserId ? (
        <>
          <Suspense key={`${currentUserId}:${page}`} fallback={<OrderListSkeleton />}>
            <OrderListSection userId={currentUserId} page={page} />
          </Suspense>
          <ResetPageOnAccountChange userId={currentUserId} page={page} pathname={ROUTES.ORDERS} />
        </>
      ) : (
        <AccountRequired />
      )}
    </div>
  );
}
