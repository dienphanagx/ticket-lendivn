import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import type {
  EventStatus,
  LedgerAccountType,
  LedgerSide,
  LedgerTxnType,
  OrderStatus,
  PaymentDisposition,
  PaymentSource,
} from './enums.js';

// Type DB viết tay, giữ khớp migration trong `./migrations` (specs/database.md § Schema).
// `bigint` (tiền) đọc ra `number` nhờ parser int8 kiểm safe integer ở `./client.ts`.

/** `timestamptz`: driver trả `Date`; ghi nhận `Date` hoặc chuỗi ISO. */
type Timestamp = ColumnType<Date, Date | string, Date | string>;
/** Cột có default `now()` / do trigger điền, không cập nhật. */
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null, Date | string | null>;
/** Cột chỉ ghi lúc tạo (trigger chặn UPDATE / DELETE hoặc khoá snapshot). */
type Immutable<T> = ColumnType<T, T, never>;
/** PK `uuid` default `uuidv7()`; seed / test được truyền UUID cố định. */
type UuidPk = ColumnType<string, string | undefined, never>;

export interface UsersTable {
  id: UuidPk;
  display_name: string;
  created_at: CreatedAt;
}

export interface EventsTable {
  id: UuidPk;
  slug: string;
  name: string;
  description: Generated<string>;
  venue: string;
  starts_at: Timestamp;
  status: Generated<EventStatus>;
  completed_at: NullableTimestamp;
  created_at: CreatedAt;
  updated_at: Generated<Date>;
}

export interface ListingsTable {
  id: UuidPk;
  event_id: string;
  seller_id: string;
  unit_price: number;
  quantity_total: number;
  created_at: CreatedAt;
  updated_at: Generated<Date>;
}

export interface OrdersTable {
  id: Immutable<string>;
  buyer_id: Immutable<string>;
  seller_id: Immutable<string>;
  listing_id: Immutable<string>;
  event_id: Immutable<string>;
  quantity: Immutable<number>;
  unit_price: Immutable<number>;
  subtotal: Immutable<number>;
  buyer_fee: Immutable<number>;
  buyer_total: Immutable<number>;
  seller_fee: Immutable<number>;
  seller_net: Immutable<number>;
  platform_fee: Immutable<number>;
  status: Generated<OrderStatus>;
  idempotency_key: Immutable<string>;
  hold_expires_at: ColumnType<Date, Date | string, never>;
  payment_url: string | null;
  vnp_create_date: string | null;
  payment_url_created_at: NullableTimestamp;
  paid_at: NullableTimestamp;
  failed_at: NullableTimestamp;
  expired_at: NullableTimestamp;
  refund_required_at: NullableTimestamp;
  created_at: CreatedAt;
  updated_at: Generated<Date>;
}

export interface PaymentTransactionsTable {
  id: UuidPk;
  order_id: Immutable<string>;
  source: Immutable<PaymentSource>;
  gateway_txn_no: Immutable<string>;
  response_code: Immutable<string>;
  transaction_status: Immutable<string>;
  is_success: Immutable<boolean>;
  amount: Immutable<number>;
  bank_code: Immutable<string | null>;
  pay_date: ColumnType<Date | null, Date | string | null, never>;
  disposition: Immutable<PaymentDisposition>;
  ledger_transaction_id: Immutable<string | null>;
  created_at: CreatedAt;
}

export interface LedgerAccountsTable {
  id: UuidPk;
  type: Immutable<LedgerAccountType>;
  owner_user_id: Immutable<string | null>;
  event_id: Immutable<string | null>;
  normal_side: Immutable<LedgerSide>;
  created_at: CreatedAt;
}

export interface LedgerTransactionsTable {
  id: UuidPk;
  type: Immutable<LedgerTxnType>;
  idempotency_key: Immutable<string>;
  event_id: Immutable<string>;
  order_id: Immutable<string | null>;
  description: Immutable<string>;
  /** `xid8`, driver trả chuỗi; trigger `ledger_txn_stamp` luôn ghi đè. */
  created_xid: ColumnType<string, never, never>;
  /** Trigger `ledger_txn_stamp` ép = `now()`. */
  created_at: ColumnType<Date, never, never>;
}

export interface LedgerEntriesTable {
  id: UuidPk;
  transaction_id: Immutable<string>;
  account_id: Immutable<string>;
  direction: Immutable<LedgerSide>;
  amount: Immutable<number>;
  /** Trigger `ledger_entry_guard` ép = `created_at` của giao dịch cha. */
  created_at: ColumnType<Date, never, never>;
}

/** View `ledger_account_balances`: công thức số dư duy nhất. */
export interface LedgerAccountBalancesView {
  account_id: ColumnType<string, never, never>;
  type: ColumnType<LedgerAccountType, never, never>;
  owner_user_id: ColumnType<string | null, never, never>;
  event_id: ColumnType<string | null, never, never>;
  normal_side: ColumnType<LedgerSide, never, never>;
  total_debit: ColumnType<number, never, never>;
  total_credit: ColumnType<number, never, never>;
  balance: ColumnType<number, never, never>;
}

export interface DB {
  users: UsersTable;
  events: EventsTable;
  listings: ListingsTable;
  orders: OrdersTable;
  payment_transactions: PaymentTransactionsTable;
  ledger_accounts: LedgerAccountsTable;
  ledger_transactions: LedgerTransactionsTable;
  ledger_entries: LedgerEntriesTable;
  ledger_account_balances: LedgerAccountBalancesView;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Event = Selectable<EventsTable>;
export type NewEvent = Insertable<EventsTable>;
export type EventUpdate = Updateable<EventsTable>;
export type Listing = Selectable<ListingsTable>;
export type NewListing = Insertable<ListingsTable>;
export type Order = Selectable<OrdersTable>;
export type NewOrder = Insertable<OrdersTable>;
export type OrderUpdate = Updateable<OrdersTable>;
export type PaymentTransaction = Selectable<PaymentTransactionsTable>;
export type NewPaymentTransaction = Insertable<PaymentTransactionsTable>;
export type LedgerAccount = Selectable<LedgerAccountsTable>;
export type NewLedgerAccount = Insertable<LedgerAccountsTable>;
export type LedgerTransaction = Selectable<LedgerTransactionsTable>;
export type NewLedgerTransaction = Insertable<LedgerTransactionsTable>;
export type LedgerEntry = Selectable<LedgerEntriesTable>;
export type NewLedgerEntry = Insertable<LedgerEntriesTable>;
export type LedgerAccountBalance = Selectable<LedgerAccountBalancesView>;
