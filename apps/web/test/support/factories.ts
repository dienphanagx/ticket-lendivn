import type { BalanceEntry } from '@/features/account/types';
import type { EventCompletion } from '@/features/admin/types';
import type { EventListing, EventSummary } from '@/features/events/types';
import type { LedgerAccount } from '@/features/ledger/types';
import type { Quote } from '@/features/listings/types';
import type { OrderDetail, OrderSummary } from '@/features/orders/types';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
/** Id có chữ cái (test so không phân biệt hoa thường) */
export const USER_HEX = 'abcdef12-3456-4abc-8def-abcdefabcdef';

export const buildListing = (overrides: Partial<EventListing> = {}): EventListing => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  seller: { id: USER_B, displayName: 'Bình' },
  unitPrice: 1_250_000,
  quantityTotal: 10,
  availableQuantity: 5,
  isOwnListing: false,
  ...overrides,
});

export const buildEventSummary = (overrides: Partial<EventSummary> = {}): EventSummary => ({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  slug: 'dem-nhac-mua-thu',
  name: 'Đêm nhạc mùa thu',
  venue: 'Nhà hát Lớn',
  startsAt: '2026-11-20T12:30:00.000Z',
  status: 'ON_SALE',
  completedAt: null,
  listingCount: 2,
  availableQuantity: 8,
  minUnitPrice: 900_000,
  escrowTotal: 0,
  pendingOrderCount: 0,
  sellerCount: 0,
  ...overrides,
});

export const buildQuote = (overrides: Partial<Quote> = {}): Quote => ({
  listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  unitPrice: 1_250_000,
  quantity: 1,
  subtotal: 1_250_000,
  buyerFee: 125_000,
  buyerTotal: 1_375_000,
  availableQuantity: 5,
  ...overrides,
});

export const ORDER_ID = '261029ABCDE12345';
export const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

export const buildOrderSummary = (overrides: Partial<OrderSummary> = {}): OrderSummary => ({
  id: ORDER_ID,
  status: 'PENDING_PAYMENT',
  event: { id: EVENT_ID, name: 'Đêm nhạc mùa thu' },
  seller: { id: USER_B, displayName: 'Bình' },
  buyer: { id: USER_A, displayName: 'An' },
  quantity: 2,
  buyerTotal: 2_750_000,
  createdAt: '2026-10-29T03:00:00.000Z',
  holdExpiresAt: '2026-10-29T03:15:00.000Z',
  paidAt: null,
  ...overrides,
});

export const buildOrderDetail = (overrides: Partial<OrderDetail> = {}): OrderDetail => ({
  ...buildOrderSummary(),
  listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  unitPrice: 1_250_000,
  subtotal: 2_500_000,
  buyerFee: 250_000,
  refundAmount: null,
  retryAfterSeconds: 3,
  ...overrides,
});

export const buildCompletion = (overrides: Partial<EventCompletion> = {}): EventCompletion => ({
  id: EVENT_ID,
  status: 'COMPLETED',
  completedAt: '2026-10-29T05:00:00.000Z',
  expiredOrderCount: 1,
  releasedTotal: 2_625_000,
  sellerReleases: [{ seller: { id: USER_B, displayName: 'Bình' }, amount: 2_375_000 }],
  platformFeeAmount: 250_000,
  ledgerTransactionId: '99999999-9999-4999-8999-999999999999',
  ...overrides,
});

export const buildBalanceEntry = (overrides: Partial<BalanceEntry> = {}): BalanceEntry => ({
  id: 'b0000000-0000-4000-8000-000000000001',
  createdAt: '2026-10-29T03:05:00.000Z',
  transactionId: 'c0000000-0000-4000-8000-000000000001',
  transactionType: 'PAYMENT_CAPTURED',
  description: `Bán 2 vé · Đêm nhạc mùa thu · Đơn ${ORDER_ID}`,
  orderId: ORDER_ID,
  eventId: EVENT_ID,
  accountId: 'd0000000-0000-4000-8000-000000000001',
  accountType: 'ESCROW_SELLER',
  amount: 2_375_000,
  balanceType: 'PENDING',
  ...overrides,
});

export const buildLedgerAccount = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: 'd0000000-0000-4000-8000-000000000001',
  type: 'ESCROW_SELLER',
  user: { id: USER_B, displayName: 'Bình' },
  event: { id: EVENT_ID, name: 'Đêm nhạc mùa thu' },
  totalDebit: 0,
  totalCredit: 2_375_000,
  balance: 2_375_000,
  ...overrides,
});

/** Response JSON giống api / BFF trả */
export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
