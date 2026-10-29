import { createRequire } from 'node:module';

import { pino, type Logger, type LoggerOptions } from 'pino';

import { AppEnv, type Env } from '../config/env.js';

const PRETTY_TRANSPORT = 'pino-pretty';

export const REDACT_CENSOR = '[Redacted]';

/** Field nhạy cảm tự mask `[Redacted]` (rule `policy-log` § Redact). */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'hashSecret',
  'otp',
  'verificationCode',
  'cardNumber',
  'cvv',
  'pin',
  'cmnd',
  'passport',
  'ssn',
];

// Mỗi `*` khớp đúng 1 cấp → khai cấp gốc, cấp 2, cấp 3 tường minh
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
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

export function buildLoggerOptions(env: Pick<Env, 'APP_ENV' | 'LOG_LEVEL'>): LoggerOptions {
  const pretty = env.APP_ENV === AppEnv.DEVELOPMENT && isPrettyAvailable();
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    // Development: human-readable; còn lại JSON ra stdout (rule `policy-log` § Format & level)
    ...(pretty && {
      transport: { target: PRETTY_TRANSPORT, options: { translateTime: 'SYS:HH:MM:ss.l' } },
    }),
  };
}

/** Logger cho script chạy ngoài Fastify (migrate, seed): cùng level, redact, format với server. */
export function createScriptLogger(env: Pick<Env, 'APP_ENV' | 'LOG_LEVEL'>, name: string): Logger {
  return pino({ ...buildLoggerOptions(env), name });
}
