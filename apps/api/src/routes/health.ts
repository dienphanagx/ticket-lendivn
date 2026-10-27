import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

export const HEALTH_STATUS_OK = 'ok' as const;

const livenessResponse = z.object({ status: z.literal(HEALTH_STATUS_OK) });

/**
 * Health ở root, ngoài prefix `/api`, không log request (rule `policy-api` § Health check).
 * `GET /health/ready` (kiểm DB) thêm khi có tầng DB.
 */
export const healthRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/health',
    {
      logLevel: 'silent',
      schema: { response: { 200: livenessResponse } },
    },
    () => ({ status: HEALTH_STATUS_OK }),
  );
  done();
};
