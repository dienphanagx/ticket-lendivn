import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { AppEnv } from '../src/config/env.js';
import { REQUEST_ID_HEADER } from '../src/lib/request-id.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ APP_ENV: AppEnv.STAGING, LOG_LEVEL: 'fatal' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('should echo a valid X-Request-ID header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { [REQUEST_ID_HEADER]: 'req-123' },
    });

    expect(res.headers[REQUEST_ID_HEADER]).toBe('req-123');
  });

  it('should replace an unsafe X-Request-ID with a generated UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { [REQUEST_ID_HEADER]: 'bad id\ninjected' },
    });

    expect(res.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
