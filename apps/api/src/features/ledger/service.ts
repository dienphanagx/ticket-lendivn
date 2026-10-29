import type { FastifyBaseLogger } from 'fastify';

import type { Database } from '../../db/client.js';
import { LedgerAccountType, LedgerSide, type LedgerTxnType } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { LEDGER_ERRORS } from './errors.js';
import {
  ensureLedgerAccount,
  findLedgerTransactionId,
  insertLedgerEntries,
  insertLedgerTransaction,
  type LedgerAccountKey,
} from './repository.js';

// Ghi bút toán kép (spec api § E Ghi Bút Toán). Caller mở transaction và truyền `trx`, để giao dịch sổ
// cái commit / rollback cùng thay đổi trạng thái liên quan. Trigger deferred `ledger_*_balanced` là
// chốt cuối; kiểm ở đây để từ chối trước khi chèn và log có ngữ cảnh.

const MIN_LINES = 2;
/** Thứ tự khai báo enum `ledger_account_type` = thứ tự tạo tài khoản (chống deadlock khi tạo mới). */
const ACCOUNT_TYPE_ORDER: readonly LedgerAccountType[] = Object.values(LedgerAccountType);

export interface LedgerLine {
  account: LedgerAccountKey;
  direction: LedgerSide;
  /** VND, số nguyên > 0. */
  amount: number;
}

export interface LedgerPosting {
  type: LedgerTxnType;
  /** `PAYMENT:<vnp_TransactionNo>` hoặc `EVENT_RELEASE:<event_id>`. */
  idempotencyKey: string;
  eventId: string;
  orderId: string | null;
  /** Mô tả tiếng Việt ≤ 255 ký tự. */
  description: string;
  lines: readonly LedgerLine[];
}

export interface PostedLedgerTransaction {
  id: string;
  /** false = khoá chống trùng đã có giao dịch, không ghi thêm dòng nào. */
  created: boolean;
}

/**
 * Σ nợ / Σ có của các dòng (bigint để cộng không tràn safe integer). Dòng không phải số nguyên an
 * toàn (1.5, NaN) bị bỏ qua vì `BigInt()` ném `RangeError`; lý do lệch của chúng do `findUnbalancedReason` báo.
 */
function totalsOf(lines: readonly LedgerLine[]): { debit: bigint; credit: bigint } {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amount)) {
      continue;
    }
    if (line.direction === LedgerSide.DEBIT) {
      debit += BigInt(line.amount);
    } else {
      credit += BigInt(line.amount);
    }
  }
  return { debit, credit };
}

/** Lý do lệch, hoặc `undefined` khi giao dịch hợp lệ: ≥ 2 dòng, mọi dòng số nguyên > 0, Σ nợ = Σ có. */
export function findUnbalancedReason(lines: readonly LedgerLine[]): string | undefined {
  if (lines.length < MIN_LINES) {
    return 'fewer than 2 lines';
  }
  if (lines.some((line) => !Number.isSafeInteger(line.amount) || line.amount <= 0)) {
    return 'line amount must be a positive integer';
  }
  const { debit, credit } = totalsOf(lines);
  return debit === credit ? undefined : 'debit total differs from credit total';
}

const accountSortKey = ({ account }: LedgerLine): string =>
  `${ACCOUNT_TYPE_ORDER.indexOf(account.type)}|${account.ownerUserId ?? ''}|${account.eventId ?? ''}`;

const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Get-or-create tài khoản theo 1 thứ tự cố định (loại → chủ sở hữu → sự kiện): 2 giao dịch cùng tạo
 * các tài khoản mới chờ nhau theo cùng thứ tự, không tạo vòng chờ.
 */
async function resolveAccountIds(
  trx: Database,
  lines: readonly LedgerLine[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const ordered = [...lines].sort((a, b) => compareKeys(accountSortKey(a), accountSortKey(b)));
  for (const line of ordered) {
    const key = accountSortKey(line);
    if (!ids.has(key)) {
      ids.set(key, await ensureLedgerAccount(trx, line.account));
    }
  }
  return ids;
}

function accountIdOf(ids: ReadonlyMap<string, string>, line: LedgerLine): string {
  const id = ids.get(accountSortKey(line));
  if (id === undefined) {
    throw new Error('Ledger account was not resolved');
  }
  return id;
}

/**
 * Ghi 1 giao dịch sổ cái + các dòng trong `trx` của caller. Lệch → log `ledger.unbalanced` và throw
 * `LEDGER_UNBALANCED` trước khi chèn gì; trùng `idempotencyKey` → trả giao dịch đã có, không ghi thêm.
 */
export async function postLedgerTransaction(
  trx: Database,
  posting: LedgerPosting,
  log: FastifyBaseLogger,
): Promise<PostedLedgerTransaction> {
  const reason = findUnbalancedReason(posting.lines);
  if (reason !== undefined) {
    const { debit, credit } = totalsOf(posting.lines);
    log.error(
      {
        event: 'ledger.unbalanced',
        entityId: posting.idempotencyKey,
        metadata: {
          type: posting.type,
          orderId: posting.orderId,
          reason,
          lineCount: posting.lines.length,
          debit: debit.toString(),
          credit: credit.toString(),
        },
      },
      'ledger transaction unbalanced',
    );
    throw new AppError(LEDGER_ERRORS.UNBALANCED);
  }

  const transactionId = await insertLedgerTransaction(trx, {
    type: posting.type,
    idempotencyKey: posting.idempotencyKey,
    eventId: posting.eventId,
    orderId: posting.orderId,
    description: posting.description,
  });
  if (transactionId === undefined) {
    return { id: await findLedgerTransactionId(trx, posting.idempotencyKey), created: false };
  }

  const accountIds = await resolveAccountIds(trx, posting.lines);
  await insertLedgerEntries(
    trx,
    transactionId,
    posting.lines.map((line) => ({
      accountId: accountIdOf(accountIds, line),
      direction: line.direction,
      amount: line.amount,
    })),
  );
  return { id: transactionId, created: true };
}
