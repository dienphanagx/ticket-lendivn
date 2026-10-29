import Link from 'next/link';
import { redirect, RedirectType } from 'next/navigation';

import { AccountRequired } from '@/components/common/account-required';
import { ListPagination } from '@/components/common/list-pagination';
import { Icon } from '@/components/custom/icon';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ACCOUNT_MESSAGES, ORDER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { isPageOutOfRange } from '@/lib/pagination';

import { loadOrderList } from '../loaders';
import { OrderListItem } from './order-list-item';

interface OrderListSectionProps {
  userId: string;
  page: number;
}

/** Đơn do tài khoản đang chọn mua, mới nhất trước (thứ tự do api); lỗi hệ thống → error.tsx */
export async function OrderListSection({ userId, page }: OrderListSectionProps) {
  const result = await loadOrderList(userId, page);
  if (!result) return <AccountRequired message={ACCOUNT_MESSAGES.STALE} />;
  const { data: orders, meta } = result;
  if (isPageOutOfRange(page, meta)) redirect(ROUTES.ORDERS, RedirectType.replace);
  if (orders.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon name="receipt" />
          </EmptyMedia>
          <EmptyTitle>{ORDER_MESSAGES.EMPTY}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline">
            <Link href={ROUTES.HOME}>{ORDER_MESSAGES.BROWSE_EVENTS}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {orders.map((order) => (
          <OrderListItem key={order.id} order={order} />
        ))}
      </ul>
      <ListPagination pathname={ROUTES.ORDERS} meta={meta} />
    </div>
  );
}
