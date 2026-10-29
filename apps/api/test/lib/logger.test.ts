import { Writable } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { AppEnv } from '../../src/config/env.js';
import { buildLoggerOptions, REDACT_CENSOR } from '../../src/lib/logger.js';

const SECRET_VALUE = 'x';
const LOG_MESSAGE = 'redact probe';

/** Ghi 1 dòng log qua pino thật với cấu hình của app, trả về object JSON đã parse. */
function logOnce(payload: object): Record<string, unknown> {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  // Production → JSON, không transport pretty; pino ghi đồng bộ vào stream truyền vào
  const logger = pino(buildLoggerOptions({ APP_ENV: AppEnv.PRODUCTION, LOG_LEVEL: 'info' }), sink);
  logger.info(payload, LOG_MESSAGE);
  return JSON.parse(lines.join('')) as Record<string, unknown>;
}

describe('logger redact', () => {
  it.each([
    ['root level', { password: SECRET_VALUE }, ['password']],
    ['level 2', { a: { password: SECRET_VALUE } }, ['a', 'password']],
    ['level 3', { a: { b: { password: SECRET_VALUE } } }, ['a', 'b', 'password']],
  ])('should censor password at %s', (_label, payload, path) => {
    // Act
    const line = logOnce(payload);

    // Assert
    expect(line).toHaveProperty(path, REDACT_CENSOR);
  });

  it.each(['token', 'accessToken', 'refreshToken', 'hashSecret', 'otp', 'cmnd', 'passport', 'ssn'])(
    'should censor %s at root level',
    (key) => {
      // Act
      const line = logOnce({ [key]: SECRET_VALUE });

      // Assert
      expect(line[key]).toBe(REDACT_CENSOR);
    },
  );

  it('should keep non-sensitive fields', () => {
    // Act
    const line = logOnce({ orderId: 'ORDER1', a: { status: 'PAID' } });

    // Assert
    expect(line).toMatchObject({ orderId: 'ORDER1', a: { status: 'PAID' }, msg: LOG_MESSAGE });
  });
});
