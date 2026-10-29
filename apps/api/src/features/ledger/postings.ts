import { LedgerAccountType, LedgerSide, LedgerTxnType } from '../../db/enums.js';
import type { LedgerAccountKey } from './repository.js';
import type { LedgerLine, LedgerPosting } from './service.js';

// Bút toán theo sự kiện nghiệp vụ thanh toán (spec api § E Ghi Bút Toán); số tiền lấy từ snapshot đơn.

const PAYMENT_KEY_PREFIX = 'PAYMENT:';
/** Khớp CHECK `ledger_transactions_release_key_ck` (`idempotency_key LIKE 'EVENT_RELEASE:%'`). */
const EVENT_RELEASE_KEY_PREFIX = 'EVENT_RELEASE:';
const DESCRIPTION_MAX_LENGTH = 255;
const DESCRIPTION_SEPARATOR = ' · ';

const GATEWAY_CASH: LedgerAccountKey = {
  type: LedgerAccountType.GATEWAY_CASH,
  ownerUserId: null,
  eventId: null,
};
const PLATFORM_FEE_REVENUE: LedgerAccountKey = {
  type: LedgerAccountType.PLATFORM_FEE_REVENUE,
  ownerUserId: null,
  eventId: null,
};

/** 1 giao dịch cổng → tối đa 1 giao dịch sổ cái, dùng chung cho `PAYMENT_CAPTURED` và `PAYMENT_REFUND_REQUIRED`. */
export const paymentIdempotencyKey = (gatewayTxnNo: string): string =>
  `${PAYMENT_KEY_PREFIX}${gatewayTxnNo}`;

/** Cắt tên sự kiện theo code point để cả mô tả `head + tên + tail` vừa varchar(255). */
function withEventName(head: string, eventName: string, tail = ''): string {
  const room = DESCRIPTION_MAX_LENGTH - [...head].length - [...tail].length;
  return head + [...eventName].slice(0, Math.max(room, 0)).join('') + tail;
}

const describeSale = (quantity: number, eventName: string, orderId: string): string =>
  withEventName(
    `Bán ${quantity} vé${DESCRIPTION_SEPARATOR}`,
    eventName,
    `${DESCRIPTION_SEPARATOR}Đơn ${orderId}`,
  );

/** 1 sự kiện → tối đa 1 giao dịch giải phóng ký quỹ. */
export const eventReleaseIdempotencyKey = (eventId: string): string =>
  `${EVENT_RELEASE_KEY_PREFIX}${eventId}`;

export interface CapturedPayment {
  gatewayTxnNo: string;
  orderId: string;
  eventId: string;
  eventName: string;
  sellerId: string;
  quantity: number;
  buyerTotal: number;
  sellerNet: number;
  platformFee: number;
}

/**
 * Đơn chuyển `PAID`: Nợ `GATEWAY_CASH` `buyerTotal`; Có `ESCROW_SELLER` (người bán, sự kiện)
 * `sellerNet`; Có `ESCROW_FEE` (sự kiện) `platformFee`. Dòng 0 đồng không ghi (`platformFee` = 0 khi
 * tiền vé < 10 ₫).
 */
export function paymentCapturedPosting(payment: CapturedPayment): LedgerPosting {
  const lines: LedgerLine[] = [
    { account: GATEWAY_CASH, direction: LedgerSide.DEBIT, amount: payment.buyerTotal },
    {
      account: {
        type: LedgerAccountType.ESCROW_SELLER,
        ownerUserId: payment.sellerId,
        eventId: payment.eventId,
      },
      direction: LedgerSide.CREDIT,
      amount: payment.sellerNet,
    },
    {
      account: { type: LedgerAccountType.ESCROW_FEE, ownerUserId: null, eventId: payment.eventId },
      direction: LedgerSide.CREDIT,
      amount: payment.platformFee,
    },
  ];
  return {
    type: LedgerTxnType.PAYMENT_CAPTURED,
    idempotencyKey: paymentIdempotencyKey(payment.gatewayTxnNo),
    eventId: payment.eventId,
    orderId: payment.orderId,
    description: describeSale(payment.quantity, payment.eventName, payment.orderId),
    lines: lines.filter((line) => line.amount !== 0),
  };
}

export interface RefundRequiredPayment {
  gatewayTxnNo: string;
  orderId: string;
  eventId: string;
  buyerId: string;
  /** Số tiền đã nhận (VND). */
  amount: number;
}

/**
 * Tiền đến muộn không giữ được vé, hoặc thanh toán thừa: Nợ `GATEWAY_CASH`; Có `BUYER_REFUND_PAYABLE`
 * của người mua, cùng số tiền đã nhận.
 */
export const paymentRefundRequiredPosting = (payment: RefundRequiredPayment): LedgerPosting => ({
  type: LedgerTxnType.PAYMENT_REFUND_REQUIRED,
  idempotencyKey: paymentIdempotencyKey(payment.gatewayTxnNo),
  eventId: payment.eventId,
  orderId: payment.orderId,
  description: `Khoản hoàn tiền${DESCRIPTION_SEPARATOR}Đơn ${payment.orderId}`,
  lines: [
    { account: GATEWAY_CASH, direction: LedgerSide.DEBIT, amount: payment.amount },
    {
      account: {
        type: LedgerAccountType.BUYER_REFUND_PAYABLE,
        ownerUserId: payment.buyerId,
        eventId: null,
      },
      direction: LedgerSide.CREDIT,
      amount: payment.amount,
    },
  ],
});

export interface SellerEscrowBalance {
  sellerId: string;
  /** Số dư `ESCROW_SELLER` (người bán, sự kiện) đọc từ sổ cái, > 0. */
  amount: number;
}

export interface EscrowRelease {
  eventId: string;
  eventName: string;
  sellers: readonly SellerEscrowBalance[];
  /** Số dư `ESCROW_FEE` của sự kiện đọc từ sổ cái; 0 = không có dòng phí. */
  feeAmount: number;
}

/**
 * Sự kiện kết thúc: mỗi người bán Nợ `ESCROW_SELLER` / Có `SELLER_PAYABLE` toàn bộ số dư; phí Nợ
 * `ESCROW_FEE` / Có `PLATFORM_FEE_REVENUE`. Số dư 0 không sinh dòng; không còn dòng nào → `undefined`
 * (không tạo giao dịch).
 */
export function eventReleasePosting(release: EscrowRelease): LedgerPosting | undefined {
  const lines: LedgerLine[] = release.sellers.flatMap(({ sellerId, amount }) => [
    {
      account: {
        type: LedgerAccountType.ESCROW_SELLER,
        ownerUserId: sellerId,
        eventId: release.eventId,
      },
      direction: LedgerSide.DEBIT,
      amount,
    },
    {
      account: { type: LedgerAccountType.SELLER_PAYABLE, ownerUserId: sellerId, eventId: null },
      direction: LedgerSide.CREDIT,
      amount,
    },
  ]);
  lines.push(
    {
      account: { type: LedgerAccountType.ESCROW_FEE, ownerUserId: null, eventId: release.eventId },
      direction: LedgerSide.DEBIT,
      amount: release.feeAmount,
    },
    { account: PLATFORM_FEE_REVENUE, direction: LedgerSide.CREDIT, amount: release.feeAmount },
  );
  const nonZero = lines.filter((line) => line.amount !== 0);
  if (nonZero.length === 0) {
    return undefined;
  }
  return {
    type: LedgerTxnType.EVENT_RELEASE,
    idempotencyKey: eventReleaseIdempotencyKey(release.eventId),
    eventId: release.eventId,
    orderId: null,
    description: withEventName(`Giải phóng ký quỹ${DESCRIPTION_SEPARATOR}`, release.eventName),
    lines: nonZero,
  };
}
