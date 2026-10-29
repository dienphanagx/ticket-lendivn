import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLedgerFilter } from '@/features/ledger/types';

import { buildLedgerAccount, EVENT_ID, jsonResponse, USER_A } from '../support/factories';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: USER_A }) }),
}));
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => notFound(),
  redirect: vi.fn(),
  RedirectType: { replace: 'replace' },
}));

const { loadLedgerAccount, loadLedgerOverview } = await import('@/features/ledger/loaders');
const { default: LedgerAccountPage } = await import('@/app/quan-tri/so-cai/[accountId]/page');

const ACCOUNT_ID = 'd0000000-0000-4000-8000-000000000001';
const fetchMock = vi.fn<typeof fetch>();
const pageMeta = { total: 0, page: 1, limit: 50, totalPages: 0 };
const events = { data: [] };

function mockApi(ledger: unknown, status = 200) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input).endsWith('/v1/events')) return jsonResponse(events);
    return jsonResponse(ledger, status);
  });
}

const ledgerCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/ledger'));

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  notFound.mockClear();
});

describe('loadLedgerAccount', () => {
  it.each(['', 'a b', '../ledger', 'x'.repeat(65), 'đ'])(
    'should return null for malformed account id %j without calling api',
    async (accountId) => {
      await expect(loadLedgerAccount(accountId, 1)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('should load the account with limit 50', async () => {
    mockApi({ data: { account: buildLedgerAccount(), entries: [] }, meta: pageMeta });

    const result = await loadLedgerAccount(ACCOUNT_ID, 2);

    expect(result?.data.account.id).toBe(ACCOUNT_ID);
    expect(String(ledgerCalls()[0]?.[0])).toBe(
      `http://api.test/api/v1/ledger/accounts/${ACCOUNT_ID}?page=2&limit=50`,
    );
  });

  it('should return null on 404 LEDGER_ACCOUNT_NOT_FOUND', async () => {
    mockApi({ code: 'LEDGER_ACCOUNT_NOT_FOUND', message: 'Ledger account not found' }, 404);

    await expect(loadLedgerAccount(ACCOUNT_ID, 1)).resolves.toBeNull();
  });

  it('should throw on system errors', async () => {
    mockApi({ code: 'INTERNAL_ERROR', message: 'boom' }, 500);

    await expect(loadLedgerAccount(ACCOUNT_ID, 1)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('LedgerAccountPage', () => {
  it('should 404 a malformed account id without calling api', async () => {
    const params = Promise.resolve({ accountId: 'bad id!' });

    await expect(
      LedgerAccountPage({ params, searchParams: Promise.resolve({}) } as never),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should 404 when api has no such account', async () => {
    mockApi({ code: 'LEDGER_ACCOUNT_NOT_FOUND', message: 'Ledger account not found' }, 404);
    const params = Promise.resolve({ accountId: ACCOUNT_ID });

    await expect(
      LedgerAccountPage({ params, searchParams: Promise.resolve({}) } as never),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('loadLedgerOverview', () => {
  const overview = {
    data: { accounts: [], totals: { debit: 0, credit: 0 }, transactions: [] },
    meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
  };

  it('should forward page, limit and filters to api', async () => {
    mockApi(overview);

    await loadLedgerOverview(3, { type: 'EVENT_RELEASE', eventId: EVENT_ID });

    expect(String(ledgerCalls()[0]?.[0])).toBe(
      `http://api.test/api/v1/ledger?page=3&limit=20&type=EVENT_RELEASE&eventId=${EVENT_ID}`,
    );
  });

  it('should return null when the filtered event does not exist', async () => {
    mockApi({ code: 'EVENT_NOT_FOUND', message: 'Event not found' }, 404);

    await expect(loadLedgerOverview(1, { eventId: EVENT_ID })).resolves.toBeNull();
  });
});

describe('parseLedgerFilter', () => {
  it('should keep known type and well-formed event id', () => {
    expect(parseLedgerFilter({ type: 'PAYMENT_CAPTURED', eventId: EVENT_ID })).toEqual({
      type: 'PAYMENT_CAPTURED',
      eventId: EVENT_ID,
    });
  });

  it.each([
    [{ type: 'DROP', eventId: '../x' }],
    [{ type: ['EVENT_RELEASE', 'EVENT_RELEASE'], eventId: [EVENT_ID] }],
    [{}],
  ])('should drop unknown or repeated values %j', (search) => {
    expect(parseLedgerFilter(search)).toEqual({ type: undefined, eventId: undefined });
  });
});
