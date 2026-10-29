import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { Env } from './config/env.js';
import type { Database } from './db/client.js';
import { eventRoutes } from './features/events/routes.js';
import { listingRoutes } from './features/listings/routes.js';
import { userRoutes } from './features/users/routes.js';
import { registerErrorHandlers } from './lib/error-handler.js';
import { buildLoggerOptions } from './lib/logger.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './lib/request-id.js';
import { healthRoutes } from './routes/health.js';

export type AppConfig = Pick<Env, 'APP_ENV' | 'LOG_LEVEL'>;

export interface AppDeps {
  /** Caller sở hữu vòng đời pool (tạo + `destroy()`); app chỉ dùng. */
  db: Database;
  readinessBudgetMs?: number;
}

/** Prefix của mọi route nghiệp vụ (path trong plugin là `/v1/...`); health nằm ở root. */
export const API_PREFIX = '/api';

/** Dựng Fastify instance, không mở port — `server.ts` listen, test dùng `app.inject()`. */
export async function buildApp(config: AppConfig, deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config),
    genReqId: resolveRequestId,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);

  app.addHook('onSend', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  await app.register(helmet);
  await app.register(healthRoutes, { db: deps.db, readinessBudgetMs: deps.readinessBudgetMs });

  const { db } = deps;
  await app.register(userRoutes, { prefix: API_PREFIX, db });
  await app.register(eventRoutes, { prefix: API_PREFIX, db });
  await app.register(listingRoutes, { prefix: API_PREFIX, db });

  return app;
}
