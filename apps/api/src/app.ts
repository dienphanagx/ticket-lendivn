import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import type { Env } from './config/env.js';
import { buildLoggerOptions } from './lib/logger.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './lib/request-id.js';
import { healthRoutes } from './routes/health.js';

export type AppConfig = Pick<Env, 'APP_ENV' | 'LOG_LEVEL'>;

/** Prefix của mọi route nghiệp vụ; health nằm ở root. */
export const API_PREFIX = '/api';

/** Dựng Fastify instance, không mở port — `server.ts` listen, test dùng `app.inject()`. */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config),
    genReqId: resolveRequestId,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  await app.register(helmet);
  await app.register(healthRoutes);
  // Route nghiệp vụ đăng ký dưới API_PREFIX: app.register(<plugin>, { prefix: API_PREFIX })

  return app;
}
