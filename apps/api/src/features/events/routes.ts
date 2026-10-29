import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { EventStatus } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { optionalUserHeaders, resolveCurrentUser, USER_ID_HEADER } from '../users/current-user.js';
import { EVENT_ERRORS } from './errors.js';
import { findEventBySlug, listEventListings, listEventsWithStats } from './repository.js';

/** Slug sự kiện (spec api § B Xem Chi Tiết Sự Kiện), khớp CHECK của `events.slug`. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 100;

const eventStatusSchema = z.enum([EventStatus.ON_SALE, EventStatus.COMPLETED]);

const eventBase = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  venue: z.string(),
  startsAt: z.iso.datetime(),
  status: eventStatusSchema,
  completedAt: z.iso.datetime().nullable(),
});

const eventListResponse = z.object({
  data: z.array(
    eventBase.extend({
      listingCount: z.int(),
      availableQuantity: z.int(),
      minUnitPrice: z.int().nullable(),
      escrowTotal: z.int(),
      pendingOrderCount: z.int(),
      sellerCount: z.int(),
    }),
  ),
});

const eventDetailResponse = z.object({
  data: eventBase.extend({
    description: z.string(),
    listings: z.array(
      z.object({
        id: z.string(),
        seller: z.object({ id: z.string(), displayName: z.string() }),
        unitPrice: z.int(),
        quantityTotal: z.int(),
        availableQuantity: z.int(),
        isOwnListing: z.boolean(),
      }),
    ),
  }),
});

interface EventTimes {
  startsAt: Date;
  completedAt: Date | null;
}

const toIsoTimes = ({ startsAt, completedAt }: EventTimes) => ({
  startsAt: startsAt.toISOString(),
  completedAt: completedAt?.toISOString() ?? null,
});

export const eventRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get(
    '/v1/events',
    {
      schema: {
        querystring: z.object({ status: eventStatusSchema.optional() }),
        response: { 200: eventListResponse },
      },
    },
    async (request) => {
      const rows = await listEventsWithStats(db, request.query.status);
      return {
        data: rows.map((row) => {
          // Sự kiện đã kết thúc: ký quỹ đã giải phóng, không còn đơn chờ (spec api § B)
          const onSale = row.status === EventStatus.ON_SALE;
          return {
            ...row,
            ...toIsoTimes(row),
            listingCount: row.listingCount ?? 0,
            availableQuantity: row.availableQuantity ?? 0,
            minUnitPrice: row.minUnitPrice ?? null,
            escrowTotal: onSale ? (row.escrowTotal ?? 0) : 0,
            pendingOrderCount: onSale ? (row.pendingOrderCount ?? 0) : 0,
            sellerCount: onSale ? (row.sellerCount ?? 0) : 0,
          };
        }),
      };
    },
  );

  app.get(
    '/v1/events/:slug',
    {
      schema: {
        params: z.object({ slug: z.string().min(1).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN) }),
        headers: optionalUserHeaders,
        response: { 200: eventDetailResponse },
      },
    },
    async (request) => {
      const headerUserId = request.headers[USER_ID_HEADER];
      const currentUserId =
        headerUserId === undefined ? undefined : await resolveCurrentUser(db, headerUserId);
      const event = await findEventBySlug(db, request.params.slug);
      if (event === undefined) {
        throw new AppError(EVENT_ERRORS.NOT_FOUND);
      }
      const listings = await listEventListings(db, event.id);
      return {
        data: {
          ...event,
          ...toIsoTimes(event),
          listings: listings.map(({ sellerId, sellerName, ...listing }) => ({
            ...listing,
            seller: { id: sellerId, displayName: sellerName },
            isOwnListing: sellerId === currentUserId,
          })),
        },
      };
    },
  );
  done();
};
