// Nhãn hiển thị của enum sổ cái (spec web § E Xem Sổ Cái: "Ký quỹ", "Doanh thu phí sàn", "Phải trả người bán · {tên}"…)
import { LEDGER_MESSAGES } from '@/constants/messages';

import {
  LEDGER_SIDE,
  type LedgerAccount,
  type LedgerAccountType,
  type LedgerSide,
  type LedgerTxnType,
} from './types';

const ACCOUNT_TYPE_LABELS: Record<LedgerAccountType, string> = {
  GATEWAY_CASH: LEDGER_MESSAGES.ACCOUNT_TYPE_GATEWAY_CASH,
  ESCROW_SELLER: LEDGER_MESSAGES.ACCOUNT_TYPE_ESCROW_SELLER,
  ESCROW_FEE: LEDGER_MESSAGES.ACCOUNT_TYPE_ESCROW_FEE,
  SELLER_PAYABLE: LEDGER_MESSAGES.ACCOUNT_TYPE_SELLER_PAYABLE,
  BUYER_REFUND_PAYABLE: LEDGER_MESSAGES.ACCOUNT_TYPE_BUYER_REFUND_PAYABLE,
  PLATFORM_FEE_REVENUE: LEDGER_MESSAGES.ACCOUNT_TYPE_PLATFORM_FEE_REVENUE,
};

const TXN_TYPE_LABELS: Record<LedgerTxnType, string> = {
  PAYMENT_CAPTURED: LEDGER_MESSAGES.TXN_TYPE_PAYMENT_CAPTURED,
  PAYMENT_REFUND_REQUIRED: LEDGER_MESSAGES.TXN_TYPE_PAYMENT_REFUND_REQUIRED,
  EVENT_RELEASE: LEDGER_MESSAGES.TXN_TYPE_EVENT_RELEASE,
};

const NAME_SEPARATOR = ' · ';

export const accountTypeLabel = (type: LedgerAccountType) => ACCOUNT_TYPE_LABELS[type];

export const txnTypeLabel = (type: LedgerTxnType) => TXN_TYPE_LABELS[type];

export const sideLabel = (side: LedgerSide) =>
  side === LEDGER_SIDE.DEBIT ? LEDGER_MESSAGES.DEBIT : LEDGER_MESSAGES.CREDIT;

/** Tên tài khoản = loại + chủ sở hữu (nếu có); sự kiện hiển thị ở cột riêng */
export function accountName(account: Pick<LedgerAccount, 'type' | 'user'>): string {
  const label = accountTypeLabel(account.type);
  return account.user ? `${label}${NAME_SEPARATOR}${account.user.displayName}` : label;
}

/** Chủ sở hữu: tên người dùng, hoặc "Sàn" khi tài khoản không thuộc người dùng nào */
export const accountOwner = (account: Pick<LedgerAccount, 'user'>) =>
  account.user?.displayName ?? LEDGER_MESSAGES.PLATFORM_OWNER;
