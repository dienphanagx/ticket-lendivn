'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Icon } from '@/components/custom/icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LEDGER_MESSAGES } from '@/constants/messages';

import type { LedgerTransactionView } from '../view';

interface LedgerTransactionItemProps {
  transaction: LedgerTransactionView;
}

const NUMERIC = 'text-right whitespace-nowrap tabular-nums';
const LINK =
  'inline-flex min-h-11 items-center rounded-sm underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** 1 giao dịch; mở rộng ra các dòng nợ / có (bảng cuộn ngang trong khung riêng trên màn hẹp) */
export function LedgerTransactionItem({ transaction }: LedgerTransactionItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <li className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <time dateTime={transaction.createdAt} className="tabular-nums">
            {transaction.createdAtText}
          </time>
          <Badge variant="outline">{transaction.typeLabel}</Badge>
        </div>
        <p className="break-words">{transaction.description}</p>
        <p className="text-sm break-all text-muted-foreground">
          {LEDGER_MESSAGES.TRANSACTION_ID}: <span className="font-mono">{transaction.id}</span>
          {transaction.references.map((ref) => ` · ${ref}`).join('')}
        </p>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="self-start">
            {open ? LEDGER_MESSAGES.HIDE_ENTRIES : LEDGER_MESSAGES.SHOW_ENTRIES}
            <Icon name="chevron-down" className={open ? 'rotate-180' : undefined} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="rounded-lg border">
          <Table className="min-w-md">
            <TableHeader>
              <TableRow>
                <TableHead>{LEDGER_MESSAGES.ACCOUNT}</TableHead>
                <TableHead className="text-right">{LEDGER_MESSAGES.DEBIT}</TableHead>
                <TableHead className="text-right">{LEDGER_MESSAGES.CREDIT}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transaction.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-normal">
                    <Link href={entry.accountHref} className={LINK}>
                      {entry.accountName}
                    </Link>
                  </TableCell>
                  <TableCell className={NUMERIC}>{entry.debit}</TableCell>
                  <TableCell className={NUMERIC}>{entry.credit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
