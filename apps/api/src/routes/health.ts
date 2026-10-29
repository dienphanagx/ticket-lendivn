import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { sql } from 'kysely';
import * as z from 'zod';

import type { Database } from '../db/client.js';

export const HEALTH_STATUS_OK = 'ok' as const;
export const HEALTH_STATUS_DEGRADED = 'degraded' as const;

/** Ngân sách chung của readiness (rule `policy-api` § Health check, specs/architecture.md § Routes). */
export const READINESS_BUDGET_MS = 2_000;

const CheckResult = { OK: 'ok', DOWN: 'down', TIMEOUT: 'timeout' } as const;
type CheckResult = (typeof CheckResult)[keyof typeof CheckResult];

const livenessResponse = z.object({ status: z.literal(HEALTH_STATUS_OK) });
const checkResultSchema = z.enum([CheckResult.OK, CheckResult.DOWN, CheckResult.TIMEOUT]);
const readinessResponse = z.object({
  status: z.enum([HEALTH_STATUS_OK, HEALTH_STATUS_DEGRADED]),
  checks: z.object({ database: checkResultSchema }),
});

/** Chạy 1 check trong ngân sách: lỗi → `down`, quá hạn → `timeout`; không throw. */
async function runCheck(check: () => Promise<unknown>, budgetMs: number): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => resolve(CheckResult.TIMEOUT), budgetMs);
  });
  const result = check().then(
    () => CheckResult.OK,
    () => CheckResult.DOWN,
  );
  try {
    return await Promise.race([result, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface HealthRoutesOptions {
  db: Database;
  readinessBudgetMs?: number;
}

/** Health ở root, ngoài prefix `/api`, không log request (rule `policy-api` § Health check). */
export const healthRoutes: FastifyPluginCallbackZod<HealthRoutesOptions> = (
  app,
  { db, readinessBudgetMs = READINESS_BUDGET_MS },
  done,
) => {
  app.get(
    '/health',
    { logLevel: 'silent', schema: { response: { 200: livenessResponse } } },
    () => ({ status: HEALTH_STATUS_OK }),
  );

  app.get(
    '/health/ready',
    {
      logLevel: 'silent',
      schema: { response: { 200: readinessResponse, 503: readinessResponse } },
    },
    async (_request, reply) => {
      const database = await runCheck(() => sql`SELECT 1`.execute(db), readinessBudgetMs);
      const healthy = database === CheckResult.OK;
      if (!healthy) {
        // Route tắt request log → log riêng để biết vì sao probe fail
        app.log.warn({ checks: { database } }, 'readiness check failed');
      }
      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? HEALTH_STATUS_OK : HEALTH_STATUS_DEGRADED,
        checks: { database },
      });
    },
  );
  done();
};
