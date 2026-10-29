import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { DB } from './types.js';

export type Database = Kysely<DB>;

/** Kích thước pool mặc định: 1 instance api, vài request đồng thời + job hết hạn. */
const DEFAULT_POOL_MAX = 10;

/**
 * `int8` (tiền, `count(*)`) → `number`. Mọi số tiền < 2^53 (`vnp_Amount` tối đa 12 chữ số),
 * lệch là dữ liệu sai nên throw thay vì làm tròn im lặng (specs/database.md § Conventions → Tiền).
 */
export function parseSafeInt8(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`int8 value outside safe integer range: ${value}`);
  }
  return parsed;
}

const INT8_OID: number = pg.types.builtins.INT8;

type TextParser = (value: string) => unknown;

// Parser riêng của pool, không sửa `pg.types` toàn cục; Kysely + pg chỉ dùng format text
function getTypeParser(oid: number, format: 'text' | 'binary' = 'text'): TextParser {
  if (oid === INT8_OID && format === 'text') {
    return parseSafeInt8;
  }
  return pg.types.getTypeParser(oid, format) as TextParser;
}

const typeParsers: pg.CustomTypesConfig = { getTypeParser };

export interface CreateDbOptions {
  connectionString: string;
  poolMax?: number;
}

/** Kysely trên pool `pg`; caller gọi `db.destroy()` khi tắt process. */
export function createDb({
  connectionString,
  poolMax = DEFAULT_POOL_MAX,
}: CreateDbOptions): Database {
  const pool = new pg.Pool({ connectionString, max: poolMax, types: typeParsers });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
