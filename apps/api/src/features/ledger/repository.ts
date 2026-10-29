import type { Database } from '../../db/client.js';
import { LedgerAccountType, LedgerSide, type LedgerTxnType } from '../../db/enums.js';

// Repository nhận `trx` từ service, không tự mở transaction (specs/database.md § Conventions).

const ACCOUNT_KEY_CONSTRAINT = 'ledger_accounts_key_uq';
const TXN_IDEMPOTENCY_COLUMN = 'idempotency_key';

/** Khoá tự nhiên của tài khoản sổ cái = constraint `ledger_accounts_key_uq` (NULLS NOT DISTINCT). */
export interface LedgerAccountKey {
  type: LedgerAccountType;
  ownerUserId: string | null;
  eventId: string | null;
}

/** Tài sản tăng bên nợ; nợ phải trả / doanh thu tăng bên có (CHECK `ledger_accounts_normal_side_ck`). */
const normalSideOf = (type: LedgerAccountType): LedgerSide =>
  type === LedgerAccountType.GATEWAY_CASH ? LedgerSide.DEBIT : LedgerSide.CREDIT;

/**
 * Get-or-create: `INSERT … ON CONFLICT ON CONSTRAINT ledger_accounts_key_uq DO NOTHING` rồi `SELECT`.
 * Transaction khác đang tạo cùng tài khoản → INSERT chờ bên đó commit rồi DO NOTHING; câu SELECT kế
 * tiếp (snapshot mới của READ COMMITTED) thấy dòng đã có.
 */
export async function ensureLedgerAccount(db: Database, key: LedgerAccountKey): Promise<string> {
  await db
    .insertInto('ledger_accounts')
    .values({
      type: key.type,
      owner_user_id: key.ownerUserId,
      event_id: key.eventId,
      normal_side: normalSideOf(key.type),
    })
    .onConflict((oc) => oc.constraint(ACCOUNT_KEY_CONSTRAINT).doNothing())
    .execute();
  const row = await db
    .selectFrom('ledger_accounts')
    .select('id')
    .where('type', '=', key.type)
    .where('owner_user_id', key.ownerUserId === null ? 'is' : '=', key.ownerUserId)
    .where('event_id', key.eventId === null ? 'is' : '=', key.eventId)
    .executeTakeFirstOrThrow();
  return row.id;
}

export interface NewLedgerTransactionValues {
  type: LedgerTxnType;
  idempotencyKey: string;
  eventId: string;
  orderId: string | null;
  description: string;
}

/** Chèn giao dịch; trùng `idempotency_key` → không chèn, trả `undefined`. */
export async function insertLedgerTransaction(
  db: Database,
  values: NewLedgerTransactionValues,
): Promise<string | undefined> {
  const row = await db
    .insertInto('ledger_transactions')
    .values({
      type: values.type,
      idempotency_key: values.idempotencyKey,
      event_id: values.eventId,
      order_id: values.orderId,
      description: values.description,
    })
    .onConflict((oc) => oc.column(TXN_IDEMPOTENCY_COLUMN).doNothing())
    .returning('id')
    .executeTakeFirst();
  return row?.id;
}

export async function findLedgerTransactionId(
  db: Database,
  idempotencyKey: string,
): Promise<string> {
  const row = await db
    .selectFrom('ledger_transactions')
    .select('id')
    .where('idempotency_key', '=', idempotencyKey)
    .executeTakeFirstOrThrow();
  return row.id;
}

export interface NewLedgerEntryValues {
  accountId: string;
  direction: LedgerSide;
  amount: number;
}

export async function insertLedgerEntries(
  db: Database,
  transactionId: string,
  entries: readonly NewLedgerEntryValues[],
): Promise<void> {
  await db
    .insertInto('ledger_entries')
    .values(
      entries.map((entry) => ({
        transaction_id: transactionId,
        account_id: entry.accountId,
        direction: entry.direction,
        amount: entry.amount,
      })),
    )
    .execute();
}
