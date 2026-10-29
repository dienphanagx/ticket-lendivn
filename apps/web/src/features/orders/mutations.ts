import { useMutation } from '@tanstack/react-query';

import { bffFetch } from '@/lib/api/bff-fetch';

import { createOrderViaBff, createPaymentUrlViaBff } from './api';
import { CheckoutError } from './checkout';
import type { CreateOrderBody } from './types';

export type CheckoutInput = CreateOrderBody & { idempotencyKey: string };

/** Tạo đơn rồi lấy URL cổng; lỗi gắn bước hỏng để chọn câu báo */
export async function runCheckout({ idempotencyKey, ...body }: CheckoutInput): Promise<string> {
  const order = await createOrderViaBff(bffFetch, body, idempotencyKey).catch((err: unknown) => {
    throw new CheckoutError('order', err);
  });
  const payment = await createPaymentUrlViaBff(bffFetch, order.data.id).catch((err: unknown) => {
    throw new CheckoutError('paymentUrl', err);
  });
  return payment.data.paymentUrl;
}

/** Không tự gửi lại (mutation mặc định `retry: false`): mỗi lần bấm chỉ 1 yêu cầu */
export const useCheckoutMutation = () =>
  useMutation<string, CheckoutError, CheckoutInput>({ mutationFn: runCheckout });
