import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDb } from './db/client.js';

const LISTEN_HOST = '0.0.0.0';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });
  const app = await buildApp(env, { db });
  // Đóng pool sau khi server ngừng nhận request
  app.addHook('onClose', () => db.destroy());

  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      app.close().then(
        () => process.exit(0),
        (err: unknown) => {
          app.log.error({ err }, 'failed to close server');
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ host: LISTEN_HOST, port: env.PORT });
}

main().catch((err: unknown) => {
  // Logger chưa có khi env sai → stderr là kênh duy nhất
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exit(1);
});
