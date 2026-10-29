// Giá trị của native enum PostgreSQL (specs/database.md § Enums); thứ tự khai báo khớp `CREATE TYPE` trong migration.

export const EventStatus = {
  ON_SALE: 'ON_SALE',
  COMPLETED: 'COMPLETED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUND_REQUIRED: 'REFUND_REQUIRED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentSource = {
  IPN: 'IPN',
  RETURN_URL: 'RETURN_URL',
  QUERYDR: 'QUERYDR',
} as const;
export type PaymentSource = (typeof PaymentSource)[keyof typeof PaymentSource];

export const PaymentDisposition = {
  CAPTURED: 'CAPTURED',
  REFUND_REQUIRED: 'REFUND_REQUIRED',
  FAILED: 'FAILED',
} as const;
export type PaymentDisposition = (typeof PaymentDisposition)[keyof typeof PaymentDisposition];

/** Thứ tự = thứ tự hiển thị của sổ cái, nên `ORDER BY type` ra đúng thứ tự. */
export const LedgerAccountType = {
  GATEWAY_CASH: 'GATEWAY_CASH',
  ESCROW_SELLER: 'ESCROW_SELLER',
  ESCROW_FEE: 'ESCROW_FEE',
  SELLER_PAYABLE: 'SELLER_PAYABLE',
  BUYER_REFUND_PAYABLE: 'BUYER_REFUND_PAYABLE',
  PLATFORM_FEE_REVENUE: 'PLATFORM_FEE_REVENUE',
} as const;
export type LedgerAccountType = (typeof LedgerAccountType)[keyof typeof LedgerAccountType];

export const LedgerSide = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;
export type LedgerSide = (typeof LedgerSide)[keyof typeof LedgerSide];

export const LedgerTxnType = {
  PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
  PAYMENT_REFUND_REQUIRED: 'PAYMENT_REFUND_REQUIRED',
  EVENT_RELEASE: 'EVENT_RELEASE',
} as const;
export type LedgerTxnType = (typeof LedgerTxnType)[keyof typeof LedgerTxnType];

/** Thông điệp `RAISE EXCEPTION` của trigger trong migration; code api so khớp `error.message`. */
export const DbGuardError = {
  LEDGER_UNBALANCED: 'LEDGER_UNBALANCED',
  LEDGER_IMMUTABLE: 'LEDGER_IMMUTABLE',
  LEDGER_TRANSACTION_CLOSED: 'LEDGER_TRANSACTION_CLOSED',
  ORDER_INVALID_TRANSITION: 'ORDER_INVALID_TRANSITION',
  ORDER_SNAPSHOT_IMMUTABLE: 'ORDER_SNAPSHOT_IMMUTABLE',
  EVENT_INVALID_TRANSITION: 'EVENT_INVALID_TRANSITION',
} as const;
export type DbGuardError = (typeof DbGuardError)[keyof typeof DbGuardError];
