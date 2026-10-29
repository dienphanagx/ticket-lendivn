import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BFF_ROUTES } from '@/constants/routes';

import { buildQuote, jsonResponse, USER_A } from '../support/factories';

vi.mock('server-only', () => ({}));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

const { GET } = await import('@/app/bff/listings/[listingId]/quote/route');

const LISTING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fetchMock = vi.fn<typeof fetch>();

function callRoute(query: string, headers: Record<string, string> = {}, listingId = LISTING_ID) {
  const url = `http://localhost${BFF_ROUTES.LISTING_QUOTE(listingId)}${query}`;
  const request = new NextRequest(url, {
    headers: { 'sec-fetch-site': 'same-origin', ...headers },
  });
  return GET(request, { params: Promise.resolve({ listingId }) });
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

describe('GET /bff/listings/:listingId/quote', () => {
  it('should forward to api quote with X-User-Id from the cookie and return the quote', async () => {
    const quote = buildQuote({
      quantity: 2,
      subtotal: 2_500_000,
      buyerFee: 250_000,
      buyerTotal: 2_750_000,
    });
    fetchMock.mockResolvedValue(jsonResponse({ data: quote }));

    const res = await callRoute('?quantity=2');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: quote });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`http://api.test/api/v1/listings/${LISTING_ID}/quote?quantity=2`);
    expect(new Headers(init?.headers).get('X-User-Id')).toBe(USER_A);
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it.each(['cross-site', 'same-site'])('should reject Sec-Fetch-Site %s with 403', async (site) => {
    const res = await callRoute('?quantity=1', { 'sec-fetch-site': site });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_CROSS_SITE_REJECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', '?quantity=', '?quantity=0', '?quantity=1.5', '?quantity=abc'])(
    'should reject invalid quantity %s with 400 without calling api',
    async (query) => {
      const res = await callRoute(query);

      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string; details?: Record<string, unknown> };
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(typeof body.details?.quantity).toBe('string');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('should reject a malformed listing id with 400', async () => {
    const res = await callRoute('?quantity=1', {}, '..%2Fadmin');

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return 401 USER_NOT_SELECTED when no account is chosen', async () => {
    cookieStore.value = undefined;

    const res = await callRoute('?quantity=1');

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'USER_NOT_SELECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should pass through api business errors with status and details', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'INSUFFICIENT_QUANTITY',
          message: 'Not enough tickets available',
          details: { available: 1 },
        },
        409,
      ),
    );

    const res = await callRoute('?quantity=3');

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      code: 'INSUFFICIENT_QUANTITY',
      message: 'Not enough tickets available',
      details: { available: 1 },
    });
  });

  it('should return 504 when the api times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

    const res = await callRoute('?quantity=1');

    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_UPSTREAM_TIMEOUT' });
  });

  it('should return 503 when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await callRoute('?quantity=1');

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_UPSTREAM_UNAVAILABLE' });
  });

  it('should return 502 when the api answers with an unexpected body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { listingId: 1 } }));

    const res = await callRoute('?quantity=1');

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_UPSTREAM_INVALID_RESPONSE' });
  });
});
