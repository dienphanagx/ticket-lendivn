import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  EventStatus,
  LedgerAccountType,
  LedgerSide,
  LedgerTxnType,
  OrderStatus,
} from '../../src/db/enums.js';
import type { Event, Listing, User } from '../../src/db/types.js';
import { buildTestApp, type ErrorBody } from '../support/app.js';
import {
  completeEventRequest,
  getBalance,
  payByIpn,
  placeOrder,
  placePaidOrder,
  type CompletionBody,
} from '../support/checkout.js';
import {
  buildOrder,
  insertEvent,
  insertLedgerTxn,
  insertListing,
  insertOrder,
  insertUser,
  upsertLedgerAccount,
} from '../support/fixtures.js';
import {
  accountBalance,
  availableBalance,
  countLedgerTransactions,
  ledgerTotals,
  pendingBalance,
} from '../support/ledger.js';
import { buildOverdueOrder } from '../support/orders.js';
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
  seller = await insertUser(db, { display_name: 'Seller A' });
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

const statusOf = async (orderId: string) =>
  (
    await db
      .selectFrom('orders')
      .select('status')
      .where('id', '=', orderId)
      .executeTakeFirstOrThrow()
  ).status;

const eventStatusOf = async (eventId: string) =>
  (
    await db
      .selectFrom('events')
      .select('status')
      .where('id', '=', eventId)
      .executeTakeFirstOrThrow()
  ).status;

const countReleases = async (eventId: string): Promise<number> =>
  (
    await db
      .selectFrom('ledger_transactions')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('type', '=', LedgerTxnType.EVENT_RELEASE)
      .where('event_id', '=', eventId)
      .executeTakeFirstOrThrow()
  ).count;

/** Σ nợ = Σ có toàn sổ và `GATEWAY_CASH` = tổng mọi tài khoản bên có (specs/database.md). */
async function expectLedgerBalanced(expectedCash: number): Promise<void> {
  const totals = await ledgerTotals(db);
  expect(totals.debit).toBe(totals.credit);
  expect(await accountBalance(db, LedgerAccountType.GATEWAY_CASH)).toBe(expectedCash);
  const credits = await db
    .selectFrom('ledger_account_balances')
    .select('balance')
    .where('normal_side', '=', LedgerSide.CREDIT)
    .execute();
  expect(credits.reduce((sum, row) => sum + row.balance, 0)).toBe(expectedCash);
}

describe('POST /api/v1/events/:eventId/complete — escrow release', () => {
  it('should move a paid order from pending to available and the fee to platform revenue', async () => {
    // Arrange: 500.000 × 2 → buyerTotal 1.100.000, sellerNet 950.000, platformFee 150.000
    const order = await placeOrder(app, db, buyer.id, listing.id, 2);
    expect((await getBalance(app, seller.id)).data.pendingBalance).toBe(0);
    expect(await payByIpn(app, order)).toBe('00');
    const before = await getBalance(app, seller.id);
    expect(before.data).toMatchObject({ pendingBalance: 950_000, availableBalance: 0 });

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(200);
    const body = res.json<CompletionBody>();
    expect(body.data).toEqual({
      id: event.id,
      status: EventStatus.COMPLETED,
      completedAt: expect.any(String) as string,
      expiredOrderCount: 0,
      releasedTotal: 1_100_000,
      sellerReleases: [{ seller: { id: seller.id, displayName: 'Seller A' }, amount: 950_000 }],
      platformFeeAmount: 150_000,
      ledgerTransactionId: expect.any(String) as string,
    });
    const after = await getBalance(app, seller.id);
    expect(after.data).toMatchObject({
      pendingBalance: 0,
      availableBalance: 950_000,
      availableBreakdown: { sales: 950_000, refunds: 0 },
    });
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBe(0);
    expect(await accountBalance(db, LedgerAccountType.PLATFORM_FEE_REVENUE)).toBe(150_000);
    expect(await eventStatusOf(event.id)).toBe(EventStatus.COMPLETED);
    await expectLedgerBalanced(1_100_000);
  });

  it('should write one balanced EVENT_RELEASE with a debit/credit pair per seller and for the fee', async () => {
    // Arrange: người bán A 2 đơn, người bán B 1 đơn 333.333 × 1 (phần lẻ làm tròn thuộc sàn)
    const sellerB = await insertUser(db, { display_name: 'Seller B' });
    const otherBuyer = await insertUser(db);
    const oddListing = await insertListing(
      db,
      { event_id: event.id, seller_id: sellerB.id },
      { unit_price: 333_333, quantity_total: 1 },
    );
    const first = await placePaidOrder(app, db, buyer.id, listing.id, 2);
    const second = await placePaidOrder(app, db, otherBuyer.id, listing.id, 1);
    const odd = await placePaidOrder(app, db, buyer.id, oddListing.id, 1);
    expect(odd).toMatchObject({ buyer_total: 366_666, seller_net: 316_667, platform_fee: 49_999 });

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(200);
    const { data } = res.json<CompletionBody>();
    const sellerANet = first.seller_net + second.seller_net;
    const fee = first.platform_fee + second.platform_fee + odd.platform_fee;
    expect(data.sellerReleases).toEqual([
      { seller: { id: seller.id, displayName: 'Seller A' }, amount: sellerANet },
      { seller: { id: sellerB.id, displayName: 'Seller B' }, amount: 316_667 },
    ]);
    expect(data.platformFeeAmount).toBe(fee);
    expect(data.releasedTotal).toBe(first.buyer_total + second.buyer_total + odd.buyer_total);

    const lines = await db
      .selectFrom('ledger_entries as e')
      .innerJoin('ledger_accounts as a', 'a.id', 'e.account_id')
      .select(['a.type', 'a.owner_user_id as owner', 'e.direction', 'e.amount'])
      .where('e.transaction_id', '=', data.ledgerTransactionId ?? '')
      .execute();
    expect(lines).toHaveLength(6);
    expect(lines).toEqual(
      expect.arrayContaining([
        { type: 'ESCROW_SELLER', owner: seller.id, direction: 'DEBIT', amount: sellerANet },
        { type: 'SELLER_PAYABLE', owner: seller.id, direction: 'CREDIT', amount: sellerANet },
        { type: 'ESCROW_SELLER', owner: sellerB.id, direction: 'DEBIT', amount: 316_667 },
        { type: 'SELLER_PAYABLE', owner: sellerB.id, direction: 'CREDIT', amount: 316_667 },
        { type: 'ESCROW_FEE', owner: null, direction: 'DEBIT', amount: fee },
        { type: 'PLATFORM_FEE_REVENUE', owner: null, direction: 'CREDIT', amount: fee },
      ]),
    );
    const release = await db
      .selectFrom('ledger_transactions')
      .select(['idempotency_key', 'order_id', 'description'])
      .where('id', '=', data.ledgerTransactionId ?? '')
      .executeTakeFirstOrThrow();
    expect(release).toEqual({
      idempotency_key: `EVENT_RELEASE:${event.id}`,
      order_id: null,
      description: 'Giải phóng ký quỹ · Rock Night',
    });
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await pendingBalance(db, sellerB.id)).toBe(0);
    expect(await availableBalance(db, seller.id)).toBe(sellerANet);
    expect(await availableBalance(db, sellerB.id)).toBe(316_667);
    expect(await accountBalance(db, LedgerAccountType.PLATFORM_FEE_REVENUE)).toBe(fee);
    await expectLedgerBalanced(data.releasedTotal);
  });

  it('should release the ledger escrow balance, not the totals of PAID orders', async () => {
    // Arrange: 1 đơn PAID qua IPN (có bút toán) + 1 đơn PAID không có tiền trên sổ cái
    const captured = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    await insertOrder(
      db,
      buildOrder(listing, buyer.id, 3, { status: OrderStatus.PAID, paid_at: sql<Date>`now()` }),
    );

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(200);
    const { data } = res.json<CompletionBody>();
    expect(data.sellerReleases.map((release) => release.amount)).toEqual([captured.seller_net]);
    expect(data.platformFeeAmount).toBe(captured.platform_fee);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBe(0);
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, seller.id)).toBe(captured.seller_net);
    await expectLedgerBalanced(captured.buyer_total);
  });

  it('should complete without a ledger transaction when the event has no escrow', async () => {
    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<CompletionBody>().data).toMatchObject({
      status: EventStatus.COMPLETED,
      expiredOrderCount: 0,
      releasedTotal: 0,
      sellerReleases: [],
      platformFeeAmount: 0,
      ledgerTransactionId: null,
    });
    expect(await countLedgerTransactions(db)).toBe(0);
    expect(await eventStatusOf(event.id)).toBe(EventStatus.COMPLETED);
  });

  it('should leave escrow of other events untouched', async () => {
    // Arrange
    const otherEvent = await insertEvent(db);
    const otherListing = await insertListing(db, { event_id: otherEvent.id, seller_id: seller.id });
    const here = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const there = await placePaidOrder(app, db, buyer.id, otherListing.id, 2);

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(await pendingBalance(db, seller.id)).toBe(there.seller_net);
    expect(await availableBalance(db, seller.id)).toBe(here.seller_net);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, otherEvent.id)).toBe(
      there.platform_fee,
    );
    expect(await eventStatusOf(otherEvent.id)).toBe(EventStatus.ON_SALE);
  });
});

describe('POST /api/v1/events/:eventId/complete — pending orders and late payments', () => {
  it('should expire every pending order of the event, on-hold or overdue', async () => {
    // Arrange
    const onHold = await placeOrder(app, db, buyer.id, listing.id, 2);
    const overdue = await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));
    const paid = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const otherEvent = await insertEvent(db);
    const otherListing = await insertListing(db, { event_id: otherEvent.id, seller_id: seller.id });
    const elsewhere = await placeOrder(app, db, buyer.id, otherListing.id, 1);

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(200);
    expect(res.json<CompletionBody>().data.expiredOrderCount).toBe(2);
    expect(await statusOf(onHold.id)).toBe(OrderStatus.EXPIRED);
    expect(await statusOf(overdue.id)).toBe(OrderStatus.EXPIRED);
    expect(await statusOf(paid.id)).toBe(OrderStatus.PAID);
    expect(await statusOf(elsewhere.id)).toBe(OrderStatus.PENDING_PAYMENT);
    const view = await app.inject({ method: 'GET', url: `/api/v1/orders/${onHold.id}` });
    expect(view.json<{ data: { status: string } }>().data.status).toBe(OrderStatus.EXPIRED);
  });

  it('should send a payment arriving after completion to REFUND_REQUIRED, outside the released escrow', async () => {
    // Arrange
    const paid = await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const late = await placeOrder(app, db, buyer.id, listing.id, 2);
    const completion = (await completeEventRequest(app, event.id)).json<CompletionBody>().data;

    // Act
    const code = await payByIpn(app, late);

    // Assert: tiền vẫn được nhận và ghi sổ, nhưng vào khoản phải hoàn của người mua
    expect(code).toBe('00');
    expect(await statusOf(late.id)).toBe(OrderStatus.REFUND_REQUIRED);
    const balance = await getBalance(app, buyer.id);
    expect(balance.data).toMatchObject({
      pendingBalance: 0,
      availableBalance: late.buyer_total,
      availableBreakdown: { sales: 0, refunds: late.buyer_total },
    });
    expect(await pendingBalance(db, seller.id)).toBe(0);
    expect(await availableBalance(db, seller.id)).toBe(paid.seller_net);
    expect(completion.releasedTotal).toBe(paid.buyer_total);
    expect(await countReleases(event.id)).toBe(1);
    await expectLedgerBalanced(paid.buyer_total + late.buyer_total);
  });

  it('should reject new orders and quotes once the event is completed', async () => {
    // Arrange
    await completeEventRequest(app, event.id);

    // Act
    const quote = await app.inject({
      method: 'GET',
      url: `/api/v1/listings/${listing.id}/quote?quantity=1`,
      headers: { 'X-User-Id': buyer.id },
    });

    // Assert
    expect(quote.statusCode).toBe(409);
    expect(quote.json<ErrorBody>().code).toBe('EVENT_NOT_ON_SALE');
    await expect(placeOrder(app, db, buyer.id, listing.id, 1)).rejects.toThrow(/409/);
  });
});

describe('POST /api/v1/events/:eventId/complete — errors', () => {
  it('should return 409 EVENT_ALREADY_COMPLETED on a repeated call without posting again', async () => {
    // Arrange
    await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const first = (await completeEventRequest(app, event.id)).json<CompletionBody>().data;

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>()).toEqual({
      code: 'EVENT_ALREADY_COMPLETED',
      message: 'Event is already completed',
      details: { completedAt: first.completedAt },
    });
    expect(await countReleases(event.id)).toBe(1);
    expect(await countLedgerTransactions(db)).toBe(2);
  });

  it.each([
    ['an unknown UUID', '0190a0b0-0000-7000-8000-000000000000'],
    ['a well-formed non-UUID id', 'event_123'],
  ])('should return 404 EVENT_NOT_FOUND for %s', async (_label, eventId) => {
    // Act
    const res = await completeEventRequest(app, eventId);

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>()).toEqual({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
  });

  it('should return 400 VALIDATION_FAILED for a malformed event id', async () => {
    // Act
    const res = await completeEventRequest(app, 'bad.id');

    // Assert
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { eventId: expect.any(String) as string },
    });
  });

  it('should roll back completion and order expiry when writing the ledger fails', async () => {
    // Arrange: khoá `EVENT_RELEASE:<id>` đã bị chiếm (dữ liệu hỏng) → ghi giải phóng thất bại
    await placePaidOrder(app, db, buyer.id, listing.id, 1);
    const pending = await placeOrder(app, db, buyer.id, listing.id, 1);
    const cash = await upsertLedgerAccount(db, { type: LedgerAccountType.GATEWAY_CASH });
    const revenue = await upsertLedgerAccount(db, {
      type: LedgerAccountType.PLATFORM_FEE_REVENUE,
    });
    await db.transaction().execute((trx) =>
      insertLedgerTxn(
        trx,
        {
          type: LedgerTxnType.EVENT_RELEASE,
          eventId: event.id,
          orderId: null,
          idempotencyKey: `EVENT_RELEASE:${event.id}`,
        },
        [
          { accountId: cash.id, direction: LedgerSide.DEBIT, amount: 1 },
          { accountId: revenue.id, direction: LedgerSide.CREDIT, amount: 1 },
        ],
      ),
    );

    // Act
    const res = await completeEventRequest(app, event.id);

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>().code).toBe('INTERNAL_ERROR');
    expect(await eventStatusOf(event.id)).toBe(EventStatus.ON_SALE);
    expect(await statusOf(pending.id)).toBe(OrderStatus.PENDING_PAYMENT);
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/events — escrow figures from the real ledger', () => {
  it('should report escrow, pending orders and sellers before completion and zeros after', async () => {
    // Arrange
    const sellerB = await insertUser(db);
    const listingB = await insertListing(db, { event_id: event.id, seller_id: sellerB.id });
    const a = await placePaidOrder(app, db, buyer.id, listing.id, 2);
    const b = await placePaidOrder(app, db, buyer.id, listingB.id, 1);
    await placeOrder(app, db, buyer.id, listing.id, 1);
    await insertOrder(db, buildOverdueOrder(listing, buyer.id, 1));
    const eventOf = async () =>
      (await app.inject({ method: 'GET', url: '/api/v1/events' })).json<{
        data: Record<string, unknown>[];
      }>().data[0];

    // Act
    const before = await eventOf();
    await completeEventRequest(app, event.id);
    const after = await eventOf();

    // Assert: escrowTotal = đúng số tiền giải phóng (Σ buyerTotal của đơn đã ghi nhận)
    expect(before).toMatchObject({
      status: EventStatus.ON_SALE,
      escrowTotal: a.buyer_total + b.buyer_total,
      pendingOrderCount: 1,
      sellerCount: 2,
    });
    expect(after).toMatchObject({
      status: EventStatus.COMPLETED,
      completedAt: expect.any(String) as string,
      availableQuantity: 0,
      escrowTotal: 0,
      pendingOrderCount: 0,
      sellerCount: 0,
    });
    expect(await accountBalance(db, LedgerAccountType.ESCROW_FEE, event.id)).toBe(0);
  });
});
