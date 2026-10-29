import { Writable } from 'node:stream';

import { pino } from 'pino';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LedgerAccountType, LedgerSide, LedgerTxnType } from '../../src/db/enums.js';
import type { Order, User } from '../../src/db/types.js';
import {
  paymentCapturedPosting,
  paymentIdempotencyKey,
  paymentRefundRequiredPosting,
} from '../../src/features/ledger/postings.js';
import {
  findUnbalancedReason,
  postLedgerTransaction,
  type LedgerLine,
  type LedgerPosting,
} from '../../src/features/ledger/service.js';
import { AppError } from '../../src/lib/app-error.js';
import {
  buildOrder,
  insertEvent,
  insertListing,
  insertOrder,
  insertUser,
} from '../support/fixtures.js';
import {
  accountBalance,
  countLedgerTransactions,
  ledgerTotals,
  pendingBalance,
} from '../support/ledger.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';

const db = createTestDb();
const log = pino({ level: 'silent' });

afterAll(async () => {
  await db.destroy();
});

const CASH = { type: LedgerAccountType.GATEWAY_CASH, ownerUserId: null, eventId: null };
const line = (direction: LedgerSide, amount: number): LedgerLine => ({
  account: CASH,
  direction,
  amount,
});

const capturedInput = {
  gatewayTxnNo: '14000001',
  orderId: '261029ABCDEFGH12',
  eventId: 'event-1',
  eventName: 'Live show',
  sellerId: 'seller-1',
  quantity: 2,
  buyerTotal: 1_100_000,
  sellerNet: 950_000,
  platformFee: 150_000,
};

describe('findUnbalancedReason', () => {
  it('should accept lines where debit total equals credit total', () => {
    const lines = [
      line(LedgerSide.DEBIT, 300),
      line(LedgerSide.CREDIT, 100),
      line(LedgerSide.CREDIT, 200),
    ];

    expect(findUnbalancedReason(lines)).toBeUndefined();
  });

  it('should reject debit total different from credit total', () => {
    const lines = [line(LedgerSide.DEBIT, 300), line(LedgerSide.CREDIT, 299)];

    expect(findUnbalancedReason(lines)).toBe('debit total differs from credit total');
  });

  it('should reject fewer than 2 lines', () => {
    expect(findUnbalancedReason([line(LedgerSide.DEBIT, 100)])).toBe('fewer than 2 lines');
  });

  it.each([0, -100, 1.5])('should reject a line amount of %s', (amount) => {
    const lines = [line(LedgerSide.DEBIT, amount), line(LedgerSide.CREDIT, amount)];

    expect(findUnbalancedReason(lines)).toBe('line amount must be a positive integer');
  });
});

describe('payment postings', () => {
  it('should split PAYMENT_CAPTURED into buyerTotal / sellerNet / platformFee', () => {
    const posting = paymentCapturedPosting(capturedInput);

    expect(posting).toMatchObject({
      type: LedgerTxnType.PAYMENT_CAPTURED,
      idempotencyKey: 'PAYMENT:14000001',
      orderId: capturedInput.orderId,
      description: 'Bán 2 vé · Live show · Đơn 261029ABCDEFGH12',
    });
    expect(posting.lines).toEqual([
      { account: CASH, direction: LedgerSide.DEBIT, amount: 1_100_000 },
      {
        account: {
          type: LedgerAccountType.ESCROW_SELLER,
          ownerUserId: 'seller-1',
          eventId: 'event-1',
        },
        direction: LedgerSide.CREDIT,
        amount: 950_000,
      },
      {
        account: { type: LedgerAccountType.ESCROW_FEE, ownerUserId: null, eventId: 'event-1' },
        direction: LedgerSide.CREDIT,
        amount: 150_000,
      },
    ]);
    expect(findUnbalancedReason(posting.lines)).toBeUndefined();
  });

  it('should drop the zero platform fee line and stay balanced', () => {
    // Giá 5 ₫ × 1: phí 0, sellerNet = buyerTotal = 5
    const posting = paymentCapturedPosting({
      ...capturedInput,
      quantity: 1,
      buyerTotal: 5,
      sellerNet: 5,
      platformFee: 0,
    });

    expect(posting.lines.map((entry) => entry.account.type)).toEqual([
      LedgerAccountType.GATEWAY_CASH,
      LedgerAccountType.ESCROW_SELLER,
    ]);
    expect(findUnbalancedReason(posting.lines)).toBeUndefined();
  });

  it('should keep the description within 255 characters for a long event name', () => {
    const posting = paymentCapturedPosting({ ...capturedInput, eventName: 'Đ'.repeat(300) });

    expect([...posting.description]).toHaveLength(255);
    expect(posting.description.endsWith('Đơn 261029ABCDEFGH12')).toBe(true);
  });

  it('should credit the buyer refund payable with the received amount', () => {
    const posting = paymentRefundRequiredPosting({
      gatewayTxnNo: '14000002',
      orderId: capturedInput.orderId,
      eventId: 'event-1',
      buyerId: 'buyer-1',
      amount: 366_666,
    });

    expect(posting).toMatchObject({
      type: LedgerTxnType.PAYMENT_REFUND_REQUIRED,
      idempotencyKey: paymentIdempotencyKey('14000002'),
      description: 'Khoản hoàn tiền · Đơn 261029ABCDEFGH12',
    });
    expect(posting.lines).toEqual([
      { account: CASH, direction: LedgerSide.DEBIT, amount: 366_666 },
      {
        account: {
          type: LedgerAccountType.BUYER_REFUND_PAYABLE,
          ownerUserId: 'buyer-1',
          eventId: null,
        },
        direction: LedgerSide.CREDIT,
        amount: 366_666,
      },
    ]);
  });
});

describe('postLedgerTransaction', () => {
  let seller: User;
  let order: Order;

  beforeEach(async () => {
    await resetDatabase(db);
    seller = await insertUser(db);
    const buyer = await insertUser(db);
    const event = await insertEvent(db, { name: 'Live show' });
    const listing = await insertListing(db, { event_id: event.id, seller_id: seller.id });
    order = await insertOrder(db, buildOrder(listing, buyer.id, 2));
  });

  const capturePosting = (gatewayTxnNo = '14000001'): LedgerPosting =>
    paymentCapturedPosting({
      gatewayTxnNo,
      orderId: order.id,
      eventId: order.event_id,
      eventName: 'Live show',
      sellerId: seller.id,
      quantity: order.quantity,
      buyerTotal: order.buyer_total,
      sellerNet: order.seller_net,
      platformFee: order.platform_fee,
    });

  const post = (posting: LedgerPosting) =>
    db
      .transaction()
      .setIsolationLevel('read committed')
      .execute((trx) => postLedgerTransaction(trx, posting, log));

  it('should create missing accounts and write balanced entries', async () => {
    // Act (TRUNCATE đã xoá cả tài khoản sàn: get-or-create phải tạo lại)
    const posted = await post(capturePosting());

    // Assert
    expect(posted.created).toBe(true);
    expect(await accountBalance(db, LedgerAccountType.GATEWAY_CASH)).toBe(1_100_000);
    expect(await pendingBalance(db, seller.id)).toBe(950_000);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, order.event_id)).toBe(150_000);
    expect(await ledgerTotals(db)).toEqual({ debit: 1_100_000, credit: 1_100_000 });
  });

  it('should return the existing transaction for a reused idempotency key without new entries', async () => {
    // Arrange
    const first = await post(capturePosting());

    // Act
    const second = await post(capturePosting());

    // Assert
    expect(second).toEqual({ id: first.id, created: false });
    expect(await countLedgerTransactions(db)).toBe(1);
    expect(await ledgerTotals(db)).toEqual({ debit: 1_100_000, credit: 1_100_000 });
  });

  it('should reuse one account per key across transactions', async () => {
    // Act
    await post(capturePosting('14000001'));
    await post(capturePosting('14000002'));

    // Assert
    const accounts = await db.selectFrom('ledger_accounts').select('type').execute();
    expect(accounts.map((account) => account.type).sort()).toEqual(
      [
        LedgerAccountType.ESCROW_FEE,
        LedgerAccountType.ESCROW_SELLER,
        LedgerAccountType.GATEWAY_CASH,
      ].sort(),
    );
    expect(await pendingBalance(db, seller.id)).toBe(1_900_000);
  });

  it.each([1.5, Number.NaN])(
    'should reject a line amount of %s with LEDGER_UNBALANCED and log it',
    async (amount) => {
      // Arrange
      const lines: string[] = [];
      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          lines.push(chunk.toString());
          callback();
        },
      });
      const capturingLog = pino(sink);
      const posting: LedgerPosting = {
        ...capturePosting(),
        lines: [line(LedgerSide.DEBIT, amount), line(LedgerSide.CREDIT, amount)],
      };

      // Act
      const error = await db
        .transaction()
        .execute((trx) => postLedgerTransaction(trx, posting, capturingLog))
        .catch((err: unknown) => err);

      // Assert
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'LEDGER_UNBALANCED' });
      const logged = lines.map((entry) => JSON.parse(entry) as Record<string, unknown>);
      expect(logged).toContainEqual(
        expect.objectContaining({
          event: 'ledger.unbalanced',
          metadata: expect.objectContaining({
            reason: 'line amount must be a positive integer',
          }) as unknown,
        }),
      );
      expect(await countLedgerTransactions(db)).toBe(0);
    },
  );

  it('should reject an unbalanced posting in the app before inserting anything', async () => {
    // Arrange: có dòng Có ESCROW_FEE thiếu 1 ₫
    const balanced = capturePosting();
    const unbalanced: LedgerPosting = {
      ...balanced,
      lines: balanced.lines.map((entry, index) =>
        index === 2 ? { ...entry, amount: entry.amount - 1 } : entry,
      ),
    };
    const trx = await db.startTransaction().execute();
    let error: unknown;
    let insertedInTrx: number;
    try {
      // Act
      error = await postLedgerTransaction(trx, unbalanced, log).catch((err: unknown) => err);
      // Trigger DB chỉ kiểm lúc COMMIT; chặn ở app nghĩa là chưa có dòng nào trong transaction
      insertedInTrx = await countLedgerTransactions(trx);
    } finally {
      await trx.rollback().execute();
    }

    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'LEDGER_UNBALANCED', httpStatus: 500 });
    expect(insertedInTrx).toBe(0);
  });
});
