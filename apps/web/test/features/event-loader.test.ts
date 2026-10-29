import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';

import { buildListing, jsonResponse, USER_A } from '../support/factories';

vi.mock('server-only', () => ({}));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

const { loadEventPage } = await import('@/features/events/loaders');

const SLUG = 'dem-nhac-mua-thu';
const fetchMock = vi.fn<typeof fetch>();

const eventDetail = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  slug: SLUG,
  name: 'Đêm nhạc mùa thu',
  venue: 'Nhà hát Lớn',
  startsAt: '2026-11-20T12:30:00.000Z',
  status: 'ON_SALE',
  completedAt: null,
  description: 'Mô tả',
  listings: [buildListing()],
};

const userHeaderOf = (call: number) =>
  new Headers(fetchMock.mock.calls[call]?.[1]?.headers).get('X-User-Id');

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.value = USER_A;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('loadEventPage', () => {
  it.each(['Abc', 'a--b', '-abc', 'abc-', 'a b', 'a'.repeat(101)])(
    'should return null for malformed slug %s without calling api',
    async (slug) => {
      await expect(loadEventPage(slug)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('should return the event with the current user id and forward X-User-Id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: eventDetail }));

    const page = await loadEventPage(SLUG);

    expect(page).toEqual({ event: eventDetail, currentUserId: USER_A });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://api.test/api/v1/events/${SLUG}`);
    expect(userHeaderOf(0)).toBe(USER_A);
  });

  it('should return null when the api reports EVENT_NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'EVENT_NOT_FOUND', message: 'Event not found' }, 404),
    );

    await expect(loadEventPage(SLUG)).resolves.toBeNull();
  });

  it('should retry without X-User-Id and drop the current user when the account no longer exists', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ code: 'USER_NOT_FOUND', message: 'User not found' }, 404),
      )
      .mockResolvedValueOnce(jsonResponse({ data: eventDetail }));

    const page = await loadEventPage(SLUG);

    expect(page).toEqual({ event: eventDetail, currentUserId: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(userHeaderOf(0)).toBe(USER_A);
    expect(userHeaderOf(1)).toBeNull();
  });

  it('should return null when the anonymous retry reports EVENT_NOT_FOUND', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ code: 'USER_NOT_FOUND', message: 'User not found' }, 404),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 'EVENT_NOT_FOUND', message: 'Event not found' }, 404),
      );

    await expect(loadEventPage(SLUG)).resolves.toBeNull();
  });

  it('should reject with the AppError when the api is unavailable', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'INTERNAL_ERROR', message: 'Service unavailable' }, 503),
    );

    const err: unknown = await loadEventPage(SLUG).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'INTERNAL_ERROR', httpStatus: 503 });
  });
});
