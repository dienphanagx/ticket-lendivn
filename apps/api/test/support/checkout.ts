import { randomUUID } from 'node:crypto';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import type { Database } from '../../src/db/client.js';
import type { Order } from '../../src/db/types.js';
import { buildVnpParams, ipnUrl, signParams } from './vnpay.js';

// Luồng mua thật qua HTTP (tạo đơn → IPN có chữ ký → kết thúc sự kiện), để sổ cái do chính code app ghi.

const HTTP_CREATED = 201;

/** `POST /v1/orders` rồi đọc lại đơn đầy đủ (gồm snapshot tiền) từ DB. */
export async function placeOrder(
  app: FastifyInstance,
  db: Database,
  buyerId: string,
  listingId: string,
  quantity: number,
): Promise<Order> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers: { 'X-User-Id': buyerId, 'Idempotency-Key': randomUUID() },
    payload: { listingId, quantity },
  });
  if (res.statusCode !== HTTP_CREATED) {
    throw new Error(`order was not created: ${res.statusCode} ${res.body}`);
  }
  const { id } = res.json<{ data: { id: string } }>().data;
  return db.selectFrom('orders').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
}

/** IPN thành công đúng số tiền của đơn (mã giao dịch cổng mới); trả `RspCode`. */
export const payByIpn = async (app: FastifyInstance, order: Order): Promise<string> =>
  (await app.inject({ method: 'GET', url: ipnUrl(signParams(buildVnpParams(order))) })).json<{
    RspCode: string;
  }>().RspCode;

/** Tạo đơn + IPN thành công; throw nếu cổng không nhận `00`. */
export async function placePaidOrder(
  app: FastifyInstance,
  db: Database,
  buyerId: string,
  listingId: string,
  quantity: number,
): Promise<Order> {
  const order = await placeOrder(app, db, buyerId, listingId, quantity);
  const code = await payByIpn(app, order);
  if (code !== '00') {
    throw new Error(`IPN for ${order.id} answered ${code}`);
  }
  return order;
}

export const completeEventRequest = (
  app: FastifyInstance,
  eventId: string,
): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: `/api/v1/events/${eventId}/complete` });

export interface CompletionBody {
  data: {
    id: string;
    status: string;
    completedAt: string;
    expiredOrderCount: number;
    releasedTotal: number;
    sellerReleases: { seller: { id: string; displayName: string }; amount: number }[];
    platformFeeAmount: number;
    ledgerTransactionId: string | null;
  };
}

export interface BalanceBody {
  data: {
    pendingBalance: number;
    availableBalance: number;
    availableBreakdown: { sales: number; refunds: number };
    entries: {
      id: string;
      createdAt: string;
      transactionId: string;
      transactionType: string;
      description: string;
      orderId: string | null;
      eventId: string;
      accountId: string;
      accountType: string;
      amount: number;
      balanceType: 'PENDING' | 'AVAILABLE';
    }[];
  };
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export async function getBalance(
  app: FastifyInstance,
  userId: string,
  query = '',
): Promise<BalanceBody> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/me/balance${query}`,
    headers: { 'X-User-Id': userId },
  });
  if (res.statusCode !== 200) {
    throw new Error(`balance request failed: ${res.statusCode} ${res.body}`);
  }
  return res.json<BalanceBody>();
}
