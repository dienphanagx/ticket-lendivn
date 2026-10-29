'use client';

import { AccountRequired } from '@/components/common/account-required';
import { ORDER_MESSAGES } from '@/constants/messages';

import { useOrderPolling } from '../hooks/use-order-polling';
import type { OrderDetail } from '../types';
import { OrderDetails } from './order-details';
import { OrderNotFound } from './order-not-found';
import { OrderStatusPanel } from './order-status-panel';

interface OrderResultProps {
  initialOrder: OrderDetail;
  currentUserId: string;
  eventHref: string;
}

/**
 * Trang kết quả (spec web § C Xem Kết Quả Thanh Toán): trạng thái chỉ lấy từ api, tự hỏi lại khi
 * đơn còn chờ; không có "tiếp tục thanh toán" (spec § C Xác Nhận Thanh Toán → Quy tắc nghiệp vụ).
 */
export function OrderResult({ initialOrder, currentUserId, eventHref }: OrderResultProps) {
  const { order, stop, timedOut, checking, checkAgain } = useOrderPolling(
    initialOrder,
    currentUserId,
  );
  if (stop === 'notFound') return <OrderNotFound />;
  if (stop === 'accountRequired') return <AccountRequired />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{ORDER_MESSAGES.RESULT_TITLE}</h1>
      {/* Trạng thái đổi khi đang xem → trình đọc màn hình đọc khối mới */}
      <div role="status" aria-live="polite" aria-atomic="true">
        <OrderStatusPanel
          order={order}
          eventHref={eventHref}
          timedOut={timedOut}
          checking={checking}
          onCheckAgain={checkAgain}
        />
      </div>
      <OrderDetails order={order} />
    </div>
  );
}
