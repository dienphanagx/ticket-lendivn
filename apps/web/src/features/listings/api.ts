import { BFF_ROUTES } from '@/constants/routes';
import type { Http } from '@/lib/errors';

import { quoteResponseSchema } from './types';

/** Server → api: `GET /v1/listings/:listingId/quote?quantity=` (cần `X-User-Id`) */
export const getListingQuote = (
  http: Http,
  listingId: string,
  quantity: number,
  init?: RequestInit,
) =>
  http(
    `/v1/listings/${encodeURIComponent(listingId)}/quote?quantity=${quantity}`,
    quoteResponseSchema,
    init,
  );

/** Trình duyệt → BFF `/bff/listings/:listingId/quote?quantity=` (route.ts cùng tên) */
export const getListingQuoteViaBff = (
  http: Http,
  listingId: string,
  quantity: number,
  init?: RequestInit,
) => http(`${BFF_ROUTES.LISTING_QUOTE(listingId)}?quantity=${quantity}`, quoteResponseSchema, init);
