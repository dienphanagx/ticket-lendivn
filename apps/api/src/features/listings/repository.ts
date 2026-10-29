import { sql } from 'kysely';

import type { Database } from '../../db/client.js';
import { EventStatus, OrderStatus } from '../../db/enums.js';

/**
 * Tin bán kèm số vé còn lại = `quantity_total` − vé đơn `PAID` − vé đơn `PENDING_PAYMENT` còn hạn
 * (`hold_expires_at > now()`), nên đơn quá hạn mà job chưa chạy không còn bị tính là giữ chỗ.
 * Sự kiện `COMPLETED` → 0 (spec api § B, § C Tạo Đơn Hàng). Đọc không khoá, không cache.
 */
export function listingsWithAvailability(db: Database) {
  return db
    .selectFrom('listings as l')
    .innerJoin('events as e', 'e.id', 'l.event_id')
    .leftJoin('orders as o', (join) =>
      join
        .onRef('o.listing_id', '=', 'l.id')
        .on((eb) =>
          eb.or([
            eb('o.status', '=', OrderStatus.PAID),
            eb.and([
              eb('o.status', '=', OrderStatus.PENDING_PAYMENT),
              eb('o.hold_expires_at', '>', sql<Date>`now()`),
            ]),
          ]),
        ),
    )
    .groupBy(['l.id', 'e.status'])
    .select([
      'l.id',
      'l.event_id as eventId',
      'l.seller_id as sellerId',
      'l.unit_price as unitPrice',
      'l.quantity_total as quantityTotal',
      'e.status as eventStatus',
      sql<number>`CASE WHEN e.status = ${EventStatus.COMPLETED} THEN 0
        ELSE GREATEST(l.quantity_total - COALESCE(SUM(o.quantity), 0), 0) END`.as(
        'availableQuantity',
      ),
    ]);
}

export type ListingAvailabilityRow = Awaited<
  ReturnType<ReturnType<typeof listingsWithAvailability>['executeTakeFirstOrThrow']>
>;

export async function findListingWithAvailability(
  db: Database,
  listingId: string,
): Promise<ListingAvailabilityRow | undefined> {
  return listingsWithAvailability(db).where('l.id', '=', listingId).executeTakeFirst();
}
