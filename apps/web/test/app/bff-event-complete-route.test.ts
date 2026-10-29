import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BFF_ROUTES } from '@/constants/routes';

import { buildCompletion, EVENT_ID, jsonResponse, USER_A } from '../support/factories';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: async () => new URL('http://localhost') }));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

const { POST } = await import('@/app/bff/events/[eventId]/complete/route');

const fetchMock = vi.fn<typeof fetch>();
const sameOrigin = { 'sec-fetch-site': 'same-origin' };

function complete(headers: Record<string, string> = sameOrigin, eventId = EVENT_ID) {
  return POST(
    new NextRequest(`http://localhost${BFF_ROUTES.EVENT_COMPLETE(eventId)}`, {
      method: 'POST',
      headers,
    }),
    { params: Promise.resolve({ eventId }) },
  );
}

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubEnv('SITE_URL', 'http://localhost');
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.value = USER_A;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('POST /bff/events/[eventId]/complete', () => {
  it('should call api complete and return the completion summary', async () => {
    const completion = buildCompletion();
    fetchMock.mockResolvedValue(jsonResponse({ data: completion }));

    const res = await complete();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: completion });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`http://api.test/api/v1/events/${EVENT_ID}/complete`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('X-User-Id')).toBe(USER_A);
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['cross-site', 'same-site', 'none'])(
    'should reject Sec-Fetch-Site %s with 403 without calling api',
    async (site) => {
      const res = await complete({ 'sec-fetch-site': site });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ code: 'BFF_CROSS_SITE_REJECTED' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('should reject a foreign Origin when Sec-Fetch-Site is missing', async () => {
    const res = await complete({ origin: 'https://evil.example' });

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should accept the own Origin when Sec-Fetch-Site is missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: buildCompletion() }));

    const res = await complete({ origin: 'http://localhost' });

    expect(res.status).toBe(200);
  });

  it.each(['../users', 'a b', 'x'.repeat(65)])(
    'should reject event id %s with 400 without calling api',
    async (eventId) => {
      const res = await complete(sameOrigin, eventId);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('should return 401 USER_NOT_SELECTED without an account cookie', async () => {
    cookieStore.value = undefined;

    const res = await complete();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'USER_NOT_SELECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should pass through api 404 EVENT_NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'EVENT_NOT_FOUND', message: 'Event not found' }, 404),
    );

    const res = await complete();

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: 'EVENT_NOT_FOUND',
      message: 'Event not found',
    });
  });

  it('should pass through api 409 EVENT_ALREADY_COMPLETED with details', async () => {
    const body = {
      code: 'EVENT_ALREADY_COMPLETED',
      message: 'Event is already completed',
      details: { completedAt: '2026-10-29T03:00:00.000Z' },
    };
    fetchMock.mockResolvedValue(jsonResponse(body, 409));

    const res = await complete();

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(body);
  });

  it('should return 504 when the api does not answer within 15 seconds', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

    const res = await complete();

    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_UPSTREAM_TIMEOUT' });
  });

  it('should return 503 when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await complete();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_UPSTREAM_UNAVAILABLE' });
  });

  it('should return 502 when the api answers with an unexpected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: EVENT_ID } }));

    const res = await complete();

    expect(res.status).toBe(502);
  });
});
