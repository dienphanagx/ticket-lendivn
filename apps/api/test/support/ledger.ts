import type { Database } from '../../src/db/client.js';
import { LedgerAccountType } from '../../src/db/enums.js';

// Số dư đọc từ view `ledger_account_balances` (công thức số dư duy nhất, specs/database.md).

async function sumBalances(
  db: Database,
  userId: string,
  types: readonly LedgerAccountType[],
): Promise<number> {
  const rows = await db
    .selectFrom('ledger_account_balances')
    .select('balance')
    .where('owner_user_id', '=', userId)
    .where('type', 'in', types)
    .execute();
  return rows.reduce((total, row) => total + row.balance, 0);
}

/** Số dư đang chờ = Σ `ESCROW_SELLER` của người dùng (mọi sự kiện). */
export const pendingBalance = (db: Database, userId: string): Promise<number> =>
  sumBalances(db, userId, [LedgerAccountType.ESCROW_SELLER]);

/** Số dư khả dụng = `SELLER_PAYABLE` + `BUYER_REFUND_PAYABLE` của người dùng. */
export const availableBalance = (db: Database, userId: string): Promise<number> =>
  sumBalances(db, userId, [
    LedgerAccountType.SELLER_PAYABLE,
    LedgerAccountType.BUYER_REFUND_PAYABLE,
  ]);

/** Số dư 1 loại tài khoản không có chủ là người dùng (`GATEWAY_CASH`, `ESCROW_FEE` theo sự kiện). */
export async function accountBalance(
  db: Database,
  type: LedgerAccountType,
  eventId: string | null = null,
): Promise<number> {
  const row = await db
    .selectFrom('ledger_account_balances')
    .select('balance')
    .where('type', '=', type)
    .where('event_id', eventId === null ? 'is' : '=', eventId)
    .executeTakeFirst();
  return row?.balance ?? 0;
}

export interface LedgerTotals {
  debit: number;
  credit: number;
}

/** Σ nợ và Σ có toàn sổ. */
export async function ledgerTotals(db: Database): Promise<LedgerTotals> {
  const rows = await db
    .selectFrom('ledger_account_balances')
    .select(['total_debit', 'total_credit'])
    .execute();
  return rows.reduce(
    (totals, row) => ({
      debit: totals.debit + row.total_debit,
      credit: totals.credit + row.total_credit,
    }),
    { debit: 0, credit: 0 },
  );
}

export const countLedgerTransactions = async (db: Database): Promise<number> =>
  (
    await db
      .selectFrom('ledger_transactions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
  ).count;

export const countPaymentTransactions = async (db: Database): Promise<number> =>
  (
    await db
      .selectFrom('payment_transactions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
  ).count;
