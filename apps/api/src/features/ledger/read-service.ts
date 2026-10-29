import type { Database } from '../../db/client.js';
import { LedgerAccountType } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { isUuid } from '../../lib/ids.js';
import { buildPageMeta, toOffset, type PageParams } from '../../lib/pagination.js';
import { EVENT_ERRORS } from '../events/errors.js';
import { resolveCurrentUser } from '../users/current-user.js';
import { LEDGER_ERRORS } from './errors.js';
import {
  countAccountEntries,
  countLedgerTransactions,
  countUserEntries,
  findLedgerAccount,
  listAccountEntries,
  listEntriesOfTransactions,
  listLedgerAccounts,
  listLedgerTransactions,
  listUserEntries,
  sumLedgerTotals,
  sumUserBalances,
  type LedgerTransactionFilter,
} from './read-repository.js';

// Đọc số dư / sổ cái (spec api § E). Mỗi lần đọc chạy trong 1 transaction REPEATABLE READ chỉ đọc:
// các câu (số dư, trang dòng, tổng) thấy cùng 1 snapshot, nên cộng các dòng của 1 loại số dư luôn
// khớp số dư đó kể cả khi có thanh toán commit giữa chừng.

const readSnapshot = <T>(db: Database, read: (trx: Database) => Promise<T>): Promise<T> =>
  db.transaction().setIsolationLevel('repeatable read').setAccessMode('read only').execute(read);

export const BalanceType = {
  PENDING: 'PENDING',
  AVAILABLE: 'AVAILABLE',
} as const;
export type BalanceType = (typeof BalanceType)[keyof typeof BalanceType];

/** `ESCROW_SELLER` = số dư đang chờ; `SELLER_PAYABLE`, `BUYER_REFUND_PAYABLE` = số dư khả dụng. */
const balanceTypeOf = (type: LedgerAccountType): BalanceType =>
  type === LedgerAccountType.ESCROW_SELLER ? BalanceType.PENDING : BalanceType.AVAILABLE;

/**
 * Số dư đang chờ = Σ `ESCROW_SELLER`; khả dụng = `SELLER_PAYABLE` + `BUYER_REFUND_PAYABLE`; lịch sử
 * dòng bút toán của các tài khoản thuộc người dùng, số tiền có dấu theo chiều tăng số dư.
 */
export async function getUserBalance(db: Database, headerUserId: string, page: PageParams) {
  const userId = await resolveCurrentUser(db, headerUserId);
  return readSnapshot(db, async (trx) => {
    const balances = await sumUserBalances(trx, userId);
    const total = await countUserEntries(trx, userId);
    const rows = await listUserEntries(trx, userId, { offset: toOffset(page), limit: page.limit });
    return {
      pendingBalance: balances.pending,
      availableBalance: balances.sales + balances.refunds,
      availableBreakdown: { sales: balances.sales, refunds: balances.refunds },
      entries: rows.map(({ direction, normalSide, amount, accountType, ...row }) => ({
        ...row,
        accountType,
        amount: direction === normalSide ? amount : -amount,
        balanceType: balanceTypeOf(accountType),
      })),
      meta: buildPageMeta(total, page),
    };
  });
}

export interface LedgerOverviewInput extends PageParams, LedgerTransactionFilter {}

async function assertEventExists(db: Database, eventId: string): Promise<string> {
  const row = isUuid(eventId)
    ? await db.selectFrom('events').select('id').where('id', '=', eventId).executeTakeFirst()
    : undefined;
  if (row === undefined) {
    throw new AppError(EVENT_ERRORS.NOT_FOUND);
  }
  return row.id;
}

/** Tài khoản + Σ nợ / Σ có luôn tính trên toàn sổ; bộ lọc chỉ áp cho danh sách giao dịch. */
export async function getLedgerOverview(
  db: Database,
  { type, eventId, ...page }: LedgerOverviewInput,
) {
  const filter = {
    type,
    eventId: eventId === undefined ? undefined : await assertEventExists(db, eventId),
  };
  return readSnapshot(db, async (trx) => {
    const accounts = await listLedgerAccounts(trx);
    const totals = await sumLedgerTotals(trx);
    const total = await countLedgerTransactions(trx, filter);
    const transactions = await listLedgerTransactions(trx, filter, {
      offset: toOffset(page),
      limit: page.limit,
    });
    const entries = await listEntriesOfTransactions(
      trx,
      transactions.map((txn) => txn.id),
    );
    return {
      accounts,
      totals,
      transactions: transactions.map((txn) => ({
        ...txn,
        entries: entries.filter((entry) => entry.transactionId === txn.id),
      })),
      meta: buildPageMeta(total, page),
    };
  });
}

/** Thông tin + tổng của tài khoản tính trên mọi dòng (view số dư), dòng bút toán phân trang. */
export async function getLedgerAccount(db: Database, accountId: string, page: PageParams) {
  return readSnapshot(db, async (trx) => {
    const account = isUuid(accountId) ? await findLedgerAccount(trx, accountId) : undefined;
    if (account === undefined) {
      throw new AppError(LEDGER_ERRORS.ACCOUNT_NOT_FOUND);
    }
    const total = await countAccountEntries(trx, account.id);
    const entries = await listAccountEntries(trx, account.id, {
      offset: toOffset(page),
      limit: page.limit,
    });
    return { account, entries, meta: buildPageMeta(total, page) };
  });
}
