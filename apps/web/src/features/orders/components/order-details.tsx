import { ORDER_MESSAGES } from '@/constants/messages';
import { formatDateTime, formatVnd } from '@/lib/format';

import type { OrderDetail } from '../types';

interface OrderDetailsProps {
  order: OrderDetail;
}

/** Chi tiết đơn ở trang kết quả — số tiền là số api đã chốt cho đơn, không dùng số tạm tính */
export function OrderDetails({ order }: OrderDetailsProps) {
  const rows = [
    { label: ORDER_MESSAGES.ORDER_ID, value: order.id },
    { label: ORDER_MESSAGES.EVENT, value: order.event.name },
    { label: ORDER_MESSAGES.SELLER, value: order.seller.displayName },
    { label: ORDER_MESSAGES.QUANTITY, value: ORDER_MESSAGES.TICKET_COUNT(order.quantity) },
    { label: ORDER_MESSAGES.UNIT_PRICE, value: formatVnd(order.unitPrice) },
    { label: ORDER_MESSAGES.SUBTOTAL, value: formatVnd(order.subtotal) },
    { label: ORDER_MESSAGES.BUYER_FEE, value: formatVnd(order.buyerFee) },
    { label: ORDER_MESSAGES.TOTAL, value: formatVnd(order.buyerTotal), total: true },
    { label: ORDER_MESSAGES.CREATED_AT, value: formatDateTime(order.createdAt) },
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border p-4 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd
            className={
              row.total
                ? 'text-right font-semibold break-words tabular-nums'
                : 'text-right break-words tabular-nums'
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
