import { sql, type UpdateObject } from 'kysely';
import pg from 'pg';

import type { Database } from '../../db/client.js';
import { OrderStatus } from '../../db/enums.js';
import type { DB, NewPaymentTransaction } from '../../db/types.js';

// Repository nhận `trx` từ service, không tự mở transaction (specs/database.md § Conventions).

const UNIQUE_VIOLATION = '23505';
/** Chốt lớp 2–3 của chống ghi nhận trùng (specs/database.md § Chống ghi nhận trùng 3 lớp). */
const PAYMENT_DEDUP_CONSTRAINTS: ReadonlySet<string> = new Set([
  'payment_transactions_success_txn_no_uq',
  'payment_transactions_ledger_transaction_id_uq',
  'ledger_transactions_idempotency_key_uq',
]);

/** Vi phạm UNIQUE của khoá chống trùng thanh toán: giao dịch cổng đã được ghi nhận ở luồng khác. */
export const isPaymentDedupViolation = (err: unknown): boolean =>
  err instanceof pg.DatabaseError &&
  err.code === UNIQUE_VIOLATION &&
  err.constraint !== undefined &&
  PAYMENT_DEDUP_CONSTRAINTS.has(err.constraint);

/** Bước (0): cột snapshot bất biến của đơn, đọc không khoá để biết khoá cấp trên nào cần giữ. */
export async function findOrderPaymentRef(db: Database, orderId: string) {
  return db
    .selectFrom('orders')
    .select(['id', 'event_id as eventId', 'listing_id as listingId', 'buyer_total as buyerTotal'])
    .where('id', '=', orderId)
    .executeTakeFirst();
}

/** Khoá cấp 1: FOR SHARE — chỉ loại trừ với kết thúc sự kiện (FOR UPDATE). */
export async function lockEventForPayment(db: Database, eventId: string) {
  return db
    .selectFrom('events')
    .select(['status', 'name'])
    .where('id', '=', eventId)
    .forShare()
    .executeTakeFirst();
}

/** Khoá cấp 3: đơn FOR UPDATE. */
export async function lockOrderForPayment(db: Database, orderId: string) {
  return db
    .selectFrom('orders')
    .select([
      'id',
      'status',
      'buyer_id as buyerId',
      'seller_id as sellerId',
      'event_id as eventId',
      'quantity',
      'buyer_total as buyerTotal',
      'seller_net as sellerNet',
      'platform_fee as platformFee',
    ])
    .where('id', '=', orderId)
    .forUpdate()
    .executeTakeFirst();
}

export type LockedPaymentOrder = NonNullable<Awaited<ReturnType<typeof lockOrderForPayment>>>;

/** Lớp 1 chống trùng: giao dịch thành công có mã giao dịch cổng này đã được ghi nhận. */
export async function hasSuccessfulPayment(db: Database, gatewayTxnNo: string): Promise<boolean> {
  const row = await db
    .selectFrom('payment_transactions')
    .select('id')
    .where('gateway_txn_no', '=', gatewayTxnNo)
    .where('is_success', '=', true)
    .executeTakeFirst();
  return row !== undefined;
}

export type PaymentOrderStatus =
  typeof OrderStatus.PAID | typeof OrderStatus.FAILED | typeof OrderStatus.REFUND_REQUIRED;

const now = sql<Date>`now()`;

/** Mốc thời điểm đi kèm từng trạng thái (CHECK `status <> X OR x_at IS NOT NULL` của `orders`). */
const STATUS_TIMESTAMPS: Record<PaymentOrderStatus, UpdateObject<DB, 'orders'>> = {
  [OrderStatus.PAID]: { paid_at: now },
  [OrderStatus.FAILED]: { failed_at: now },
  [OrderStatus.REFUND_REQUIRED]: { refund_required_at: now },
};

/** Cạnh chuyển trạng thái do trigger `order_guard_transition` kiểm lại ở DB. */
export async function updateOrderPaymentStatus(
  db: Database,
  orderId: string,
  status: PaymentOrderStatus,
): Promise<void> {
  await db
    .updateTable('orders')
    .set({ status, updated_at: now, ...STATUS_TIMESTAMPS[status] })
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
}

export async function insertPaymentTransaction(
  db: Database,
  values: NewPaymentTransaction,
): Promise<void> {
  await db.insertInto('payment_transactions').values(values).execute();
}
