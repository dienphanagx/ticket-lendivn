import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { listUsers } from './repository.js';

const userListResponse = z.object({
  data: z.array(z.object({ id: z.string(), displayName: z.string(), hasListings: z.boolean() })),
});

/** `GET /v1/users` (spec api § A Xem Danh Sách Người Dùng): không header, không phân trang. */
export const userRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get('/v1/users', { schema: { response: { 200: userListResponse } } }, async () => ({
    data: await listUsers(db),
  }));
  done();
};
