import { createServer, type AddressInfo, type Socket } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createDb, type Database } from '../src/db/client.js';
import { REQUEST_ID_HEADER } from '../src/lib/request-id.js';
import { buildTestApp, createUnreachableDb } from './support/app.js';
import { createTestDb } from './support/test-db.js';

const SHORT_BUDGET_MS = 100;

const testDb = createTestDb();
const unreachableDb = createUnreachableDb();

afterAll(async () => {
  await testDb.destroy();
  await unreachableDb.destroy();
});

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  const buildWithoutDb = async () => {
    app = await buildTestApp({ db: unreachableDb });
  };

  it('should return 200 with status ok without touching the database', async () => {
    await buildWithoutDb();

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('should echo a valid X-Request-ID header', async () => {
    await buildWithoutDb();

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { [REQUEST_ID_HEADER]: 'req-123' },
    });

    expect(res.headers[REQUEST_ID_HEADER]).toBe('req-123');
  });

  it('should replace an unsafe X-Request-ID with a generated UUID', async () => {
    await buildWithoutDb();

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

describe('GET /health/ready', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  const readyWith = async (db: Database, readinessBudgetMs?: number) => {
    app = await buildTestApp({ db, readinessBudgetMs });
    return app.inject({ method: 'GET', url: '/health/ready' });
  };

  it('should return 200 when the database answers', async () => {
    const res = await readyWith(testDb);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('should return 503 with database down when the connection fails', async () => {
    const res = await readyWith(unreachableDb);

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'down' } });
  });

  it('should return 503 with database timeout when the check exceeds the budget', async () => {
    // Arrange: TCP server nhận kết nối nhưng không bao giờ trả lời → handshake PostgreSQL treo
    const sockets: Socket[] = [];
    const silent = createServer((socket) => {
      socket.on('error', () => undefined);
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as AddressInfo;
    const hangingDb = createDb({
      connectionString: `postgres://nobody:nobody@127.0.0.1:${port}/hanging_test`,
      poolMax: 1,
    });

    try {
      // Act
      const res = await readyWith(hangingDb, SHORT_BUDGET_MS);

      // Assert
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'timeout' } });
    } finally {
      // Cắt socket trước để client pg đang chờ handshake lỗi ra, pool đóng được
      sockets.forEach((socket) => socket.destroy());
      silent.close();
      await hangingDb.destroy().catch(() => undefined);
    }
  });
});
