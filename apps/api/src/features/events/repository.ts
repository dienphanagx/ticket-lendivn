import { sql } from 'kysely';

import type { Database } from '../../db/client.js';
import { LedgerAccountType, OrderStatus, type EventStatus } from '../../db/enums.js';
import { listingsWithAvailability } from '../listings/repository.js';

/** Tồn kho theo sự kiện: số tin, tổng vé còn lại, giá thấp nhất trong các tin còn vé. */
function stockByEvent(db: Database) {
  return db
    .selectFrom(listingsWithAvailability(db).as('la'))
    .groupBy('la.eventId')
    .select((eb) => [
      'la.eventId',
      eb.fn.count<number>('la.id').as('listingCount'),
      sql<number>`SUM(la."availableQuantity")::bigint`.as('availableQuantity'),
      sql<number | null>`MIN(la."unitPrice") FILTER (WHERE la."availableQuantity" > 0)`.as(
        'minUnitPrice',
      ),
    ]);
}

/** Ký quỹ theo sự kiện, đọc từ view số dư — công thức số dư duy nhất (specs/database.md). */
function escrowByEvent(db: Database) {
  return db
    .selectFrom('ledger_account_balances as b')
    .where('b.type', 'in', [LedgerAccountType.ESCROW_SELLER, LedgerAccountType.ESCROW_FEE])
    .groupBy('b.event_id')
    .select([
      'b.event_id as eventId',
      sql<number>`SUM(b.balance)::bigint`.as('escrowTotal'),
      sql<number>`COUNT(*) FILTER (WHERE b.type = ${LedgerAccountType.ESCROW_SELLER} AND b.balance > 0)`.as(
        'sellerCount',
      ),
    ]);
}

function pendingOrdersByEvent(db: Database) {
  return db
    .selectFrom('orders as o')
    .where('o.status', '=', OrderStatus.PENDING_PAYMENT)
    .where('o.hold_expires_at', '>', sql<Date>`now()`)
    .groupBy('o.event_id')
    .select((eb) => ['o.event_id as eventId', eb.fn.countAll<number>().as('pendingOrderCount')]);
}

const EVENT_COLUMNS = [
  'e.id',
  'e.slug',
  'e.name',
  'e.venue',
  'e.starts_at as startsAt',
  'e.status',
  'e.completed_at as completedAt',
] as const;

/** Mỗi số liệu gom theo sự kiện trong subquery riêng rồi LEFT JOIN, tránh nhân dòng và N+1. */
export async function listEventsWithStats(db: Database, status?: EventStatus) {
  let query = db
    .selectFrom('events as e')
    .leftJoin(stockByEvent(db).as('st'), 'st.eventId', 'e.id')
    .leftJoin(escrowByEvent(db).as('esc'), 'esc.eventId', 'e.id')
    .leftJoin(pendingOrdersByEvent(db).as('po'), 'po.eventId', 'e.id')
    .select([
      ...EVENT_COLUMNS,
      'st.listingCount',
      'st.availableQuantity',
      'st.minUnitPrice',
      'esc.escrowTotal',
      'esc.sellerCount',
      'po.pendingOrderCount',
    ])
    .orderBy('e.starts_at')
    .orderBy('e.id');
  if (status !== undefined) {
    query = query.where('e.status', '=', status);
  }
  return query.execute();
}

export async function findEventBySlug(db: Database, slug: string) {
  return db
    .selectFrom('events as e')
    .select([...EVENT_COLUMNS, 'e.description'])
    .where('e.slug', '=', slug)
    .executeTakeFirst();
}

/** Tin bán của sự kiện: giá tăng dần, cùng giá thì tin còn nhiều vé hơn trước (spec api § B). */
export async function listEventListings(db: Database, eventId: string) {
  return db
    .selectFrom(listingsWithAvailability(db).where('l.event_id', '=', eventId).as('la'))
    .innerJoin('users as u', 'u.id', 'la.sellerId')
    .select([
      'la.id',
      'la.sellerId',
      'u.display_name as sellerName',
      'la.unitPrice',
      'la.quantityTotal',
      'la.availableQuantity',
    ])
    .orderBy('la.unitPrice')
    .orderBy('la.availableQuantity', 'desc')
    .orderBy('la.id')
    .execute();
}
