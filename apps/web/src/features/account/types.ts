// Shape theo `balanceResponse` của apps/api/src/features/ledger/routes.ts (`GET /v1/me/balance`);
// chỉ parse ở server nên dùng zod classic
import * as z from 'zod';

import '@/lib/zod-config';

import { ledgerAccountTypeSchema, ledgerTxnTypeSchema } from '@/features/ledger/types';
import { pageMetaSchema } from '@/lib/pagination';

/** `ESCROW_SELLER` → đang chờ; `SELLER_PAYABLE`, `BUYER_REFUND_PAYABLE` → khả dụng (read-service.ts của api) */
export const BALANCE_TYPE = { PENDING: 'PENDING', AVAILABLE: 'AVAILABLE' } as const;

const balanceEntrySchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  transactionId: z.string(),
  transactionType: ledgerTxnTypeSchema,
  description: z.string(),
  orderId: z.string().nullable(),
  eventId: z.string(),
  accountId: z.string(),
  accountType: ledgerAccountTypeSchema,
  /** + tăng số dư, − giảm số dư (api đã đổi dấu theo chiều tăng) */
  amount: z.int(),
  balanceType: z.enum(Object.values(BALANCE_TYPE)),
});

export const balanceResponseSchema = z.object({
  data: z.object({
    pendingBalance: z.int(),
    availableBalance: z.int(),
    availableBreakdown: z.object({ sales: z.int(), refunds: z.int() }),
    entries: z.array(balanceEntrySchema),
  }),
  meta: pageMetaSchema,
});

export type BalanceEntry = z.infer<typeof balanceEntrySchema>;
export type Balance = z.infer<typeof balanceResponseSchema>['data'];

export const BALANCE_HISTORY_LIMIT = 20; // spec web § D Xem Số Dư: phân trang `limit` 20
