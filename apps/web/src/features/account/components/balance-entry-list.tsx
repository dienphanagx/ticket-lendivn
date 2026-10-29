import Link from 'next/link';

import { Icon } from '@/components/custom/icon';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { BALANCE_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { LEDGER_ACCOUNT_TYPE } from '@/features/ledger/types';
import { formatDateTime } from '@/lib/format';

import { BALANCE_TYPE, type BalanceEntry } from '../types';
import { SignedAmount } from './signed-amount';

interface BalanceEntryListProps {
  entries: BalanceEntry[];
}

const LINK_FOCUS =
  'rounded-sm underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Chỉ khoản hoàn tiền là đơn do chính tài khoản mua; dòng bán vé thuộc đơn người khác mua
 * (trang kết quả sẽ báo "Không tìm thấy đơn hàng") nên không gắn link
 */
const ownOrderId = (entry: BalanceEntry) =>
  entry.accountType === LEDGER_ACCOUNT_TYPE.BUYER_REFUND_PAYABLE ? entry.orderId : null;

/** Lịch sử bút toán (spec web § D): mới nhất trước theo thứ tự api; dạng danh sách dọc, không cuộn ngang */
export function BalanceEntryList({ entries }: BalanceEntryListProps) {
  if (entries.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon name="receipt" />
          </EmptyMedia>
          <EmptyTitle>{BALANCE_MESSAGES.EMPTY}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border">
      {entries.map((entry) => {
        const orderId = ownOrderId(entry);
        return (
          <li
            key={entry.id}
            className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="break-words">{entry.description}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <time dateTime={entry.createdAt} className="tabular-nums">
                  {formatDateTime(entry.createdAt)}
                </time>
                <Badge variant="outline">
                  {entry.balanceType === BALANCE_TYPE.PENDING
                    ? BALANCE_MESSAGES.BALANCE_TYPE_PENDING
                    : BALANCE_MESSAGES.BALANCE_TYPE_AVAILABLE}
                </Badge>
              </p>
              {orderId && (
                <Link
                  href={ROUTES.ORDER(orderId)}
                  className={`flex min-h-11 items-center self-start text-sm ${LINK_FOCUS}`}
                >
                  {BALANCE_MESSAGES.VIEW_ORDER(orderId)}
                </Link>
              )}
            </div>
            <SignedAmount amount={entry.amount} className="sm:text-right" />
          </li>
        );
      })}
    </ul>
  );
}
