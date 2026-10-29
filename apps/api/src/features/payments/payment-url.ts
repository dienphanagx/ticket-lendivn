import type { Database } from '../../db/client.js';
import { OrderStatus } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { ORDER_ERRORS } from '../orders/errors.js';
import { expireOverdueOrders } from '../orders/repository.js';
import { PAYMENT_ERRORS } from './errors.js';
import {
  findOrderForPaymentUrl,
  savePaymentUrl,
  type PaymentUrlOrder,
  type PaymentUrlValues,
} from './repository.js';
import type { PaymentUrlGateway } from './vnpay-config.js';
import { signVnpayParams, VNP_SECURE_HASH } from './vnpay-signature.js';
import { buildOrderInfo, formatVnpayDate, toVnpayAmount } from './vnpay.js';

// Tạo URL thanh toán VNPay (spec api § D Tạo URL Thanh Toán).

export const VNPAY_VERSION = '2.1.0';
const PAY_COMMAND = 'pay';
const CURRENCY_VND = 'VND';
const ORDER_TYPE_OTHER = 'other';
const PATH_SEPARATOR = '/';
const TRAILING_SLASHES = /\/+$/;

export const PaymentLocale = { VN: 'vn', EN: 'en' } as const;
export type PaymentLocale = (typeof PaymentLocale)[keyof typeof PaymentLocale];

export interface PaymentUrlInput {
  orderId: string;
  clientIp: string;
  locale: PaymentLocale;
}

export interface PaymentUrlResult {
  paymentUrl: string;
  /** Hạn phiên ở cổng = hạn giữ chỗ của đơn. */
  expiresAt: Date;
}

/** Tham số `vnp_*` đã ký và URL tương ứng; `vnpCreateDate` là đúng chuỗi đã ký. */
export function buildPaymentUrl(
  gateway: PaymentUrlGateway,
  order: Pick<PaymentUrlOrder, 'id' | 'buyerTotal' | 'holdExpiresAt'>,
  { clientIp, locale }: Omit<PaymentUrlInput, 'orderId'>,
  now: Date,
): PaymentUrlValues {
  const vnpCreateDate = formatVnpayDate(now);
  const params = {
    vnp_Version: VNPAY_VERSION,
    vnp_Command: PAY_COMMAND,
    vnp_TmnCode: gateway.tmnCode,
    vnp_Amount: String(toVnpayAmount(order.buyerTotal)),
    vnp_CurrCode: CURRENCY_VND,
    vnp_TxnRef: order.id,
    vnp_OrderInfo: buildOrderInfo(order.id),
    vnp_OrderType: ORDER_TYPE_OTHER,
    vnp_Locale: locale,
    vnp_ReturnUrl: gateway.returnUrlBase.replace(TRAILING_SLASHES, '') + PATH_SEPARATOR + order.id,
    vnp_IpAddr: clientIp,
    vnp_CreateDate: vnpCreateDate,
    vnp_ExpireDate: formatVnpayDate(order.holdExpiresAt),
  };
  // Query = đúng chuỗi ký (sắp theo tên, encode kiểu form) + chữ ký ở cuối
  const query = new URLSearchParams(params);
  query.sort();
  query.append(VNP_SECURE_HASH, signVnpayParams(params, gateway.hashSecret));
  return { paymentUrl: `${gateway.paymentUrl}?${query.toString()}`, vnpCreateDate };
}

const notPayable = (status: OrderStatus): AppError =>
  new AppError(ORDER_ERRORS.NOT_PAYABLE, { status });

/** Hết hạn tại chỗ rồi đọc đơn; không có → 404, đã rời `PENDING_PAYMENT` → 409. */
async function loadPayableOrder(db: Database, orderId: string): Promise<PaymentUrlOrder> {
  await expireOverdueOrders(db, { orderId });
  const order = await findOrderForPaymentUrl(db, orderId);
  if (order === undefined) {
    throw new AppError(ORDER_ERRORS.NOT_FOUND);
  }
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    throw notPayable(order.status);
  }
  return order;
}

const toResult = (order: PaymentUrlOrder, paymentUrl: string): PaymentUrlResult => ({
  paymentUrl,
  expiresAt: order.holdExpiresAt,
});

/**
 * Lần đầu: dựng, ký và lưu URL (1 lần, `WHERE payment_url IS NULL`); các lần sau trả lại đúng URL đã
 * lưu, không đổi `vnp_create_date`. Không đổi trạng thái đơn, không ghi sổ cái.
 */
export async function getOrCreatePaymentUrl(
  db: Database,
  gateway: PaymentUrlGateway | undefined,
  input: PaymentUrlInput,
  now: Date = new Date(),
): Promise<PaymentUrlResult> {
  if (gateway === undefined) {
    throw new AppError(PAYMENT_ERRORS.GATEWAY_UNAVAILABLE);
  }
  const order = await loadPayableOrder(db, input.orderId);
  if (order.paymentUrl !== null) {
    return toResult(order, order.paymentUrl);
  }
  const values = buildPaymentUrl(gateway, order, input, now);
  if (await savePaymentUrl(db, order.id, values)) {
    return toResult(order, values.paymentUrl);
  }
  // Luồng khác vừa lưu URL, hoặc đơn vừa quá hạn / đổi trạng thái: đọc lại trạng thái thật
  const current = await loadPayableOrder(db, order.id);
  if (current.paymentUrl === null) {
    throw notPayable(current.status);
  }
  return toResult(current, current.paymentUrl);
}
