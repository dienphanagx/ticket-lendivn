import { sql } from 'kysely';
import pg from 'pg';

import type { Database } from '../../db/client.js';
import { OrderStatus, PaymentDisposition } from '../../db/enums.js';
import type { NewOrder } from '../../db/types.js';

// Repository nhận `db` hoặc `trx` từ service, không tự mở transaction (specs/database.md § Conventions).

const UNIQUE_VIOLATION = '23505';
const IDEMPOTENCY_CONSTRAINT = 'orders_buyer_idempotency_key_uq';
/** Thời hạn giữ chỗ, không gia hạn (spec api § C Tạo Đơn Hàng). */
const HOLD_MINUTES = 15;
/** Số đơn tối đa mỗi câu UPDATE của job hết hạn (specs/database.md § Giữ chỗ 15 phút). */
export const EXPIRE_BATCH_SIZE = 500;

const ORDER_SNAPSHOT_COLUMNS = [
  'id',
  'status',
  'listing_id as listingId',
  'event_id as eventId',
  'quantity',
  'unit_price as unitPrice',
  'subtotal',
  'buyer_fee as buyerFee',
  'buyer_total as buyerTotal',
  'created_at as createdAt',
  'hold_expires_at as holdExpiresAt',
] as const;

export async function findOrderByIdempotencyKey(db: Database, buyerId: string, key: string) {
  return db
    .selectFrom('orders')
    .select(ORDER_SNAPSHOT_COLUMNS)
    .where('buyer_id', '=', buyerId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
}

export type OrderSnapshot = NonNullable<Awaited<ReturnType<typeof findOrderByIdempotencyKey>>>;

/** Vi phạm UNIQUE (buyer_id, idempotency_key): request cùng khoá đã commit trước. */
export const isIdempotencyKeyConflict = (err: unknown): boolean =>
  err instanceof pg.DatabaseError &&
  err.code === UNIQUE_VIOLATION &&
  err.constraint === IDEMPOTENCY_CONSTRAINT;

export async function findListingEventId(db: Database, listingId: string) {
  const row = await db
    .selectFrom('listings')
    .select('event_id')
    .where('id', '=', listingId)
    .executeTakeFirst();
  return row?.event_id;
}

/** Khoá cấp 1: chỉ loại trừ với kết thúc sự kiện (FOR UPDATE), tạo đơn cùng sự kiện chạy song song. */
export async function lockEventForShare(db: Database, eventId: string) {
  return db
    .selectFrom('events')
    .select('status')
    .where('id', '=', eventId)
    .forShare()
    .executeTakeFirst();
}

/** Khoá cấp 2: tuần tự hoá mọi thao tác làm giảm số vé còn lại của tin bán. */
export async function lockListingForUpdate(db: Database, listingId: string) {
  return db
    .selectFrom('listings')
    .select([
      'id',
      'seller_id as sellerId',
      'unit_price as unitPrice',
      'quantity_total as quantityTotal',
    ])
    .where('id', '=', listingId)
    .forUpdate()
    .executeTakeFirst();
}

/** Σ vé đơn `PAID` + `PENDING_PAYMENT` còn hạn giữ chỗ; đơn quá hạn mà job chưa chạy không bị tính. */
export async function sumReservedQuantity(db: Database, listingId: string): Promise<number> {
  const row = await db
    .selectFrom('orders')
    .select(sql<number>`COALESCE(SUM(quantity), 0)::bigint`.as('reserved'))
    .where('listing_id', '=', listingId)
    .where((eb) =>
      eb.or([
        eb('status', '=', OrderStatus.PAID),
        eb.and([
          eb('status', '=', OrderStatus.PENDING_PAYMENT),
          eb('hold_expires_at', '>', sql<Date>`now()`),
        ]),
      ]),
    )
    .executeTakeFirstOrThrow();
  return row.reserved;
}

export type NewOrderValues = Omit<NewOrder, 'hold_expires_at' | 'status' | 'created_at'>;

/** `hold_expires_at` và `created_at` cùng `now()` của transaction → thoả CHECK `orders_hold_window_ck`. */
export async function insertOrder(db: Database, values: NewOrderValues): Promise<OrderSnapshot> {
  return db
    .insertInto('orders')
    .values({
      ...values,
      hold_expires_at: sql<Date>`now() + make_interval(mins => ${HOLD_MINUTES})`,
    })
    .returning(ORDER_SNAPSHOT_COLUMNS)
    .executeTakeFirstOrThrow();
}

export interface OrderFilter {
  orderId?: string;
  buyerId?: string;
  status?: OrderStatus;
}

function ordersMatching(db: Database, { orderId, buyerId, status }: OrderFilter) {
  let query = db.selectFrom('orders as o');
  if (orderId !== undefined) {
    query = query.where('o.id', '=', orderId);
  }
  if (buyerId !== undefined) {
    query = query.where('o.buyer_id', '=', buyerId);
  }
  if (status !== undefined) {
    query = query.where('o.status', '=', status);
  }
  return query;
}

/** Đơn chờ đã quá hạn, sắp theo id để mọi câu khoá nhiều đơn khoá cùng thứ tự (chống deadlock). */
const overdueOrderIds = (db: Database, filter: OrderFilter) =>
  ordersMatching(db, { ...filter, status: OrderStatus.PENDING_PAYMENT })
    .select('o.id')
    .where('o.hold_expires_at', '<=', sql<Date>`now()`)
    .orderBy('o.id');

const expireOrdersIn = (db: Database, ids: ReturnType<typeof overdueOrderIds>) =>
  db
    .updateTable('orders')
    .set({
      status: OrderStatus.EXPIRED,
      expired_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', 'in', ids)
    .returning('id');

/** 1 lượt của job: bỏ qua đơn đang bị luồng ghi nhận / kết thúc sự kiện khoá (luồng đó tự quyết). */
export async function expireOverdueBatch(db: Database): Promise<number> {
  const ids = overdueOrderIds(db, {}).limit(EXPIRE_BATCH_SIZE).forUpdate().skipLocked();
  const rows = await expireOrdersIn(db, ids).execute();
  return rows.length;
}

/** Hết hạn tại chỗ khi đọc; điều kiện trong WHERE làm thao tác idempotent. */
export async function expireOverdueOrders(db: Database, filter: OrderFilter): Promise<number> {
  const rows = await expireOrdersIn(db, overdueOrderIds(db, filter).forUpdate()).execute();
  return rows.length;
}

function orderViews(db: Database, filter: OrderFilter) {
  return ordersMatching(db, filter)
    .innerJoin('events as e', 'e.id', 'o.event_id')
    .innerJoin('users as s', 's.id', 'o.seller_id')
    .innerJoin('users as b', 'b.id', 'o.buyer_id')
    .select([
      'o.id',
      'o.status',
      'o.event_id as eventId',
      'e.name as eventName',
      'o.listing_id as listingId',
      'o.seller_id as sellerId',
      's.display_name as sellerName',
      'o.buyer_id as buyerId',
      'b.display_name as buyerName',
      'o.quantity',
      'o.unit_price as unitPrice',
      'o.subtotal',
      'o.buyer_fee as buyerFee',
      'o.buyer_total as buyerTotal',
      'o.created_at as createdAt',
      'o.hold_expires_at as holdExpiresAt',
      'o.paid_at as paidAt',
      'o.payment_url as paymentUrl',
    ]);
}

/** Đơn kèm tên sự kiện / người bán / người mua hiện tại và số tiền cần hoàn (không lưu cột). */
export async function findOrderView(db: Database, orderId: string) {
  return orderViews(db, { orderId })
    .select((eb) =>
      eb
        .selectFrom('payment_transactions as p')
        .select(sql<number>`COALESCE(SUM(p.amount), 0)::bigint`.as('amount'))
        .whereRef('p.order_id', '=', 'o.id')
        .where('p.disposition', '=', PaymentDisposition.REFUND_REQUIRED)
        .as('refundAmount'),
    )
    .executeTakeFirst();
}

export async function listOrderViews(
  db: Database,
  filter: OrderFilter,
  page: { offset: number; limit: number },
) {
  return orderViews(db, filter)
    .orderBy('o.created_at', 'desc')
    .orderBy('o.id', 'desc')
    .limit(page.limit)
    .offset(page.offset)
    .execute();
}

export async function countOrders(db: Database, filter: OrderFilter): Promise<number> {
  const row = await ordersMatching(db, filter)
    .select((eb) => eb.fn.countAll<number>().as('total'))
    .executeTakeFirstOrThrow();
  return row.total;
}
