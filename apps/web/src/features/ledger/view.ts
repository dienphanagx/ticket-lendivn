// Chuyển DTO sổ cái → chuỗi hiển thị (chạy ở server, truyền xuống Client Component)
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { formatDateTime, formatVnd } from '@/lib/format';

import { accountName, accountTypeLabel, txnTypeLabel } from './labels';
import { LEDGER_SIDE, type LedgerAccount, type LedgerTransaction } from './types';

/** Giao dịch đã định dạng sẵn ở server (Client Component chỉ nhận chuỗi) */
export type LedgerTransactionView = {
  id: string;
  typeLabel: string;
  description: string;
  createdAt: string;
  createdAtText: string;
  references: string[];
  entries: Array<{
    id: string;
    accountHref: string;
    accountName: string;
    debit: string | null;
    credit: string | null;
  }>;
};

/** Tham chiếu của giao dịch / dòng bút toán: "Đơn {mã}", "Sự kiện {tên}" (tên không tra được → bỏ) */
export function referencesOf(orderId: string | null, eventName: string | undefined): string[] {
  const refs: string[] = [];
  if (orderId) refs.push(LEDGER_MESSAGES.ORDER_REF(orderId));
  if (eventName) refs.push(LEDGER_MESSAGES.EVENT_REF(eventName));
  return refs;
}

export function toTransactionView(
  txn: LedgerTransaction,
  accountsById: ReadonlyMap<string, LedgerAccount>,
): LedgerTransactionView {
  return {
    id: txn.id,
    typeLabel: txnTypeLabel(txn.type),
    description: txn.description,
    createdAt: txn.createdAt,
    createdAtText: formatDateTime(txn.createdAt),
    references: referencesOf(txn.orderId, txn.event.name),
    entries: txn.entries.map((entry) => {
      const account = accountsById.get(entry.accountId);
      const amount = formatVnd(entry.amount);
      return {
        id: entry.id,
        accountHref: ROUTES.LEDGER_ACCOUNT(entry.accountId),
        accountName: account ? accountName(account) : accountTypeLabel(entry.accountType),
        debit: entry.direction === LEDGER_SIDE.DEBIT ? amount : null,
        credit: entry.direction === LEDGER_SIDE.CREDIT ? amount : null,
      };
    }),
  };
}
