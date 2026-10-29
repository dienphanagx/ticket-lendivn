// Entrypoint `node dist/db/seed.js`: chạy sau migrate, trước server (Dockerfile CMD).
import { AppEnv, loadEnv } from '../config/env.js';
import { createScriptLogger } from '../lib/logger.js';
import { createDb } from './client.js';
import { seedDevData } from './seed-data.js';

const SEED_POOL_MAX = 1;

async function main(): Promise<void> {
  const env = loadEnv();
  const log = createScriptLogger(env, 'seed');

  // Seed chỉ cho dev + test (specs/database.md § Seed data)
  if (env.APP_ENV === AppEnv.PRODUCTION) {
    log.warn({ appEnv: env.APP_ENV }, 'seed skipped');
    return;
  }

  const db = createDb({ connectionString: env.DATABASE_URL, poolMax: SEED_POOL_MAX });
  try {
    const inserted = await seedDevData(db);
    log.info({ inserted }, 'seed completed');
  } catch (err) {
    log.fatal({ err }, 'seed failed');
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  // Env sai → chưa có logger
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
});
