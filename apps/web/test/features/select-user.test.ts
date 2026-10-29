import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, USER_A, USER_B } from '../support/factories';

vi.mock('server-only', () => ({}));
const cookieStore = {
  value: undefined as string | undefined,
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
    set: cookieStore.set,
    delete: cookieStore.delete,
  }),
}));

const { clearCurrentUser, selectUser } = await import('@/features/users/actions');

const fetchMock = vi.fn<typeof fetch>();
const users = [
  { id: USER_A, displayName: 'An', hasListings: true },
  { id: USER_B, displayName: 'Bình', hasListings: false },
];

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse({ data: users }));
  cookieStore.value = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
});

describe('selectUser', () => {
  it.each([undefined, 42, '', 'bad id', 'a'.repeat(65)])(
    'should reject malformed id %s without calling api',
    async (userId) => {
      const result = await selectUser(userId);

      expect(result).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    },
  );

  it('should return USER_NOT_FOUND and keep the cookie when the id is not in the user list', async () => {
    const result = await selectUser('33333333-3333-4333-8333-333333333333');

    expect(result).toMatchObject({ success: false, code: 'USER_NOT_FOUND' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('should set the current_user_id cookie with spec attributes and return the display name', async () => {
    const result = await selectUser(USER_B);

    expect(result).toEqual({ success: true, data: { displayName: 'Bình' } });
    expect(cookieStore.set).toHaveBeenCalledWith('current_user_id', USER_B, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 2_592_000,
      secure: false,
    });
  });

  it('should mark the cookie Secure when APP_ENV is production', async () => {
    vi.stubEnv('APP_ENV', 'production');

    await selectUser(USER_A);

    expect(cookieStore.set).toHaveBeenCalledWith(
      'current_user_id',
      USER_A,
      expect.objectContaining({ secure: true }) as unknown,
    );
  });

  it('should load the user list without the stale X-User-Id header', async () => {
    cookieStore.value = '44444444-4444-4444-8444-444444444444';

    await selectUser(USER_A);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://api.test/api/v1/users');
    expect(new Headers(init?.headers).has('X-User-Id')).toBe(false);
  });

  it('should return the api error code when the user list cannot be loaded', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'INTERNAL_ERROR', message: 'Internal server error' }, 500),
    );

    const result = await selectUser(USER_A);

    expect(result).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe('clearCurrentUser', () => {
  it('should delete the current_user_id cookie', async () => {
    await clearCurrentUser();

    expect(cookieStore.delete).toHaveBeenCalledWith('current_user_id');
  });
});
