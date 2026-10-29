import { BFF_ROUTES } from '@/constants/routes';
import type { Http } from '@/lib/errors';

import { eventCompletionResponseSchema } from './types';

/** Server → api: `POST /v1/events/:eventId/complete` (lần sau → 409 EVENT_ALREADY_COMPLETED) */
export const completeEvent = (http: Http, eventId: string) =>
  http(`/v1/events/${encodeURIComponent(eventId)}/complete`, eventCompletionResponseSchema, {
    method: 'POST',
  });

/** Trình duyệt → BFF (`src/app/bff/events/[eventId]/complete/route.ts`) */
export const completeEventViaBff = (http: Http, eventId: string) =>
  http(BFF_ROUTES.EVENT_COMPLETE(eventId), eventCompletionResponseSchema, { method: 'POST' });
