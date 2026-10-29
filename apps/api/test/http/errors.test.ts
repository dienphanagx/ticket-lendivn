import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, createUnreachableDb, type ErrorBody } from '../support/app.js';

const SECRET_DETAIL = 'connection string postgres://secret';

const db = createUnreachableDb();

afterAll(async () => {
  await db.destroy();
});

describe('global error handler', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp({ db });
    // Route thử chỉ tồn tại trong test: ném lỗi không lường trước
    app.get('/test/boom', () => {
      throw new Error(SECRET_DETAIL);
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 404 ROUTE_NOT_FOUND for an unknown route', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/unknown' });

    // Assert
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>()).toEqual({ code: 'ROUTE_NOT_FOUND', message: 'Route not found' });
  });

  it('should return 500 INTERNAL_ERROR without leaking the original error', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/test/boom' });

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(res.body).not.toContain('secret');
  });

  it('should map a Zod validation error to VALIDATION_FAILED with a field map', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/events?status=CANCELLED' });

    // Assert
    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.message).toBe('Validation failed');
    expect(Object.keys(body.details ?? {})).toEqual(['status']);
    expect(typeof body.details?.status).toBe('string');
  });

  it('should return 500 INTERNAL_ERROR when the database is unreachable', async () => {
    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/users' });

    // Assert
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>().code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('ECONNREFUSED');
  });
});
