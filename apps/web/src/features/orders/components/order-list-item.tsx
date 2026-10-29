import Link from 'next/link';

import { ORDER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatTime, formatVnd } from '@/lib/format';

import { ORDER_STATUS, type OrderSummary } from '../types';
import { OrderStatusBadge } from './order-status-badge';

interface OrderListItemProps {
  order: OrderSummary;
}

/** 1 đơn trong trang Đơn hàng (spec web § D): cả dòng là link tới trang kết quả của đơn */
export function OrderListItem({ order }: OrderListItemProps) {
  const pending = order.status === ORDER_STATUS.PENDING_PAYMENT;
  return (
    <li>
      <Link
        href={ROUTES.ORDER(order.id)}
        className="flex flex-col gap-2 rounded-xl border p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm break-all">{order.id}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="font-medium break-words">{order.event.name}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{ORDER_MESSAGES.SELLER}</dt>
          <dd className="text-right break-words">{order.seller.displayName}</dd>
          <dt className="text-muted-foreground">{ORDER_MESSAGES.QUANTITY}</dt>
          <dd className="text-right">{ORDER_MESSAGES.TICKET_COUNT(order.quantity)}</dd>
          <dt className="text-muted-foreground">{ORDER_MESSAGES.TOTAL}</dt>
          <dd className="text-right font-semibold whitespace-nowrap tabular-nums">
            {formatVnd(order.buyerTotal)}
          </dd>
          <dt className="text-muted-foreground">{ORDER_MESSAGES.CREATED_AT}</dt>
          <dd className="text-right tabular-nums">{formatDateTime(order.createdAt)}</dd>
        </dl>
        {pending && (
          <p className="text-sm text-muted-foreground">
            {ORDER_MESSAGES.HOLD_UNTIL(formatTime(order.holdExpiresAt))}
          </p>
        )}
      </Link>
    </li>
  );
}
