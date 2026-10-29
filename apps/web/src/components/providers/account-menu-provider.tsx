'use client';

// Cho phần khác của trang mở dropdown chọn tài khoản trên header
// (spec web § Quy Tắc Chung: hành động cần tài khoản khi chưa chọn → mở dropdown)
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type AccountMenuState = { open: boolean; setOpen: (open: boolean) => void };

const AccountMenuContext = createContext<AccountMenuState | null>(null);

export function AccountMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <AccountMenuContext.Provider value={value}>{children}</AccountMenuContext.Provider>;
}

export function useAccountMenu(): AccountMenuState {
  const ctx = useContext(AccountMenuContext);
  if (!ctx) throw new Error('useAccountMenu must be used inside AccountMenuProvider');
  return ctx;
}
