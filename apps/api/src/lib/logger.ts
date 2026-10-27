import { createRequire } from 'node:module';

import type { FastifyServerOptions } from 'fastify';

import { AppEnv, type Env } from '../config/env.js';

const PRETTY_TRANSPORT = 'pino-pretty';

/** Field nhạy cảm tự mask `[Redacted]` (rule `policy-log` § Redact). */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.cardNumber',
  '*.cvv',
  '*.pin',
];

// `pino-pretty` là devDependency: image runner không có → rơi về JSON thay vì crash lúc start
function isPrettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve(PRETTY_TRANSPORT);
    return true;
  } catch {
    return false;
  }
}

export function buildLoggerOptions(
  env: Pick<Env, 'APP_ENV' | 'LOG_LEVEL'>,
): NonNullable<FastifyServerOptions['logger']> {
  const pretty = env.APP_ENV === AppEnv.DEVELOPMENT && isPrettyAvailable();
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    // Development: human-readable; còn lại JSON ra stdout (rule `policy-log` § Format & level)
    ...(pretty && {
      transport: { target: PRETTY_TRANSPORT, options: { translateTime: 'SYS:HH:MM:ss.l' } },
    }),
  };
}
