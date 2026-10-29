import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountRequired } from '@/components/common/account-required';
import { Button } from '@/components/ui/button';
import { ADMIN_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { AdminEventSection } from '@/features/admin/components/admin-event-section';
import { AdminEventSkeleton } from '@/features/admin/components/admin-event-skeleton';
import { getCurrentUserId } from '@/lib/current-user';

export const metadata: Metadata = { title: ADMIN_MESSAGES.TITLE };

// Khu Quản Trị (spec web § E): không phân quyền, nhưng là hành động cần đã chọn tài khoản.
// Không đặt loading.tsx ở segment này: nó bọc cả /quan-tri/so-cai/[accountId] (cần 404 thật)
export default async function AdminPage() {
  const currentUserId = await getCurrentUserId();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{ADMIN_MESSAGES.TITLE}</h1>
        <Button asChild variant="outline">
          <Link href={ROUTES.LEDGER}>{ADMIN_MESSAGES.VIEW_LEDGER}</Link>
        </Button>
      </div>
      {currentUserId ? (
        <Suspense key={currentUserId} fallback={<AdminEventSkeleton />}>
          <AdminEventSection />
        </Suspense>
      ) : (
        <AccountRequired />
      )}
    </div>
  );
}
