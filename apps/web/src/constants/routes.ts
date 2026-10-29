// Path trang theo specs/architecture.md § Routes › apps/web (không prefix locale: app 1 ngôn ngữ)
export const ROUTES = {
  HOME: '/',
  EVENT: (slug: string) => `/su-kien/${encodeURIComponent(slug)}`,
  ORDERS: '/don-hang',
  ORDER: (orderId: string) => `/don-hang/${encodeURIComponent(orderId)}`,
  ACCOUNT: '/tai-khoan',
  ADMIN: '/quan-tri',
  LEDGER: '/quan-tri/so-cai',
  LEDGER_ACCOUNT: (accountId: string) => `/quan-tri/so-cai/${encodeURIComponent(accountId)}`,
} as const;

// Route Handler BFF cho Client Component (TanStack Query)
export const BFF_ROUTES = {
  ORDER: (orderId: string) => `/bff/orders/${encodeURIComponent(orderId)}`,
  LISTING_QUOTE: (listingId: string) => `/bff/listings/${encodeURIComponent(listingId)}/quote`,
} as const;

export const HEALTH_ROUTE = '/health';
