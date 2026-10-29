import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { AppError } from '@/lib/errors';

import { jsonResponse, USER_A } from '../support/factories';

vi.mock('server-only', () => ({}));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

const { API_TIMEOUT_MS, apiFetch, apiFetchAnonymous } = await import('@/lib/api/api-fetch');

const schema = z.object({ data: z.object({ id: z.string() }) });
const fetchMock = vi.fn<typeof fetch>();

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(url), init: init ?? {}, headers: new Headers(init?.headers) };
};

const catchError = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected rejection');
    },
    (err: unknown) => err as AppError,
  );

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.value = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('apiFetch', () => {
  it('should call API_INTERNAL_URL and return the parsed envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'x', extra: true } }));

    await expect(apiFetch('/v1/users', schema)).resolves.toEqual({ data: { id: 'x' } });
    expect(lastRequest().url).toBe('http://api.test/api/v1/users');
    expect(lastRequest().init.cache).toBe('no-store');
  });

  it('should forward X-User-Id from the current_user_id cookie', async () => {
    cookieStore.value = USER_A;
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'x' } }));

    await apiFetch('/v1/events/abc', schema);

    expect(lastRequest().headers.get('X-User-Id')).toBe(USER_A);
    expect(lastRequest().headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should not forward a malformed cookie value', async () => {
    cookieStore.value = 'bad value; drop';
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'x' } }));

    await apiFetch('/v1/events/abc', schema);

    expect(lastRequest().headers.has('X-User-Id')).toBe(false);
  });

  it('should omit X-User-Id for apiFetchAnonymous', async () => {
    cookieStore.value = USER_A;
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'x' } }));

    await apiFetchAnonymous('/v1/users', schema);

    expect(lastRequest().headers.has('X-User-Id')).toBe(false);
  });

  it('should attach a 15 second timeout signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'x' } }));

    await apiFetch('/v1/users', schema);

    expect(API_TIMEOUT_MS).toBe(15_000);
    expect(lastRequest().init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should throw AppError with code, status and details from the error envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'INSUFFICIENT_QUANTITY',
          message: 'Not enough tickets available',
          details: { available: 2 },
        },
        409,
        { 'x-request-id': 'req-1' },
      ),
    );

    const err = await catchError(apiFetch('/v1/listings/l/quote?quantity=3', schema));

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      code: 'INSUFFICIENT_QUANTITY',
      httpStatus: 409,
      details: { available: 2 },
      requestId: 'req-1',
    });
  });

  it('should map an error body without the envelope to INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    const err = await catchError(apiFetch('/v1/users', schema));

    expect(err).toMatchObject({ code: 'INVALID_RESPONSE', httpStatus: 502 });
  });

  it('should map a success body that fails the schema to INVALID_RESPONSE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 42 } }));

    const err = await catchError(apiFetch('/v1/users', schema));

    expect(err).toMatchObject({ code: 'INVALID_RESPONSE', httpStatus: 200 });
  });

  it('should map a timeout to TIMEOUT without http status', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

    const err = await catchError(apiFetch('/v1/users', schema));

    expect(err).toMatchObject({ code: 'TIMEOUT', httpStatus: null });
  });

  it('should map a connection failure to NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const err = await catchError(apiFetch('/v1/users', schema));

    expect(err).toMatchObject({ code: 'NETWORK_ERROR', httpStatus: null });
  });

  it('should fail loudly when API_INTERNAL_URL is missing', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');

    await expect(apiFetch('/v1/users', schema)).rejects.toThrow('API_INTERNAL_URL is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
