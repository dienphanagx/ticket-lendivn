import type { Http } from '@/lib/errors';

import { eventDetailResponseSchema, eventListResponseSchema } from './types';

/** `GET /v1/events` — mọi sự kiện kèm số vé còn lại, giá thấp nhất */
export const listEvents = (http: Http) => http('/v1/events', eventListResponseSchema);

/** `GET /v1/events/:slug` — chi tiết + tin bán; `isOwnListing` theo `X-User-Id` */
export const getEventBySlug = (http: Http, slug: string) =>
  http(`/v1/events/${encodeURIComponent(slug)}`, eventDetailResponseSchema);
