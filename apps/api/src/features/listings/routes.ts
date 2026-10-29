import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { entityIdSchema } from '../../lib/ids.js';
import { requiredUserHeaders, resolveCurrentUser, USER_ID_HEADER } from '../users/current-user.js';
import { quoteListing } from './quote.js';

const MIN_QUANTITY = 1;

const quoteResponse = z.object({
  data: z.object({
    listingId: z.string(),
    unitPrice: z.int(),
    quantity: z.int(),
    subtotal: z.int(),
    buyerFee: z.int(),
    buyerTotal: z.int(),
    availableQuantity: z.int(),
  }),
});

/** `GET /v1/listings/:listingId/quote?quantity=` (spec api § B Tính Tổng Tiền), cần `X-User-Id`. */
export const listingRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get(
    '/v1/listings/:listingId/quote',
    {
      schema: {
        params: z.object({ listingId: entityIdSchema }),
        querystring: z.object({ quantity: z.coerce.number().int().min(MIN_QUANTITY) }),
        headers: requiredUserHeaders,
        response: { 200: quoteResponse },
      },
    },
    async (request) => {
      const buyerId = await resolveCurrentUser(db, request.headers[USER_ID_HEADER]);
      const quote = await quoteListing(db, {
        buyerId,
        listingId: request.params.listingId,
        quantity: request.query.quantity,
      });
      return { data: quote };
    },
  );
  done();
};
