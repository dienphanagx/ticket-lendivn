import { randomInt, randomUUID } from 'node:crypto';

import { sql, type InsertObject } from 'kysely';

import type { Database } from '../../src/db/client.js';
import { LedgerAccountType, LedgerSide, type LedgerTxnType } from '../../src/db/enums.js';
import type {
  DB,
  Event,
  LedgerAccount,
  LedgerTransaction,
  Listing,
  NewEvent,
  NewListing,
  NewUser,
  Order,
  User,
} from '../../src/db/types.js';

// Factory + insert helper cho test DB. Builder không side effect; `insert*` mới ghi DB.

const ORDER_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ORDER_ID_LENGTH = 16;
const BUYER_FEE_PERCENT = 10n;
const SELLER_FEE_PERCENT = 5n;
const PERCENT_BASE = 100n;

const uniqueSuffix = (): string => randomUUID().slice(0, 8);

export const buildUser = (overrides: Partial<NewUser> = {}): NewUser => ({
  display_name: `User ${uniqueSuffix()}`,
  ...overrides,
});

export const buildEvent = (overrides: Partial<NewEvent> = {}): NewEvent => ({
  slug: `event-${uniqueSuffix()}`,
  name: 'Test event',
  venue: 'Test venue',
  starts_at: '2027-01-01T12:00:00Z',
  ...overrides,
});

export const buildListing = (
  refs: Pick<NewListing, 'event_id' | 'seller_id'>,
  overrides: Partial<NewListing> = {},
): NewListing => ({ unit_price: 500_000, quantity_total: 10, ...refs, ...overrides });

export const buildOrderId = (): string =>
  Array.from(
    { length: ORDER_ID_LENGTH },
    () => ORDER_ID_ALPHABET[randomInt(ORDER_ID_ALPHABET.length)],
  ).join('');

export interface OrderAmounts {
  subtotal: number;
  buyer_fee: number;
  buyer_total: number;
  seller_fee: number;
  seller_net: number;
  platform_fee: number;
}

/** Công thức phí của spec (chia nguyên = làm tròn xuống), tính bằng bigint để không lệch số thực. */
export function computeOrderAmounts(unitPrice: number, quantity: number): OrderAmounts {
  const subtotal = BigInt(unitPrice) * BigInt(quantity);
  const buyerFee = (subtotal * BUYER_FEE_PERCENT) / PERCENT_BASE;
  const buyerTotal = subtotal + buyerFee;
  const sellerFee = (subtotal * SELLER_FEE_PERCENT) / PERCENT_BASE;
  const sellerNet = subtotal - sellerFee;
  return {
    subtotal: Number(subtotal),
    buyer_fee: Number(buyerFee),
    buyer_total: Number(buyerTotal),
    seller_fee: Number(sellerFee),
    seller_net: Number(sellerNet),
    platform_fee: Number(buyerTotal - sellerNet),
  };
}

/** Insert object của đơn: cho phép biểu thức SQL (vd `now()`) ở cột thời gian. */
export type OrderInsert = InsertObject<DB, 'orders'>;

export const buildOrder = (
  listing: Listing,
  buyerId: string,
  quantity: number,
  overrides: Partial<OrderInsert> = {},
): OrderInsert => ({
  id: buildOrderId(),
  buyer_id: buyerId,
  seller_id: listing.seller_id,
  listing_id: listing.id,
  event_id: listing.event_id,
  quantity,
  unit_price: listing.unit_price,
  ...computeOrderAmounts(listing.unit_price, quantity),
  idempotency_key: randomUUID(),
  // Cùng `now()` với `created_at` mặc định trong cùng câu lệnh → thoả CHECK hold window
  hold_expires_at: sql<Date>`now() + interval '15 minutes'`,
  ...overrides,
});

export async function insertUser(db: Database, overrides: Partial<NewUser> = {}): Promise<User> {
  return db
    .insertInto('users')
    .values(buildUser(overrides))
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertEvent(db: Database, overrides: Partial<NewEvent> = {}): Promise<Event> {
  return db
    .insertInto('events')
    .values(buildEvent(overrides))
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertListing(
  db: Database,
  refs: Pick<NewListing, 'event_id' | 'seller_id'>,
  overrides: Partial<NewListing> = {},
): Promise<Listing> {
  return db
    .insertInto('listings')
    .values(buildListing(refs, overrides))
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function insertOrder(db: Database, order: OrderInsert): Promise<Order> {
  return db.insertInto('orders').values(order).returningAll().executeTakeFirstOrThrow();
}

export interface LedgerAccountKey {
  type: LedgerAccountType;
  ownerUserId?: string | null;
  eventId?: string | null;
}

/** Upsert theo `ledger_accounts_key_uq` như code app sẽ làm, rồi đọc lại id. */
export async function upsertLedgerAccount(
  db: Database,
  { type, ownerUserId = null, eventId = null }: LedgerAccountKey,
): Promise<LedgerAccount> {
  const normalSide = type === LedgerAccountType.GATEWAY_CASH ? LedgerSide.DEBIT : LedgerSide.CREDIT;
  await db
    .insertInto('ledger_accounts')
    .values({ type, owner_user_id: ownerUserId, event_id: eventId, normal_side: normalSide })
    .onConflict((oc) => oc.constraint('ledger_accounts_key_uq').doNothing())
    .execute();
  return db
    .selectFrom('ledger_accounts')
    .selectAll()
    .where('type', '=', type)
    .where('owner_user_id', ownerUserId === null ? 'is' : '=', ownerUserId)
    .where('event_id', eventId === null ? 'is' : '=', eventId)
    .executeTakeFirstOrThrow();
}

export interface EntryInput {
  accountId: string;
  direction: LedgerSide;
  amount: number;
}

export interface LedgerTxnInput {
  type: LedgerTxnType;
  eventId: string;
  orderId: string | null;
  idempotencyKey?: string;
  description?: string;
}

/** Chèn giao dịch + các dòng trong `db` (Kysely hoặc transaction) do caller truyền. */
export async function insertLedgerTxn(
  db: Database,
  txn: LedgerTxnInput,
  entries: readonly EntryInput[],
): Promise<LedgerTransaction> {
  const row = await db
    .insertInto('ledger_transactions')
    .values({
      type: txn.type,
      event_id: txn.eventId,
      order_id: txn.orderId,
      idempotency_key: txn.idempotencyKey ?? `PAYMENT:${uniqueSuffix()}`,
      description: txn.description ?? 'Test transaction',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (entries.length > 0) {
    await insertEntries(db, row.id, entries);
  }
  return row;
}

export async function insertEntries(
  db: Database,
  transactionId: string,
  entries: readonly EntryInput[],
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
