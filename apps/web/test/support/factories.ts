import type { EventListing, EventSummary } from '@/features/events/types';
import type { Quote } from '@/features/listings/types';

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';

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

/** Response JSON giống api / BFF trả */
export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
