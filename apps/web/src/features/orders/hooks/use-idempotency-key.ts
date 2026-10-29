'use client';

import { useCallback, useState } from 'react';

import { uuidV4 } from '@/lib/uuid';

type KeyState = { listingId: string; quantity: number | null; key: string };

/**
 * Khoá chống trùng cho 1 nội dung đơn (spec web § C Xác Nhận Thanh Toán → Kiểm tra dữ liệu):
 * 1 khoá cho mỗi tin bán + số lượng; đổi tin hoặc số lượng → khoá mới (kể cả quay lại số cũ).
 * Bấm lại sau timeout / mất mạng dùng lại khoá đang có, nên api không tạo đơn thứ hai.
 */
export function useIdempotencyKey(listingId: string, quantity: number | null) {
  const [state, setState] = useState<KeyState>(() => ({ listingId, quantity, key: uuidV4() }));
  let current = state;
  // Nội dung đổi → sinh khoá ngay trong render (không qua effect, không lọt 1 lần bấm với khoá cũ)
  if (state.listingId !== listingId || state.quantity !== quantity) {
    current = { listingId, quantity, key: uuidV4() };
    setState(current);
  }
  /** Bỏ khoá hiện tại (đơn của khoá này không thanh toán được nữa) → lần bấm sau tạo đơn mới */
  const rotate = useCallback((): string => {
    const key = uuidV4();
    setState((s) => ({ ...s, key }));
    return key;
  }, []);
  return { key: current.key, rotate };
}
