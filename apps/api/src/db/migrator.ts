import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FileMigrationProvider, Migrator, type MigrationResult } from 'kysely/migration';

import type { Database } from './client.js';

/** `src/db/migrations` khi chạy TS (tsx, Vitest), `dist/db/migrations` khi chạy bản build. */
const MIGRATION_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly results: readonly MigrationResult[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

/**
 * Áp mọi migration chưa chạy, forward-only. Kysely chạy cả lượt trong 1 transaction và giữ
 * advisory lock, nên 2 container migrate cùng lúc không áp trùng; lỗi → rollback toàn bộ lượt.
 */
export async function migrateToLatest(db: Database): Promise<readonly MigrationResult[]> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: MIGRATION_FOLDER,
      // import() nằm trong module của app để Vitest transform được file `.ts`
      import: (modulePath: string): Promise<unknown> => import(pathToFileURL(modulePath).href),
    }),
  });

  const { error, results = [] } = await migrator.migrateToLatest();
  if (error !== undefined) {
    const failed = results.find((result) => result.status === 'Error');
    throw new MigrationError(
      `Migration failed: ${failed?.migrationName ?? 'before execution'}`,
      results,
      {
        cause: error,
      },
    );
  }
  return results;
}
