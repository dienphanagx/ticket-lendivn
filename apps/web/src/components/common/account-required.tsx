'use client';

import { useEffect } from 'react';

import { Icon } from '@/components/custom/icon';
import { useAccountMenu } from '@/components/providers/account-menu-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ACCOUNT_MESSAGES } from '@/constants/messages';

interface AccountRequiredProps {
  /** Mặc định câu "Vui lòng chọn tài khoản để tiếp tục" */
  message?: string;
}

/** Trang cần tài khoản khi chưa chọn (spec web § Quy Tắc Chung): báo + mở dropdown, không chuyển trang */
export function AccountRequired({ message = ACCOUNT_MESSAGES.REQUIRED }: AccountRequiredProps) {
  const { setOpen } = useAccountMenu();
  useEffect(() => setOpen(true), [setOpen]);
  return (
    <Alert role="status">
      <Icon name="triangle-alert" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
