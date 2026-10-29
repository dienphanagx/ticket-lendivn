import { sql } from 'kysely';

import type { Database } from '../../db/client.js';
import { LedgerAccountType, LedgerSide, type LedgerTxnType } from '../../db/enums.js';

// Truy vấn đọc sổ cái (spec api § E). Mọi số dư / tổng nợ / tổng có lấy từ view
// `ledger_account_balances` hoặc SUM trực tiếp trên `ledger_entries`; không cộng ở code, không có
// cột số dư (specs/database.md § `ledger_account_balances`).

export interface PageWindow {
  offset: number;
  limit: number;
}

/** Số dư của người dùng theo từng loại tài khoản họ sở hữu (mọi sự kiện). */
export async function sumUserBalances(db: Database, userId: string) {
  const balanceOf = (type: LedgerAccountType) =>
    sql<number>`COALESCE(SUM(b.balance) FILTER (WHERE b.type = ${type}), 0)::bigint`;
  return db
    .selectFrom('ledger_account_balances as b')
    .where('b.owner_user_id', '=', userId)
    .select([
      balanceOf(LedgerAccountType.ESCROW_SELLER).as('pending'),
      balanceOf(LedgerAccountType.SELLER_PAYABLE).as('sales'),
      balanceOf(LedgerAccountType.BUYER_REFUND_PAYABLE).as('refunds'),
    ])
    .executeTakeFirstOrThrow();
}

const userEntries = (db: Database, userId: string) =>
  db
    .selectFrom('ledger_entries as e')
    .innerJoin('ledger_accounts as a', 'a.id', 'e.account_id')
    .where('a.owner_user_id', '=', userId);

/** Dòng bút toán của mọi tài khoản thuộc người dùng, mới nhất trước, cùng thời điểm theo mã giao dịch. */
export async function listUserEntries(db: Database, userId: string, page: PageWindow) {
  return userEntries(db, userId)
    .innerJoin('ledger_transactions as t', 't.id', 'e.transaction_id')
    .select([
      'e.id',
      'e.created_at as createdAt',
      'e.direction',
      'e.amount',
      'a.id as accountId',
      'a.type as accountType',
      'a.normal_side as normalSide',
      't.id as transactionId',
      't.type as transactionType',
      't.description',
      't.order_id as orderId',
      't.event_id as eventId',
    ])
    .orderBy('e.created_at', 'desc')
    .orderBy('e.transaction_id', 'desc')
    .orderBy('e.id', 'desc')
    .limit(page.limit)
    .offset(page.offset)
    .execute();
}

export async function countUserEntries(db: Database, userId: string): Promise<number> {
  const row = await userEntries(db, userId)
    .select((eb) => eb.fn.countAll<number>().as('total'))
    .executeTakeFirstOrThrow();
  return row.total;
}

/** Tài khoản kèm tên chủ sở hữu (người dùng / sự kiện) và tổng từ view số dư. */
const accountsWithOwners = (db: Database) =>
  db
    .selectFrom('ledger_account_balances as b')
    .leftJoin('users as u', 'u.id', 'b.owner_user_id')
    .leftJoin('events as ev', 'ev.id', 'b.event_id')
    .select([
      'b.account_id as id',
      'b.type',
      'b.owner_user_id as ownerUserId',
      'u.display_name as ownerName',
      'b.event_id as eventId',
      'ev.name as eventName',
      'b.total_debit as totalDebit',
      'b.total_credit as totalCredit',
      'b.balance',
    ]);

export type LedgerAccountRow = NonNullable<Awaited<ReturnType<typeof findLedgerAccount>>>;

/** Thứ tự loại theo khai báo enum (§ E Ghi Bút Toán), cùng loại theo tên chủ sở hữu. */
export async function listLedgerAccounts(db: Database) {
  return accountsWithOwners(db)
    .orderBy('b.type')
    .orderBy('u.display_name')
    .orderBy('ev.name')
    .orderBy('b.account_id')
    .execute();
}

export async function findLedgerAccount(db: Database, accountId: string) {
  return accountsWithOwners(db).where('b.account_id', '=', accountId).executeTakeFirst();
}

/** Σ nợ và Σ có toàn sổ, cộng thẳng trên mọi dòng bút toán. */
export async function sumLedgerTotals(db: Database) {
  return db
    .selectFrom('ledger_entries')
    .select([
      sql<number>`COALESCE(SUM(amount) FILTER (WHERE direction = ${LedgerSide.DEBIT}), 0)::bigint`.as(
        'debit',
      ),
      sql<number>`COALESCE(SUM(amount) FILTER (WHERE direction = ${LedgerSide.CREDIT}), 0)::bigint`.as(
        'credit',
      ),
    ])
    .executeTakeFirstOrThrow();
}

export interface LedgerTransactionFilter {
  type?: LedgerTxnType;
  eventId?: string;
}

function transactionsMatching(db: Database, { type, eventId }: LedgerTransactionFilter) {
  let query = db.selectFrom('ledger_transactions as t');
  if (type !== undefined) {
    query = query.where('t.type', '=', type);
  }
  if (eventId !== undefined) {
    query = query.where('t.event_id', '=', eventId);
  }
  return query;
}

export async function listLedgerTransactions(
  db: Database,
  filter: LedgerTransactionFilter,
  page: PageWindow,
) {
  return transactionsMatching(db, filter)
    .innerJoin('events as ev', 'ev.id', 't.event_id')
    .select([
      't.id',
      't.type',
      't.description',
      't.order_id as orderId',
      't.event_id as eventId',
      'ev.name as eventName',
      't.created_at as createdAt',
    ])
    .orderBy('t.created_at', 'desc')
    .orderBy('t.id', 'desc')
    .limit(page.limit)
    .offset(page.offset)
    .execute();
}

export async function countLedgerTransactions(
  db: Database,
  filter: LedgerTransactionFilter,
): Promise<number> {
  const row = await transactionsMatching(db, filter)
    .select((eb) => eb.fn.countAll<number>().as('total'))
    .executeTakeFirstOrThrow();
  return row.total;
}

/** Dòng của nhiều giao dịch trong 1 truy vấn (không N+1): nợ trước có, rồi theo loại tài khoản. */
export async function listEntriesOfTransactions(db: Database, transactionIds: readonly string[]) {
  if (transactionIds.length === 0) {
    return [];
  }
  return db
    .selectFrom('ledger_entries as e')
    .innerJoin('ledger_accounts as a', 'a.id', 'e.account_id')
    .where('e.transaction_id', 'in', transactionIds)
    .select([
      'e.id',
      'e.transaction_id as transactionId',
      'e.direction',
      'e.amount',
      'a.id as accountId',
      'a.type as accountType',
    ])
    .orderBy('e.direction')
    .orderBy('a.type')
    .orderBy('e.id')
    .execute();
}

const accountEntries = (db: Database, accountId: string) =>
  db.selectFrom('ledger_entries as e').where('e.account_id', '=', accountId);

/** Dòng của 1 tài khoản, mới nhất trước, cùng thời điểm theo mã giao dịch (index `ledger_entries_account_created_at_idx`). */
export async function listAccountEntries(db: Database, accountId: string, page: PageWindow) {
  return accountEntries(db, accountId)
    .innerJoin('ledger_transactions as t', 't.id', 'e.transaction_id')
    .select([
      'e.id',
      'e.created_at as createdAt',
      'e.direction',
      'e.amount',
      't.id as transactionId',
      't.type as transactionType',
      't.description',
      't.order_id as orderId',
      't.event_id as eventId',
    ])
    .orderBy('e.created_at', 'desc')
    .orderBy('e.transaction_id', 'desc')
    .orderBy('e.id', 'desc')
    .limit(page.limit)
    .offset(page.offset)
    .execute();
}

export async function countAccountEntries(db: Database, accountId: string): Promise<number> {
  const row = await accountEntries(db, accountId)
    .select((eb) => eb.fn.countAll<number>().as('total'))
    .executeTakeFirstOrThrow();
  return row.total;
}

/**
 * Số dư ký quỹ > 0 của sự kiện từ view sổ cái: từng `ESCROW_SELLER` (kèm tên người bán) và
 * `ESCROW_FEE`. Đây là số tiền giải phóng thực tế, không cộng lại từ đơn.
 */
export async function listEventEscrowBalances(db: Database, eventId: string) {
  return db
    .selectFrom('ledger_account_balances as b')
    .leftJoin('users as u', 'u.id', 'b.owner_user_id')
    .where('b.event_id', '=', eventId)
    .where('b.type', 'in', [LedgerAccountType.ESCROW_SELLER, LedgerAccountType.ESCROW_FEE])
    .where('b.balance', '>', 0)
    .select([
      'b.type',
      'b.owner_user_id as ownerUserId',
      'u.display_name as ownerName',
      'b.balance',
    ])
    .orderBy('b.type')
    .orderBy('u.display_name')
    .orderBy('b.owner_user_id')
    .execute();
}
