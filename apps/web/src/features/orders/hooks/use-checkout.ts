'use client';

import { useRef, useState } from 'react';

import { assignLocation } from '@/lib/browser-navigation';

import { resolveCheckoutError, type CheckoutOutcome } from '../checkout';
import { useCheckoutMutation } from '../mutations';
import { useIdempotencyKey } from './use-idempotency-key';

interface UseCheckoutOptions {
  listingId: string;
  quantity: number | null;
  /** Đóng khu chọn / dựng lại trang / mở dropdown tài khoản theo lỗi */
  onOutcome: (outcome: CheckoutOutcome) => void;
}

/**
 * "Thanh toán" (spec web § C Xác Nhận Thanh Toán): tạo đơn → lấy URL cổng → chuyển trình duyệt.
 * Mỗi lần bấm chỉ 1 yêu cầu; nút khoá tới khi có phản hồi, thành công thì khoá luôn (đang rời trang).
 */
export function useCheckout({ listingId, quantity, onOutcome }: UseCheckoutOptions) {
  const { key, rotate } = useIdempotencyKey(listingId, quantity);
  const mutation = useCheckoutMutation();
  // Chặn lần bấm thứ 2 trước khi React kịp render trạng thái khoá
  const inFlight = useRef(false);
  // Câu lỗi gắn với khoá: đổi tin / số lượng (khoá mới) → câu cũ tự ẩn
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const submit = () => {
    if (inFlight.current || quantity === null) return;
    inFlight.current = true;
    setFailure(null);
    mutation.mutate(
      { listingId, quantity, idempotencyKey: key },
      {
        onSuccess: (paymentUrl) => assignLocation(paymentUrl),
        onError: (err) => {
          inFlight.current = false;
          const outcome = resolveCheckoutError(err);
          setFailure({ key: outcome.rotateKey ? rotate() : key, message: outcome.message });
          onOutcome(outcome);
        },
      },
    );
  };

  return {
    submit,
    pending: mutation.isPending || mutation.isSuccess,
    error: failure && failure.key === key ? failure.message : null,
  };
}
