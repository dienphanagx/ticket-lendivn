'use client';

// Cho phần khác của trang mở dropdown chọn tài khoản trên header
// (spec web § Quy Tắc Chung: hành động cần tài khoản khi chưa chọn → mở dropdown)
// và khoá dropdown khi đang thanh toán (đổi cookie giữa 2 lời gọi BFF → đơn của tài khoản cũ)
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type AccountMenuState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Đang tạo đơn / lấy URL cổng: không cho đổi tài khoản, đổi tin bán hay đóng khu chọn */
  checkoutPending: boolean;
  setCheckoutPending: (pending: boolean) => void;
};

const AccountMenuContext = createContext<AccountMenuState | null>(null);

export function AccountMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const value = useMemo(
    () => ({ open, setOpen, checkoutPending, setCheckoutPending }),
    [open, checkoutPending],
  );
  return <AccountMenuContext.Provider value={value}>{children}</AccountMenuContext.Provider>;
}

export function useAccountMenu(): AccountMenuState {
  const ctx = useContext(AccountMenuContext);
  if (!ctx) throw new Error('useAccountMenu must be used inside AccountMenuProvider');
  return ctx;
}
