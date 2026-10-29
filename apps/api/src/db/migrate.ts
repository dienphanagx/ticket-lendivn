// Entrypoint `node dist/db/migrate.js`: chạy trước seed và server (Dockerfile CMD).
import { loadEnv } from '../config/env.js';
import { createScriptLogger } from '../lib/logger.js';
import { createDb } from './client.js';
import { migrateToLatest, MigrationError } from './migrator.js';

const MIGRATE_POOL_MAX = 1;

async function main(): Promise<void> {
  const env = loadEnv();
  const log = createScriptLogger(env, 'migrate');
  const db = createDb({ connectionString: env.DATABASE_URL, poolMax: MIGRATE_POOL_MAX });

  try {
    const results = await migrateToLatest(db);
    for (const result of results) {
      log.info({ migration: result.migrationName }, 'migration applied');
    }
    log.info({ applied: results.length }, 'migrations up to date');
  } catch (err) {
    const results = err instanceof MigrationError ? err.results : [];
    log.fatal({ err, results }, 'migration failed');
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
