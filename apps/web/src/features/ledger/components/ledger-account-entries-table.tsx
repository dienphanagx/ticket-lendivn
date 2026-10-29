import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { formatDateTime, formatVnd } from '@/lib/format';

import { LEDGER_SIDE, type LedgerAccountEntry } from '../types';
import { referencesOf } from '../view';

interface LedgerAccountEntriesTableProps {
  entries: LedgerAccountEntry[];
  eventNames: ReadonlyMap<string, string>;
}

const NUMERIC = 'text-right whitespace-nowrap tabular-nums';

/** Dòng bút toán của 1 tài khoản, mới nhất trước (thứ tự api); cuộn ngang trong khung riêng trên màn hẹp */
export function LedgerAccountEntriesTable({ entries, eventNames }: LedgerAccountEntriesTableProps) {
  return (
    <div className="rounded-xl border">
      <Table className="min-w-3xl">
        <TableHeader>
          <TableRow>
            <TableHead>{LEDGER_MESSAGES.TIME}</TableHead>
            <TableHead>{LEDGER_MESSAGES.TRANSACTION_ID}</TableHead>
            <TableHead>{LEDGER_MESSAGES.DESCRIPTION}</TableHead>
            <TableHead>{LEDGER_MESSAGES.REFERENCE}</TableHead>
            <TableHead className="text-right">{LEDGER_MESSAGES.DEBIT}</TableHead>
            <TableHead className="text-right">{LEDGER_MESSAGES.CREDIT}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {LEDGER_MESSAGES.EMPTY}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => {
              const amount = formatVnd(entry.amount);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="tabular-nums">{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs break-all whitespace-normal">
                    {entry.transactionId}
                  </TableCell>
                  <TableCell className="whitespace-normal">{entry.description}</TableCell>
                  <TableCell className="whitespace-normal">
                    {referencesOf(entry.orderId, eventNames.get(entry.eventId)).join(' · ')}
                  </TableCell>
                  <TableCell className={NUMERIC}>
                    {entry.direction === LEDGER_SIDE.DEBIT ? amount : null}
                  </TableCell>
                  <TableCell className={NUMERIC}>
                    {entry.direction === LEDGER_SIDE.CREDIT ? amount : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
