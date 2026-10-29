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
import { orderRoutes } from './features/orders/routes.js';
import { PaymentRecorder } from './features/payments/payment-recorder.js';
import { createPaymentStatusSync } from './features/payments/payment-sync.js';
import { paymentUrlRoutes } from './features/payments/payment-url-routes.js';
import {
  resolvePaymentUrlGateway,
  resolveQuerydrGateway,
  type VnpayEnv,
} from './features/payments/vnpay-config.js';
import { vnpayIpnRoutes } from './features/payments/vnpay-ipn-routes.js';
import { createQuerydrClient } from './features/payments/vnpay-querydr.js';
import { vnpayReturnRoutes } from './features/payments/vnpay-return-routes.js';
import { userRoutes } from './features/users/routes.js';
import { registerErrorHandlers } from './lib/error-handler.js';
import { buildLoggerOptions } from './lib/logger.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './lib/request-id.js';
import { healthRoutes } from './routes/health.js';

/** `VNPAY_*` thiếu = chưa cấu hình phần cổng tương ứng; test truyền khoá giả. */
export type AppConfig = Pick<Env, 'APP_ENV' | 'LOG_LEVEL'> & Partial<VnpayEnv>;

export interface AppDeps {
  /** Caller sở hữu vòng đời pool (tạo + `destroy()`); app chỉ dùng. */
  db: Database;
  readinessBudgetMs?: number;
  /** `fetch` cho lời gọi `querydr`; test inject cổng giả. Mặc định `fetch` của Node. */
  fetch?: typeof fetch;
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
  const querydrGateway = resolveQuerydrGateway(config);
  const syncPayment =
    querydrGateway &&
    createPaymentStatusSync(
      new PaymentRecorder(db),
      createQuerydrClient(querydrGateway, { fetch: deps.fetch ?? fetch }),
    );
  await app.register(orderRoutes, { prefix: API_PREFIX, db, syncPayment });
  await app.register(paymentUrlRoutes, {
    prefix: API_PREFIX,
    db,
    gateway: resolvePaymentUrlGateway(config),
  });
  const hashSecret = config.VNPAY_HASH_SECRET;
  await app.register(vnpayReturnRoutes, { prefix: API_PREFIX, db, hashSecret });
  await app.register(vnpayIpnRoutes, { prefix: API_PREFIX, db, hashSecret });

  return app;
}
