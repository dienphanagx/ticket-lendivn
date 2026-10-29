import type { Database } from '../../db/client.js';
import { EventStatus, OrderStatus } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { isUuid } from '../../lib/ids.js';
import { buildPageMeta, toOffset, type PageParams } from '../../lib/pagination.js';
import { EVENT_ERRORS } from '../events/errors.js';
import { calculateFees } from '../listings/fees.js';
import { LISTING_ERRORS } from '../listings/quote.js';
import { resolveCurrentUser } from '../users/current-user.js';
import { ORDER_ERRORS } from './errors.js';
import { generateOrderId } from './order-id.js';
import {
  countOrders,
  EXPIRE_BATCH_SIZE,
  expireOverdueBatch,
  expireOverdueOrders,
  findListingEventId,
  findOrderByIdempotencyKey,
  findOrderView,
  insertOrder,
  isIdempotencyKeyConflict,
  listOrderViews,
  lockEventForShare,
  lockListingForUpdate,
  sumReservedQuantity,
  type OrderSnapshot,
} from './repository.js';

export interface CreateOrderInput {
  /** Id chuẩn của DB (đã qua `resolveCurrentUser`). */
  buyerId: string;
  listingId: string;
  quantity: number;
  idempotencyKey: string;
}

export interface CreateOrderResult {
  order: OrderSnapshot;
  /** false = khoá đã dùng với cùng nội dung, trả lại đơn cũ (200). */
  created: boolean;
}

/** Khoá đã dùng: cùng nội dung → đơn cũ ở trạng thái hiện tại; khác nội dung → 409. */
async function replayOrder(
  db: Database,
  order: OrderSnapshot,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  // `uuid` của PostgreSQL không phân biệt hoa thường, id lưu ở dạng chữ thường
  const sameRequest =
    order.listingId === input.listingId.toLowerCase() && order.quantity === input.quantity;
  if (!sameRequest) {
    throw new AppError(ORDER_ERRORS.IDEMPOTENCY_KEY_REUSED);
  }
  const expired = await expireOverdueOrders(db, { orderId: order.id });
  return { order: expired > 0 ? { ...order, status: OrderStatus.EXPIRED } : order, created: false };
}

/** Thứ tự khoá cố định `events` FOR SHARE → `listings` FOR UPDATE (specs/database.md § Chống bán trùng). */
async function reserveTickets(trx: Database, input: CreateOrderInput): Promise<CreateOrderResult> {
  const { buyerId, listingId, quantity, idempotencyKey } = input;
  const existing = await findOrderByIdempotencyKey(trx, buyerId, idempotencyKey);
  if (existing !== undefined) {
    return replayOrder(trx, existing, input);
  }
  const eventId = isUuid(listingId) ? await findListingEventId(trx, listingId) : undefined;
  if (eventId === undefined) {
    throw new AppError(LISTING_ERRORS.NOT_FOUND);
  }
  const event = await lockEventForShare(trx, eventId);
  if (event?.status !== EventStatus.ON_SALE) {
    throw new AppError(EVENT_ERRORS.NOT_ON_SALE);
  }
  const listing = await lockListingForUpdate(trx, listingId);
  if (listing === undefined) {
    throw new AppError(LISTING_ERRORS.NOT_FOUND);
  }
  if (listing.sellerId === buyerId) {
    throw new AppError(LISTING_ERRORS.CANNOT_BUY_OWN);
  }
  // Request cùng khoá + cùng tin bán có thể vừa commit trong lúc chờ khoá tin bán
  const committed = await findOrderByIdempotencyKey(trx, buyerId, idempotencyKey);
  if (committed !== undefined) {
    return replayOrder(trx, committed, input);
  }
  const reserved = await sumReservedQuantity(trx, listing.id);
  const available = Math.max(listing.quantityTotal - reserved, 0);
  if (quantity > available) {
    throw new AppError(LISTING_ERRORS.INSUFFICIENT_QUANTITY, { available });
  }
  const fees = calculateFees(listing.unitPrice, quantity);
  const order = await insertOrder(trx, {
    id: generateOrderId(),
    buyer_id: buyerId,
    seller_id: listing.sellerId,
    listing_id: listing.id,
    event_id: eventId,
    quantity,
    unit_price: listing.unitPrice,
    subtotal: fees.subtotal,
    buyer_fee: fees.buyerFee,
    buyer_total: fees.buyerTotal,
    seller_fee: fees.sellerFee,
    seller_net: fees.sellerNet,
    platform_fee: fees.platformFee,
    idempotency_key: idempotencyKey,
  });
  return { order, created: true };
}

/** Tạo đơn `PENDING_PAYMENT` giữ chỗ 15 phút (spec api § C Tạo Đơn Hàng), nguyên tử. */
export async function createOrder(
  db: Database,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  try {
    return await db
      .transaction()
      .setIsolationLevel('read committed')
      .execute((trx) => reserveTickets(trx, input));
  } catch (err) {
    if (!isIdempotencyKeyConflict(err)) {
      throw err;
    }
    // Request đồng thời cùng khoá khác tin bán đã commit trước → xử lý như khoá đã dùng
    const existing = await findOrderByIdempotencyKey(db, input.buyerId, input.idempotencyKey);
    if (existing === undefined) {
      throw err;
    }
    return replayOrder(db, existing, input);
  }
}

/** Chuyển đơn chờ quá hạn sang `EXPIRED` theo lô tới khi hết (spec api § C Hết Hạn Đơn Hàng). */
export async function expireOrders(db: Database): Promise<number> {
  let total = 0;
  let batch: number;
  do {
    batch = await expireOverdueBatch(db);
    total += batch;
  } while (batch === EXPIRE_BATCH_SIZE);
  return total;
}

/** Tra cứu cổng cho đơn chờ đã có URL; `true` = đã xử lý kết quả cuối → đọc lại đơn. */
export type SyncPendingPayment = (order: {
  orderId: string;
  vnpCreateDate: string;
}) => Promise<boolean>;

async function readOrder(db: Database, orderId: string) {
  const order = await findOrderView(db, orderId);
  if (order === undefined) {
    throw new AppError(ORDER_ERRORS.NOT_FOUND);
  }
  return order;
}

/**
 * Hết hạn tại chỗ rồi đọc; đơn `PENDING_PAYMENT` (đã hết hạn tại chỗ nên còn hạn) có URL thanh toán
 * → tra cứu cổng 1 lần, ngoài transaction DB, rồi đọc lại nếu cổng có kết quả cuối.
 */
export async function getOrder(db: Database, orderId: string, syncPayment?: SyncPendingPayment) {
  await expireOverdueOrders(db, { orderId });
  const order = await readOrder(db, orderId);
  if (
    syncPayment === undefined ||
    order.status !== OrderStatus.PENDING_PAYMENT ||
    order.vnpCreateDate === null
  ) {
    return order;
  }
  const settled = await syncPayment({ orderId: order.id, vnpCreateDate: order.vnpCreateDate });
  return settled ? readOrder(db, orderId) : order;
}

export interface ListOrdersInput extends PageParams {
  buyerId?: string;
  status?: OrderStatus;
}

/** Hết hạn tại chỗ trước khi lọc, nên lọc `PENDING_PAYMENT` không trả đơn đã quá hạn. */
export async function listOrders(db: Database, { buyerId, status, ...page }: ListOrdersInput) {
  const storedBuyerId = buyerId === undefined ? undefined : await resolveCurrentUser(db, buyerId);
  await expireOverdueOrders(db, { buyerId: storedBuyerId });
  const filter = { buyerId: storedBuyerId, status };
  const [total, orders] = await Promise.all([
    countOrders(db, filter),
    listOrderViews(db, filter, { offset: toOffset(page), limit: page.limit }),
  ]);
  return { orders, meta: buildPageMeta(total, page) };
}
