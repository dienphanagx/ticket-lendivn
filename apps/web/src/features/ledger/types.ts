// Shape theo response schema của api: apps/api/src/features/ledger/routes.ts (`ledgerResponse`,
// `accountResponse`), enum theo apps/api/src/db/enums.ts. Chỉ parse ở server nên dùng zod classic
import * as z from 'zod';

import '@/lib/zod-config';

import { isEntityId } from '@/lib/ids';
import { pageMetaSchema } from '@/lib/pagination';

export const LEDGER_ACCOUNT_TYPE = {
  GATEWAY_CASH: 'GATEWAY_CASH',
  ESCROW_SELLER: 'ESCROW_SELLER',
  ESCROW_FEE: 'ESCROW_FEE',
  SELLER_PAYABLE: 'SELLER_PAYABLE',
  BUYER_REFUND_PAYABLE: 'BUYER_REFUND_PAYABLE',
  PLATFORM_FEE_REVENUE: 'PLATFORM_FEE_REVENUE',
} as const;

export const LEDGER_TXN_TYPE = {
  PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
  PAYMENT_REFUND_REQUIRED: 'PAYMENT_REFUND_REQUIRED',
  EVENT_RELEASE: 'EVENT_RELEASE',
} as const;

export const LEDGER_SIDE = { DEBIT: 'DEBIT', CREDIT: 'CREDIT' } as const;

export const ledgerAccountTypeSchema = z.enum(Object.values(LEDGER_ACCOUNT_TYPE));
export const ledgerTxnTypeSchema = z.enum(Object.values(LEDGER_TXN_TYPE));
const ledgerSideSchema = z.enum(Object.values(LEDGER_SIDE));

const namedRefSchema = z.object({ id: z.string(), name: z.string() });

export const ledgerAccountSchema = z.object({
  id: z.string(),
  type: ledgerAccountTypeSchema,
  /** Cả `user` và `event` `null` = tài khoản của sàn */
  user: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  event: namedRefSchema.nullable(),
  totalDebit: z.int(),
  totalCredit: z.int(),
  balance: z.int(),
});

const ledgerTransactionSchema = z.object({
  id: z.string(),
  type: ledgerTxnTypeSchema,
  description: z.string(),
  orderId: z.string().nullable(),
  event: namedRefSchema,
  createdAt: z.iso.datetime(),
  entries: z.array(
    z.object({
      id: z.string(),
      accountId: z.string(),
      accountType: ledgerAccountTypeSchema,
      direction: ledgerSideSchema,
      amount: z.int(),
    }),
  ),
});

/** `GET /v1/ledger` */
export const ledgerOverviewResponseSchema = z.object({
  data: z.object({
    accounts: z.array(ledgerAccountSchema),
    totals: z.object({ debit: z.int(), credit: z.int() }),
    transactions: z.array(ledgerTransactionSchema),
  }),
  meta: pageMetaSchema,
});

const accountEntrySchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  transactionId: z.string(),
  transactionType: ledgerTxnTypeSchema,
  description: z.string(),
  orderId: z.string().nullable(),
  eventId: z.string(),
  direction: ledgerSideSchema,
  amount: z.int(),
});

/** `GET /v1/ledger/accounts/:accountId` */
export const ledgerAccountResponseSchema = z.object({
  data: z.object({ account: ledgerAccountSchema, entries: z.array(accountEntrySchema) }),
  meta: pageMetaSchema,
});

export type LedgerAccountType = z.infer<typeof ledgerAccountTypeSchema>;
export type LedgerTxnType = z.infer<typeof ledgerTxnTypeSchema>;
export type LedgerSide = z.infer<typeof ledgerSideSchema>;
export type LedgerAccount = z.infer<typeof ledgerAccountSchema>;
export type LedgerTransaction = z.infer<typeof ledgerTransactionSchema>;
export type LedgerAccountEntry = z.infer<typeof accountEntrySchema>;
export type LedgerOverview = z.infer<typeof ledgerOverviewResponseSchema>;

// spec web § E: danh sách giao dịch không ghi `limit` → mặc định 20 của api; chi tiết tài khoản `limit` 50
export const LEDGER_TRANSACTION_LIMIT = 20;
export const LEDGER_ACCOUNT_ENTRY_LIMIT = 50;

/** Mã tài khoản sổ cái trên URL (spec web § E Kiểm tra dữ liệu): 1–64 ký tự `[A-Za-z0-9_-]` */
export const isLedgerAccountId = isEntityId;

export type LedgerFilter = { type?: LedgerTxnType; eventId?: string };

/** `?type=&eventId=` trên URL: giá trị lạ / sai dạng / lặp key → bỏ lọc (không gửi sang api) */
export function parseLedgerFilter(search: Record<string, string | string[] | undefined>) {
  const type = ledgerTxnTypeSchema.safeParse(search.type);
  return {
    type: type.success ? type.data : undefined,
    eventId: isEntityId(search.eventId) ? search.eventId : undefined,
  } satisfies LedgerFilter;
}
