import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LedgerAccountType, LedgerSide, LedgerTxnType } from '../../src/db/enums.js';
import type { Event, Listing, User } from '../../src/db/types.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  completeEventRequest,
  getBalance,
  payByIpn,
  placePaidOrder,
  type BalanceBody,
} from '../support/checkout.js';
import {
  insertEvent,
  insertLedgerTxn,
  insertListing,
  insertUser,
  upsertLedgerAccount,
} from '../support/fixtures.js';
import { createTestDb, resetDatabase } from '../support/test-db.js';
import { TEST_HASH_SECRET } from '../support/vnpay.js';

const db = createTestDb();

let app: FastifyInstance;
let seller: User;
let buyer: User;
let event: Event;
let listing: Listing;

beforeEach(async () => {
  await resetDatabase(db);
  app = await buildTestApp({ db }, { VNPAY_HASH_SECRET: TEST_HASH_SECRET });
  seller = await insertUser(db, { display_name: 'Seller' });
  buyer = await insertUser(db, { display_name: 'Buyer' });
  event = await insertEvent(db, { name: 'Rock Night' });
  listing = await insertListing(
    db,
    { event_id: event.id, seller_id: seller.id },
    { unit_price: 500_000, quantity_total: 10 },
  );
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await db.destroy();
});

/** Cộng các dòng lịch sử của 1 loại số dư (để đối chiếu với số dư api trả). */
const sumEntries = (body: BalanceBody, balanceType: 'PENDING' | 'AVAILABLE'): number =>
  body.data.entries
    .filter((entry) => entry.balanceType === balanceType)
    .reduce((total, entry) => total + entry.amount, 0);

/** Thanh toán thừa: đơn đã PAID nhận thêm 1 giao dịch thành công khác → khoản phải hoàn. */
async function payTwice(quantity: number) {
  const order = await placePaidOrder(app, db, buyer.id, listing.id, quantity);
  expect(await payByIpn(app, order)).toBe('00');
  return order;
}

describe('GET /api/v1/me/balance', () => {
  it('should return zero balances and no entries for a user without ledger entries', async () => {
    // Act
    const body = await getBalance(app, buyer.id);

    // Assert
    expect(body).toEqual({
      data: {
        pendingBalance: 0,
        availableBalance: 0,
        availableBreakdown: { sales: 0, refunds: 0 },
        entries: [],
      },
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it('should show pending escrow, then available after completion, with signed entries newest first', async () => {
    // Arrange
    const order = await placePaidOrder(app, db, buyer.id, listing.id, 2);
    const pending = await getBalance(app, seller.id);
    await completeEventRequest(app, event.id);

    // Act
    const body = await getBalance(app, seller.id);

    // Assert
    expect(pending.data).toMatchObject({ pendingBalance: order.seller_net, availableBalance: 0 });
    expect(body.data).toMatchObject({
      pendingBalance: 0,
      availableBalance: order.seller_net,
      availableBreakdown: { sales: order.seller_net, refunds: 0 },
    });
    expect(body.data.entries.map((entry) => entry.transactionType)).toEqual([
      LedgerTxnType.EVENT_RELEASE,
      LedgerTxnType.EVENT_RELEASE,
      LedgerTxnType.PAYMENT_CAPTURED,
    ]);
    expect(body.data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountType: LedgerAccountType.ESCROW_SELLER,
          transactionType: LedgerTxnType.PAYMENT_CAPTURED,
          orderId: order.id,
          eventId: event.id,
          description: `Bán 2 vé · Rock Night · Đơn ${order.id}`,
          amount: order.seller_net,
          balanceType: 'PENDING',
        }),
        expect.objectContaining({
          accountType: LedgerAccountType.ESCROW_SELLER,
          transactionType: LedgerTxnType.EVENT_RELEASE,
          orderId: null,
          amount: -order.seller_net,
          balanceType: 'PENDING',
        }),
        expect.objectContaining({
          accountType: LedgerAccountType.SELLER_PAYABLE,
          description: 'Giải phóng ký quỹ · Rock Night',
          amount: order.seller_net,
          balanceType: 'AVAILABLE',
        }),
      ]),
    );
    expect(sumEntries(body, 'PENDING')).toBe(body.data.pendingBalance);
    expect(sumEntries(body, 'AVAILABLE')).toBe(body.data.availableBalance);
  });

  it('should show a refund payable in the buyer available balance', async () => {
    // Arrange
    const order = await payTwice(1);

    // Act
    const body = await getBalance(app, buyer.id);

    // Assert
    expect(body.data).toMatchObject({
      pendingBalance: 0,
      availableBalance: order.buyer_total,
      availableBreakdown: { sales: 0, refunds: order.buyer_total },
    });
    expect(body.data.entries).toEqual([
      expect.objectContaining({
        accountType: LedgerAccountType.BUYER_REFUND_PAYABLE,
        transactionType: LedgerTxnType.PAYMENT_REFUND_REQUIRED,
        description: `Khoản hoàn tiền · Đơn ${order.id}`,
        amount: order.buyer_total,
        balanceType: 'AVAILABLE',
      }),
    ]);
  });

  it('should combine both sources for a user who sells and buys', async () => {
    // Arrange: người bán mua tin của người khác và trả 2 lần → có cả tiền bán vé lẫn khoản hoàn
    const otherSeller = await insertUser(db);
    const otherListing = await insertListing(db, { event_id: event.id, seller_id: otherSeller.id });
    const sale = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const purchase = await placePaidOrder(app, db, seller.id, otherListing.id, 1);
    expect(await payByIpn(app, purchase)).toBe('00');
    await completeEventRequest(app, event.id);

    // Act
    const body = await getBalance(app, seller.id);

    // Assert
    expect(body.data).toMatchObject({
      pendingBalance: 0,
      availableBalance: sale.seller_net + purchase.buyer_total,
      availableBreakdown: { sales: sale.seller_net, refunds: purchase.buyer_total },
    });
    expect(sumEntries(body, 'AVAILABLE')).toBe(body.data.availableBalance);
  });

  it('should paginate entries with meta while keeping balances over every entry', async () => {
    // Arrange: 3 dòng (capture + 2 dòng giải phóng)
    const order = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    await completeEventRequest(app, event.id);

    // Act
    const second = await getBalance(app, seller.id, '?page=2&limit=1');
    const beyond = await getBalance(app, seller.id, '?page=9&limit=1');

    // Assert
    expect(second.meta).toEqual({ total: 3, page: 2, limit: 1, totalPages: 3 });
    expect(second.data.entries).toHaveLength(1);
    expect(second.data.availableBalance).toBe(order.seller_net);
    expect(beyond.data.entries).toEqual([]);
  });

  it('should return 400 VALIDATION_FAILED without X-User-Id', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/me/balance' });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json<ErrorBody>().details ?? {})).toEqual(['X-User-Id']);
  });

  it('should return 400 VALIDATION_FAILED for a limit above 100', async () => {
    // Act
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/balance?limit=101',
      headers: { 'X-User-Id': buyer.id },
    });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().details).toHaveProperty('limit');
  });

  it('should return 404 USER_NOT_FOUND for an unknown user', async () => {
    // Act
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/me/balance',
      headers: { 'X-User-Id': randomUUID() },
    });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('USER_NOT_FOUND');
  });
});

interface LedgerBody {
  data: {
    accounts: {
      id: string;
      type: string;
      user: { id: string; displayName: string } | null;
      event: { id: string; name: string } | null;
      totalDebit: number;
      totalCredit: number;
      balance: number;
    }[];
    totals: { debit: number; credit: number };
    transactions: {
      id: string;
      type: string;
      description: string;
      orderId: string | null;
      event: { id: string; name: string };
      createdAt: string;
      entries: { accountType: string; direction: string; amount: number }[];
    }[];
  };
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const getLedger = async (query = '') => {
  const res = await app.inject({ method: 'GET', url: `/api/v1/ledger${query}` });
  return { status: res.statusCode, body: res.json<LedgerBody>() };
};

describe('GET /api/v1/ledger', () => {
  it('should return empty lists and zero totals for an empty ledger', async () => {
    // Act
    const { status, body } = await getLedger();

    // Assert
    expect(status).toBe(200);
    expect(body).toEqual({
      data: { accounts: [], totals: { debit: 0, credit: 0 }, transactions: [] },
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it('should list every account in type order with owners and balanced ledger totals', async () => {
    // Arrange
    const order = await placePaidOrder(app, db, buyer.id, listing.id, 2);
    await payByIpn(app, order);
    await completeEventRequest(app, event.id);

    // Act
    const { body } = await getLedger();

    // Assert
    expect(
      body.data.accounts.map((account) => [account.type, account.user?.displayName ?? null]),
    ).toEqual([
      ['GATEWAY_CASH', null],
      ['ESCROW_SELLER', 'Seller'],
      ['ESCROW_FEE', null],
      ['SELLER_PAYABLE', 'Seller'],
      ['BUYER_REFUND_PAYABLE', 'Buyer'],
      ['PLATFORM_FEE_REVENUE', null],
    ]);
    expect(body.data.accounts[1]).toMatchObject({
      event: { id: event.id, name: 'Rock Night' },
      totalDebit: order.seller_net,
      totalCredit: order.seller_net,
      balance: 0,
    });
    const cash = 2 * order.buyer_total;
    expect(body.data.accounts[0]).toMatchObject({
      totalDebit: cash,
      totalCredit: 0,
      balance: cash,
    });
    expect(body.data.totals.debit).toBe(body.data.totals.credit);
    expect(body.data.totals.debit).toBe(cash + order.seller_net + order.platform_fee);
    expect(body.data.transactions.map((txn) => txn.type)).toEqual([
      LedgerTxnType.EVENT_RELEASE,
      LedgerTxnType.PAYMENT_REFUND_REQUIRED,
      LedgerTxnType.PAYMENT_CAPTURED,
    ]);
    expect(body.data.transactions[2]).toMatchObject({
      orderId: order.id,
      event: { id: event.id, name: 'Rock Night' },
      entries: [
        { accountType: 'GATEWAY_CASH', direction: 'DEBIT', amount: order.buyer_total },
        { accountType: 'ESCROW_SELLER', direction: 'CREDIT', amount: order.seller_net },
        { accountType: 'ESCROW_FEE', direction: 'CREDIT', amount: order.platform_fee },
      ],
    });
  });

  it('should filter transactions by type and event without changing accounts or totals', async () => {
    // Arrange
    const otherEvent = await insertEvent(db);
    const otherListing = await insertListing(db, { event_id: otherEvent.id, seller_id: seller.id });
    await placePaidOrder(app, db, buyer.id, listing.id, 1);
    await placePaidOrder(app, db, buyer.id, otherListing.id, 1);
    await completeEventRequest(app, event.id);
    const all = (await getLedger()).body;

    // Act
    const byType = (await getLedger('?type=EVENT_RELEASE')).body;
    const byEvent = (await getLedger(`?eventId=${otherEvent.id}`)).body;
    const both = (await getLedger(`?eventId=${otherEvent.id}&type=EVENT_RELEASE`)).body;

    // Assert
    expect(byType.data.transactions.map((txn) => txn.type)).toEqual(['EVENT_RELEASE']);
    expect(byType.meta.total).toBe(1);
    expect(byEvent.data.transactions.map((txn) => txn.event.id)).toEqual([otherEvent.id]);
    expect(both.data.transactions).toEqual([]);
    expect(byEvent.data.accounts).toEqual(all.data.accounts);
    expect(byEvent.data.totals).toEqual(all.data.totals);
  });

  it('should paginate transactions newest first', async () => {
    // Arrange
    const first = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const second = await placePaidOrder(app, db, buyer.id, listing.id, 1);

    // Act
    const { body } = await getLedger('?limit=1&page=2');

    // Assert
    expect(body.meta).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(body.data.transactions.map((txn) => txn.orderId)).toEqual([first.id]);
    expect(second.id).not.toBe(first.id);
  });

  it.each([
    ['an unknown UUID', randomUUID()],
    ['a well-formed non-UUID id', 'event_1'],
  ])('should return 404 EVENT_NOT_FOUND for eventId %s', async (_label, eventId) => {
    // Act
    const res = await app.inject({ method: 'GET', url: `/api/v1/ledger?eventId=${eventId}` });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().code).toBe('EVENT_NOT_FOUND');
  });

  it('should return 400 VALIDATION_FAILED for an unknown transaction type', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/ledger?type=ADJUSTMENT' });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().details).toHaveProperty('type');
  });
});

interface AccountBody {
  data: {
    account: LedgerBody['data']['accounts'][number];
    entries: {
      id: string;
      createdAt: string;
      transactionId: string;
      transactionType: string;
      description: string;
      orderId: string | null;
      eventId: string;
      direction: string;
      amount: number;
    }[];
  };
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const accountUrl = (accountId: string, query = '') =>
  `/api/v1/ledger/accounts/${accountId}${query}`;

const accountIdOf = async (type: LedgerAccountType, eventId: string | null = null) =>
  (await upsertLedgerAccount(db, { type, eventId })).id;

describe('GET /api/v1/ledger/accounts/:accountId', () => {
  it('should compute totals over every entry, not only the current page', async () => {
    // Arrange
    const first = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const second = await placePaidOrder(app, db, buyer.id, listing.id, 2);
    const cashId = await accountIdOf(LedgerAccountType.GATEWAY_CASH);

    // Act
    const res = await app.inject({ method: 'GET', url: accountUrl(cashId, '?limit=1') });

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<AccountBody>();
    const cash = first.buyer_total + second.buyer_total;
    expect(body.data.account).toEqual({
      id: cashId,
      type: 'GATEWAY_CASH',
      user: null,
      event: null,
      totalDebit: cash,
      totalCredit: 0,
      balance: cash,
    });
    expect(body.meta).toEqual({ total: 2, page: 1, limit: 1, totalPages: 2 });
    expect(body.data.entries).toEqual([
      expect.objectContaining({
        transactionType: LedgerTxnType.PAYMENT_CAPTURED,
        orderId: second.id,
        eventId: event.id,
        direction: 'DEBIT',
        amount: second.buyer_total,
      }),
    ]);
  });

  it('should order entries written at the same instant by transaction id, newest first', async () => {
    // Arrange: 2 giao dịch trong cùng 1 transaction DB → cùng `created_at`
    const cash = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });
    const revenue = await upsertLedgerAccount(db, {
      type: LedgerAccountType.PLATFORM_FEE_REVENUE,
    });
    const lines = [
      { accountId: cash.id, direction: LedgerSide.DEBIT, amount: 10 },
      { accountId: revenue.id, direction: LedgerSide.CREDIT, amount: 10 },
    ];
    const releaseTxn = (trx: typeof db, key: string) =>
      insertLedgerTxn(
        trx,
        {
          type: LedgerTxnType.EVENT_RELEASE,
          eventId: event.id,
          orderId: null,
          idempotencyKey: `EVENT_RELEASE:${key}`,
        },
        lines,
      );
    const txnIds = await db
      .transaction()
      .execute(async (trx) => [
        (await releaseTxn(trx, 'first')).id,
        (await releaseTxn(trx, 'second')).id,
      ]);

    // Act
    const res = await app.inject({ method: 'GET', url: accountUrl(revenue.id) });

    // Assert
    const { entries } = res.json<AccountBody>().data;
    expect(new Set(entries.map((entry) => entry.createdAt)).size).toBe(1);
    expect(entries.map((entry) => entry.transactionId)).toEqual([...txnIds].sort().reverse());
  });

  it('should return zero totals and no entries for an account without entries', async () => {
    // Arrange
    const feeId = await accountIdOf(LedgerAccountType.ESCROW_FEE, event.id);

    // Act
    const res = await app.inject({ method: 'GET', url: accountUrl(feeId) });

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<AccountBody>()).toEqual({
      data: {
        account: {
          id: feeId,
          type: 'ESCROW_FEE',
          user: null,
          event: { id: event.id, name: 'Rock Night' },
          totalDebit: 0,
          totalCredit: 0,
          balance: 0,
        },
        entries: [],
      },
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    });
  });

  it.each([
    ['an unknown UUID', randomUUID()],
    ['a well-formed non-UUID id', 'account_1'],
  ])('should return 404 LEDGER_ACCOUNT_NOT_FOUND for %s', async (_label, accountId) => {
    // Act
    const res = await app.inject({ method: 'GET', url: accountUrl(accountId) });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>()).toEqual({
      code: 'LEDGER_ACCOUNT_NOT_FOUND',
      message: 'Ledger account not found',
    });
  });

  it('should return 400 VALIDATION_FAILED for a malformed account id', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: accountUrl('bad.id') });

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().details).toHaveProperty('accountId');
  });
});
