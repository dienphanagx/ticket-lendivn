import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DbGuardError,
  LedgerAccountType,
  LedgerSide,
  LedgerTxnType,
  PaymentDisposition,
  PaymentSource,
} from '../../src/db/enums.js';
import type { LedgerAccount, Order } from '../../src/db/types.js';
import {
  buildOrder,
  insertEntries,
  insertEvent,
  insertLedgerTxn,
  insertListing,
  insertOrder,
  insertUser,
  upsertLedgerAccount,
  type EntryInput,
} from '../support/fixtures.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();

const CHECK_VIOLATION = '23514';
const RESTRICT_VIOLATION = '23001';

interface CaptureFixture {
  order: Order;
  cash: LedgerAccount;
  escrowSeller: LedgerAccount;
  escrowFee: LedgerAccount;
}

/** Đơn 500.000 × 2 + 3 tài khoản của bút toán PAYMENT_CAPTURED. */
async function arrangeCapture(): Promise<CaptureFixture> {
  const seller = await insertUser(db);
  const buyer = await insertUser(db);
  const event = await insertEvent(db);
  const listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { unit_price: 500_000 },
  );
  const order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
  return {
    order,
    cash: await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH }),
    escrowSeller: await upsertLedgerAccount(db, {
      type: LedgerAccountType.ESCROW_SELLER,
      ownerUserId: seller.id,
      eventId: event.id,
    }),
    escrowFee: await upsertLedgerAccount(db, {
      type: LedgerAccountType.ESCROW_FEE,
      eventId: event.id,
    }),
  };
}

const captureEntries = ({ order, cash, escrowSeller, escrowFee }: CaptureFixture): EntryInput[] => [
  { accountId: cash.id, direction: LedgerSide.DEBIT, amount: order.buyer_total },
  { accountId: escrowSeller.id, direction: LedgerSide.CREDIT, amount: order.seller_net },
  { accountId: escrowFee.id, direction: LedgerSide.CREDIT, amount: order.platform_fee },
];

const captureTxn = (order: Order) => ({
  type: LedgerTxnType.PAYMENT_CAPTURED,
  eventId: order.event_id,
  orderId: order.id,
});

const LOCK_POLL_INTERVAL_MS = 20;
const LOCK_POLL_ATTEMPTS = 100;
/** Khoá advisory chỉ test race của ledger_entry_guard dùng. */
const RACE_LOCK_KEY = 7_210_001;

/**
 * Chờ câu lệnh của backend `pid` kết thúc hoặc đứng chờ lock (vd kiểm FK chờ transaction khác), để
 * bước commit kế tiếp chắc chắn xen giữa lúc câu lệnh đang chạy.
 */
async function waitUntilSettledOrLockWait(pid: number, isSettled: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < LOCK_POLL_ATTEMPTS; attempt += 1) {
    if (isSettled()) return;
    const { rows } = await sql<{ waiting: boolean }>`
      SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${pid}
    `.execute(db);
    if (rows[0]?.waiting === true) return;
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
  }
  throw new Error(`backend ${pid} neither finished nor waited on a lock`);
}

async function countLedgerTransactions(): Promise<number> {
  const { count } = await db
    .selectFrom('ledger_transactions')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return count;
}

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.destroy();
});

describe('ledger balance constraint trigger', () => {
  it('should commit a balanced transaction', async () => {
    // Arrange
    const fixture = await arrangeCapture();

    // Act
    const txn = await db
      .transaction()
      .execute((trx) => insertLedgerTxn(trx, captureTxn(fixture.order), captureEntries(fixture)));

    // Assert
    const entries = await db
      .selectFrom('ledger_entries')
      .selectAll()
      .where('transaction_id', '=', txn.id)
      .execute();
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.created_at.getTime() === txn.created_at.getTime())).toBe(
      true,
    );
  });

  it('should reject an unbalanced transaction at COMMIT and roll everything back', async () => {
    // Arrange
    const fixture = await arrangeCapture();
    const [debit, sellerCredit] = captureEntries(fixture);
    let insertedBeforeCommit = false;

    // Act
    const result = db.transaction().execute(async (trx) => {
      await insertLedgerTxn(trx, captureTxn(fixture.order), [debit!, sellerCredit!]);
      // Deferred: câu INSERT lệch vẫn qua, lỗi chỉ đến lúc COMMIT
      insertedBeforeCommit = true;
    });

    // Assert
    await expect(result).rejects.toMatchObject({
      message: DbGuardError.LEDGER_UNBALANCED,
      code: CHECK_VIOLATION,
    });
    expect(insertedBeforeCommit).toBe(true);
    expect(await countLedgerTransactions()).toBe(0);
  });

  it('should reject a transaction without entries', async () => {
    // Arrange
    const fixture = await arrangeCapture();

    // Act
    const result = db
      .transaction()
      .execute((trx) => insertLedgerTxn(trx, captureTxn(fixture.order), []));

    // Assert
    await expect(result).rejects.toMatchObject({
      message: DbGuardError.LEDGER_UNBALANCED,
      code: CHECK_VIOLATION,
    });
    expect(await countLedgerTransactions()).toBe(0);
  });

  it('should reject a transaction with a single entry', async () => {
    // Arrange
    const fixture = await arrangeCapture();
    const [debit] = captureEntries(fixture);

    // Act
    const result = db
      .transaction()
      .execute((trx) => insertLedgerTxn(trx, captureTxn(fixture.order), [debit!]));

    // Assert
    await expect(result).rejects.toMatchObject({ message: DbGuardError.LEDGER_UNBALANCED });
  });
});

describe('ledger immutability', () => {
  it('should reject adding balanced entries to an already committed transaction', async () => {
    // Arrange
    const fixture = await arrangeCapture();
    const txn = await db
      .transaction()
      .execute((trx) => insertLedgerTxn(trx, captureTxn(fixture.order), captureEntries(fixture)));
    const extraPair: EntryInput[] = [
      { accountId: fixture.cash.id, direction: LedgerSide.DEBIT, amount: 1_000 },
      { accountId: fixture.escrowFee.id, direction: LedgerSide.CREDIT, amount: 1_000 },
    ];

    // Act
    const result = db.transaction().execute((trx) => insertEntries(trx, txn.id, extraPair));

    // Assert
    await expect(result).rejects.toMatchObject({
      message: DbGuardError.LEDGER_TRANSACTION_CLOSED,
      code: CHECK_VIOLATION,
    });
    const entries = await db
      .selectFrom('ledger_entries')
      .select('id')
      .where('transaction_id', '=', txn.id)
      .execute();
    expect(entries).toHaveLength(3);
  });

  it('should reject entries whose parent transaction does not exist', async () => {
    // Arrange
    const fixture = await arrangeCapture();
    const [debit, sellerCredit] = captureEntries(fixture);

    // Act: không truyền created_at → trước đây ra 23502 thay vì lỗi của guard
    const result = db
      .transaction()
      .execute((trx) => insertEntries(trx, randomUUID(), [debit!, sellerCredit!]));

    // Assert
    await expect(result).rejects.toMatchObject({
      message: DbGuardError.LEDGER_TRANSACTION_CLOSED,
      code: CHECK_VIOLATION,
    });
  });

  it('should reject entries from another connection while the parent transaction is still open', async () => {
    // Arrange: A tạo giao dịch T cân bằng, chưa commit; C giữ advisory lock
    const fixture = await arrangeCapture();
    const trxA = await db.startTransaction().execute();
    const trxB = await db.startTransaction().execute();
    const trxC = await db.startTransaction().execute();
    try {
      const txn = await insertLedgerTxn(trxA, captureTxn(fixture.order), captureEntries(fixture));
      await sql`SELECT pg_advisory_xact_lock(${RACE_LOCK_KEY})`.execute(trxC);
      const { rows } = await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(trxB);
      const pidB = rows[0]!.pid;

      // Act: B chèn cặp dòng cân vào T (SQL thô, có created_at). INSERT trong WITH: BEFORE trigger
      // chạy ngay, còn AFTER trigger (gồm kiểm FK) chỉ chạy khi hết câu lệnh, tức sau khi query
      // chính lấy được lock của C → A commit đúng vào khe giữa guard và kiểm FK
      let settled = false;
      // Gắn handler ngay để lỗi của B không thành unhandled rejection trong lúc chờ
      const errorB = sql`
        WITH inserted AS (
          INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, created_at)
          VALUES (${txn.id}, ${fixture.cash.id}, ${LedgerSide.DEBIT}, 1000, now()),
                 (${txn.id}, ${fixture.escrowFee.id}, ${LedgerSide.CREDIT}, 1000, now())
          RETURNING id
        )
        SELECT pg_advisory_xact_lock(${RACE_LOCK_KEY})
          FROM (SELECT count(*) FROM inserted) AS done
      `
        .execute(trxB)
        .then(
          () => null,
          (error: unknown) => error,
        )
        .finally(() => {
          settled = true;
        });
      await waitUntilSettledOrLockWait(pidB, () => settled);
      await trxA.commit().execute();
      await trxC.commit().execute();

      // Assert
      expect(await errorB).toMatchObject({
        message: DbGuardError.LEDGER_TRANSACTION_CLOSED,
        code: CHECK_VIOLATION,
      });
      await trxB.rollback().execute();
      const entries = await db
        .selectFrom('ledger_entries')
        .select('id')
        .where('transaction_id', '=', txn.id)
        .execute();
      expect(entries).toHaveLength(3);
    } finally {
      // C nhả lock trước: câu lệnh của B có thể còn treo chờ lock đó, rollback B xếp hàng sau nó
      for (const trx of [trxC, trxB, trxA]) {
        if (!trx.isCommitted && !trx.isRolledBack) await trx.rollback().execute();
      }
    }
  });

  it.each([
    ['UPDATE ledger_entries', sql`UPDATE ledger_entries SET amount = amount + 1`],
    ['DELETE ledger_entries', sql`DELETE FROM ledger_entries`],
    ['UPDATE ledger_transactions', sql`UPDATE ledger_transactions SET description = 'tampered'`],
    ['DELETE ledger_transactions', sql`DELETE FROM ledger_transactions`],
    ['UPDATE payment_transactions', sql`UPDATE payment_transactions SET amount = amount + 1`],
    ['DELETE payment_transactions', sql`DELETE FROM payment_transactions`],
  ])('should reject %s', async (_label, statement) => {
    // Arrange
    const fixture = await arrangeCapture();
    await db.transaction().execute(async (trx) => {
      const txn = await insertLedgerTxn(trx, captureTxn(fixture.order), captureEntries(fixture));
      await trx
        .insertInto('payment_transactions')
        .values({
          order_id: fixture.order.id,
          source: PaymentSource.IPN,
          gateway_txn_no: '14000001',
          response_code: '00',
          transaction_status: '00',
          is_success: true,
          amount: fixture.order.buyer_total,
          disposition: PaymentDisposition.CAPTURED,
          ledger_transaction_id: txn.id,
        })
        .execute();
    });

    // Act
    const result = statement.execute(db);

    // Assert
    await expect(result).rejects.toMatchObject({
      message: DbGuardError.LEDGER_IMMUTABLE,
      code: RESTRICT_VIOLATION,
    });
  });
});

describe('ledger_account_balances view', () => {
  it('should compute pending and available balances per user from entries', async () => {
    // Arrange: Chi vừa bán (2 sự kiện) vừa mua (1 khoản cần hoàn)
    const chi = await insertUser(db);
    const buyer = await insertUser(db);
    const otherSeller = await insertUser(db);
    const releasedEvent = await insertEvent(db);
    const openEvent = await insertEvent(db);
    const chiReleased = await insertListing(
      db,
      { event_id: releasedEvent.id, seller_id: chi.id },
      { unit_price: 500_000 },
    );
    const chiOpen = await insertListing(
      db,
      { event_id: openEvent.id, seller_id: chi.id },
      { unit_price: 333_333 },
    );
    const otherOpen = await insertListing(
      db,
      { event_id: openEvent.id, seller_id: otherSeller.id },
      { unit_price: 200_000 },
    );
    const releasedOrder = await insertOrder(db, buildOrder(chiReleased, buyer.id, 2));
    const openOrder = await insertOrder(db, buildOrder(chiOpen, buyer.id, 1));
    const refundOrder = await insertOrder(db, buildOrder(otherOpen, chi.id, 1));

    const cash = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });
    const revenue = await upsertLedgerAccount(db, { type: LedgerAccountType.PLATFORM_FEE_REVENUE });
    const escrowReleased = await upsertLedgerAccount(db, {
      type: LedgerAccountType.ESCROW_SELLER,
      ownerUserId: chi.id,
      eventId: releasedEvent.id,
    });
    const escrowOpen = await upsertLedgerAccount(db, {
      type: LedgerAccountType.ESCROW_SELLER,
      ownerUserId: chi.id,
      eventId: openEvent.id,
    });
    const feeReleased = await upsertLedgerAccount(db, {
      type: LedgerAccountType.ESCROW_FEE,
      eventId: releasedEvent.id,
    });
    const feeOpen = await upsertLedgerAccount(db, {
      type: LedgerAccountType.ESCROW_FEE,
      eventId: openEvent.id,
    });
    const chiPayable = await upsertLedgerAccount(db, {
      type: LedgerAccountType.SELLER_PAYABLE,
      ownerUserId: chi.id,
    });
    const chiRefund = await upsertLedgerAccount(db, {
      type: LedgerAccountType.BUYER_REFUND_PAYABLE,
      ownerUserId: chi.id,
    });

    // Act
    await db.transaction().execute(async (trx) => {
      await insertLedgerTxn(trx, captureTxn(releasedOrder), [
        { accountId: cash.id, direction: LedgerSide.DEBIT, amount: releasedOrder.buyer_total },
        {
          accountId: escrowReleased.id,
          direction: LedgerSide.CREDIT,
          amount: releasedOrder.seller_net,
        },
        {
          accountId: feeReleased.id,
          direction: LedgerSide.CREDIT,
          amount: releasedOrder.platform_fee,
        },
      ]);
      await insertLedgerTxn(trx, captureTxn(openOrder), [
        { accountId: cash.id, direction: LedgerSide.DEBIT, amount: openOrder.buyer_total },
        { accountId: escrowOpen.id, direction: LedgerSide.CREDIT, amount: openOrder.seller_net },
        { accountId: feeOpen.id, direction: LedgerSide.CREDIT, amount: openOrder.platform_fee },
      ]);
      await insertLedgerTxn(
        trx,
        {
          type: LedgerTxnType.EVENT_RELEASE,
          eventId: releasedEvent.id,
          orderId: null,
          idempotencyKey: `EVENT_RELEASE:${releasedEvent.id}`,
        },
        [
          {
            accountId: escrowReleased.id,
            direction: LedgerSide.DEBIT,
            amount: releasedOrder.seller_net,
          },
          {
            accountId: chiPayable.id,
            direction: LedgerSide.CREDIT,
            amount: releasedOrder.seller_net,
          },
          {
            accountId: feeReleased.id,
            direction: LedgerSide.DEBIT,
            amount: releasedOrder.platform_fee,
          },
          {
            accountId: revenue.id,
            direction: LedgerSide.CREDIT,
            amount: releasedOrder.platform_fee,
          },
        ],
      );
      await insertLedgerTxn(
        trx,
        { ...captureTxn(refundOrder), type: LedgerTxnType.PAYMENT_REFUND_REQUIRED },
        [
          { accountId: cash.id, direction: LedgerSide.DEBIT, amount: refundOrder.buyer_total },
          {
            accountId: chiRefund.id,
            direction: LedgerSide.CREDIT,
            amount: refundOrder.buyer_total,
          },
        ],
      );
    });

    // Assert
    const balances = await db.selectFrom('ledger_account_balances').selectAll().execute();
    const balanceOf = (account: LedgerAccount): number =>
      balances.find((row) => row.account_id === account.id)?.balance ?? Number.NaN;
    const chiRows = balances.filter((row) => row.owner_user_id === chi.id);
    const pending = chiRows
      .filter((row) => row.type === LedgerAccountType.ESCROW_SELLER)
      .reduce((sum, row) => sum + row.balance, 0);
    const available = chiRows
      .filter(
        (row) =>
          row.type === LedgerAccountType.SELLER_PAYABLE ||
          row.type === LedgerAccountType.BUYER_REFUND_PAYABLE,
      )
      .reduce((sum, row) => sum + row.balance, 0);

    // 500.000 × 2: seller_net 950.000, phí 150.000; 333.333 × 1: 316.667 / 49.999; hoàn 200.000 × 1: 220.000
    expect(pending).toBe(316_667);
    expect(available).toBe(950_000 + 220_000);
    expect(balanceOf(escrowReleased)).toBe(0);
    expect(balanceOf(feeReleased)).toBe(0);
    expect(balanceOf(feeOpen)).toBe(49_999);
    expect(balanceOf(revenue)).toBe(150_000);
    expect(balanceOf(cash)).toBe(1_100_000 + 366_666 + 220_000);

    const totalDebit = balances.reduce((sum, row) => sum + row.total_debit, 0);
    const totalCredit = balances.reduce((sum, row) => sum + row.total_credit, 0);
    expect(totalDebit).toBe(totalCredit);
    const creditBalances = balances
      .filter((row) => row.normal_side === LedgerSide.CREDIT)
      .reduce((sum, row) => sum + row.balance, 0);
    expect(balanceOf(cash)).toBe(creditBalances);
  });

  it('should return zero totals for an account without entries', async () => {
    // Arrange
    const cash = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });

    // Act
    const row = await db
      .selectFrom('ledger_account_balances')
      .selectAll()
      .where('account_id', '=', cash.id)
      .executeTakeFirstOrThrow();

    // Assert
    expect(row).toMatchObject({ total_debit: 0, total_credit: 0, balance: 0 });
  });
});

describe('ledger_accounts constraints', () => {
  it('should keep a single platform account when upserted twice', async () => {
    // Arrange
    const first = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });

    // Act
    const second = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });

    // Assert
    expect(second.id).toBe(first.id);
  });

  it('should reject an escrow account without owner', async () => {
    // Arrange
    const event = await insertEvent(db);

    // Act
    const result = db
      .insertInto('ledger_accounts')
      .values({
        type: LedgerAccountType.ESCROW_SELLER,
        event_id: event.id,
        normal_side: LedgerSide.CREDIT,
      })
      .execute();

    // Assert
    await expect(result).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: 'ledger_accounts_owner_shape_ck',
    });
  });
});
