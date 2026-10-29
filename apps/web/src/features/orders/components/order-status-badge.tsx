import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';
import { ORDER_MESSAGES } from '@/constants/messages';

import { ORDER_STATUS, type OrderStatus } from '../types';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

const STATUS_BADGES: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  [ORDER_STATUS.PAID]: { label: ORDER_MESSAGES.STATUS_PAID, variant: 'default' },
  [ORDER_STATUS.PENDING_PAYMENT]: { label: ORDER_MESSAGES.STATUS_PENDING, variant: 'secondary' },
  [ORDER_STATUS.FAILED]: { label: ORDER_MESSAGES.STATUS_FAILED, variant: 'destructive' },
  [ORDER_STATUS.EXPIRED]: { label: ORDER_MESSAGES.STATUS_EXPIRED, variant: 'outline' },
  [ORDER_STATUS.REFUND_REQUIRED]: {
    label: ORDER_MESSAGES.STATUS_REFUND_REQUIRED,
    variant: 'destructive',
  },
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

/** Nhãn trạng thái đơn (spec web § D Xem Danh Sách Đơn Hàng) */
export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const { label, variant } = STATUS_BADGES[status];
  return <Badge variant={variant}>{label}</Badge>;
}
