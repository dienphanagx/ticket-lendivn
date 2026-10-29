import Link from 'next/link';

import { Icon, type IconName } from '@/components/custom/icon';
import { Button } from '@/components/ui/button';
import { ORDER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatTime, formatVnd } from '@/lib/format';

import { ORDER_STATUS, type OrderDetail } from '../types';

interface OrderStatusPanelProps {
  order: OrderDetail;
  /** Trang sự kiện của đơn (nút "Quay lại sự kiện") */
  eventHref: string;
  /** Đã hết 120 giây mà đơn vẫn chờ */
  timedOut: boolean;
  checking: boolean;
  onCheckAgain: () => void;
}

type StatusView = {
  icon: IconName;
  title: string;
  detail: string | null;
  action: { href: string; label: string } | null;
};

function describe(order: OrderDetail, eventHref: string): StatusView {
  switch (order.status) {
    case ORDER_STATUS.PAID:
      return {
        icon: 'circle-check',
        title: ORDER_MESSAGES.PAID_TITLE,
        detail: order.paidAt ? `${ORDER_MESSAGES.PAID_AT}: ${formatDateTime(order.paidAt)}` : null,
        action: { href: ROUTES.ORDERS, label: ORDER_MESSAGES.VIEW_ORDERS },
      };
    case ORDER_STATUS.PENDING_PAYMENT:
      return {
        icon: 'loader-circle',
        title: ORDER_MESSAGES.PENDING_TITLE,
        detail: ORDER_MESSAGES.HOLD_UNTIL(formatTime(order.holdExpiresAt)),
        action: null,
      };
    case ORDER_STATUS.FAILED:
    case ORDER_STATUS.EXPIRED:
      return {
        icon: order.status === ORDER_STATUS.FAILED ? 'circle-x' : 'clock',
        title:
          order.status === ORDER_STATUS.FAILED
            ? ORDER_MESSAGES.FAILED_TITLE
            : ORDER_MESSAGES.EXPIRED_TITLE,
        detail: null,
        action: { href: eventHref, label: ORDER_MESSAGES.BACK_TO_EVENT },
      };
    case ORDER_STATUS.REFUND_REQUIRED:
      return {
        icon: 'triangle-alert',
        title: ORDER_MESSAGES.REFUND_TITLE(formatVnd(order.buyerTotal)),
        detail: null,
        action: { href: ROUTES.ACCOUNT, label: ORDER_MESSAGES.VIEW_ACCOUNT },
      };
  }
}

/** Khối trạng thái theo trạng thái api ghi nhận (spec web § C Xem Kết Quả Thanh Toán, bước 2) */
export function OrderStatusPanel(props: OrderStatusPanelProps) {
  const { order, eventHref, timedOut, checking, onCheckAgain } = props;
  const { icon, title, detail, action } = describe(order, eventHref);
  const pending = order.status === ORDER_STATUS.PENDING_PAYMENT;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <p className="flex items-start gap-2 font-semibold">
        <Icon name={icon} className={pending ? 'mt-0.5 animate-spin' : 'mt-0.5'} />
        <span>{title}</span>
      </p>
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      {pending && timedOut && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm">{ORDER_MESSAGES.POLL_TIMEOUT}</p>
          <Button
            type="button"
            variant="outline"
            disabled={checking}
            aria-busy={checking}
            onClick={onCheckAgain}
          >
            {ORDER_MESSAGES.CHECK_AGAIN}
          </Button>
        </div>
      )}
      {action && (
        <Button asChild variant="outline" className="self-start">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
