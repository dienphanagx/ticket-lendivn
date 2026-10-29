import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LEDGER_MESSAGES, TICKET_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { formatVnd } from '@/lib/format';

import { accountName, accountOwner } from '../labels';
import type { LedgerAccount } from '../types';

interface LedgerAccountTableProps {
  accounts: LedgerAccount[];
}

const NUMERIC = 'text-right whitespace-nowrap tabular-nums';
const LINK =
  'inline-flex min-h-11 items-center rounded-sm font-medium underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Bảng tài khoản sổ cái theo thứ tự api trả (spec web § E bước 2). Bảng rộng hơn màn hình hẹp cuộn
 * ngang trong khung riêng của `Table` (`overflow-x-auto`), trang không cuộn ngang
 */
export function LedgerAccountTable({ accounts }: LedgerAccountTableProps) {
  return (
    <div className="rounded-xl border">
      <Table className="min-w-xl">
        <TableHeader>
          <TableRow>
            <TableHead>{LEDGER_MESSAGES.ACCOUNT}</TableHead>
            <TableHead>{LEDGER_MESSAGES.OWNER}</TableHead>
            <TableHead>{LEDGER_MESSAGES.EVENT}</TableHead>
            <TableHead className="text-right">{LEDGER_MESSAGES.TOTAL_DEBIT}</TableHead>
            <TableHead className="text-right">{LEDGER_MESSAGES.TOTAL_CREDIT}</TableHead>
            <TableHead className="text-right">{LEDGER_MESSAGES.BALANCE}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {LEDGER_MESSAGES.EMPTY}
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="whitespace-normal">
                  <Link href={ROUTES.LEDGER_ACCOUNT(account.id)} className={LINK}>
                    {accountName(account)}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">{accountOwner(account)}</TableCell>
                <TableCell className="whitespace-normal">
                  {account.event?.name ?? TICKET_MESSAGES.EMPTY_VALUE}
                </TableCell>
                <TableCell className={NUMERIC}>{formatVnd(account.totalDebit)}</TableCell>
                <TableCell className={NUMERIC}>{formatVnd(account.totalCredit)}</TableCell>
                <TableCell className={`${NUMERIC} font-semibold`}>
                  {formatVnd(account.balance)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
