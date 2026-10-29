import type { FastifyInstance } from 'fastify';

import { buildApp, type AppConfig, type AppDeps } from '../../src/app.js';
import { AppEnv } from '../../src/config/env.js';
import { createDb, type Database } from '../../src/db/client.js';

/** Log `fatal` để output test gọn; mọi request đi qua `app.inject()`, không mở port. */
export const buildTestApp = (
  deps: AppDeps,
  config: Partial<AppConfig> = {},
): Promise<FastifyInstance> =>
  buildApp({ APP_ENV: AppEnv.STAGING, LOG_LEVEL: 'fatal', ...config }, deps);

/**
 * Kysely trỏ port không có server: pool chỉ kết nối khi có query, nên dùng được cho test không
 * cần DB (liveness) và để giả lập DB lỗi (readiness 503). Tên DB đuôi `_test` cho đồng bộ guard.
 */
export const createUnreachableDb = (): Database =>
  createDb({
    connectionString: 'postgres://nobody:nobody@127.0.0.1:1/unreachable_test',
    poolMax: 1,
  });

/** Envelope lỗi chuẩn (rule `policy-api` § Response format). */
export interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, string | number>;
}
