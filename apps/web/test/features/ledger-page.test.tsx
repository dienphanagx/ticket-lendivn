// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../support/dom';

import {
  buildEventSummary,
  buildLedgerAccount,
  EVENT_ID,
  jsonResponse,
  USER_A,
} from '../support/factories';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: USER_A }) }),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  RedirectType: { replace: 'replace' },
}));

const { LedgerOverviewSection } =
  await import('@/features/ledger/components/ledger-overview-section');
const { LedgerAccountDetails } =
  await import('@/features/ledger/components/ledger-account-details');

const fetchMock = vi.fn<typeof fetch>();

const platformFee = buildLedgerAccount({
  id: 'd0000000-0000-4000-8000-0000000000ff',
  type: 'PLATFORM_FEE_REVENUE',
  user: null,
  event: null,
  totalDebit: 0,
  totalCredit: 250_000,
  balance: 250_000,
});

const overview = (meta: Partial<{ total: number; page: number; totalPages: number }> = {}) => ({
  data: {
    accounts: [buildLedgerAccount(), platformFee],
    totals: { debit: 2_625_000, credit: 2_625_000 },
    transactions: [],
  },
  meta: { total: 30, page: 1, limit: 20, totalPages: 2, ...meta },
});

function mockApi(ledger: unknown, status = 200) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input).endsWith('/v1/events')) return jsonResponse({ data: [buildEventSummary()] });
    return jsonResponse(ledger, status);
  });
}

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  redirect.mockClear();
});

describe('LedgerOverviewSection', () => {
  it('should drop only the event filter when the event no longer exists', async () => {
    mockApi({ code: 'EVENT_NOT_FOUND', message: 'Event not found' }, 404);

    await expect(
      LedgerOverviewSection({ page: 1, filter: { type: 'EVENT_RELEASE', eventId: EVENT_ID } }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/quan-tri/so-cai?type=EVENT_RELEASE');
  });

  it('should redirect to page 1 keeping both filters when page is beyond totalPages', async () => {
    mockApi(overview({ page: 5, totalPages: 2 }));

    await expect(
      LedgerOverviewSection({ page: 5, filter: { type: 'PAYMENT_CAPTURED', eventId: EVENT_ID } }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(
      `/quan-tri/so-cai?type=PAYMENT_CAPTURED&eventId=${EVENT_ID}`,
    );
  });

  it('should show ledger totals, accounts with "Sàn" owner and filter links without page', async () => {
    mockApi(overview());

    render(await LedgerOverviewSection({ page: 1, filter: { eventId: EVENT_ID } }));

    expect(screen.getByText('Tổng ghi nợ toàn sổ').nextElementSibling).toHaveTextContent(
      '2.625.000 ₫',
    );
    expect(screen.getByText('Tổng ghi có toàn sổ').nextElementSibling).toHaveTextContent(
      '2.625.000 ₫',
    );
    const feeRow = screen.getByRole('link', { name: 'Doanh thu phí sàn' }).closest('tr')!;
    expect(within(feeRow).getAllByRole('cell')[1]).toHaveTextContent('Sàn');
    const sellerRow = screen.getByRole('link', { name: 'Ký quỹ người bán · Bình' }).closest('tr')!;
    expect(within(sellerRow).getAllByRole('cell')[1]).toHaveTextContent('Bình');

    const typeFilter = within(screen.getByRole('navigation', { name: 'Lọc theo loại giao dịch' }));
    const captured = typeFilter.getByRole('link', { name: 'Ghi nhận thanh toán' });
    expect(captured).toHaveAttribute(
      'href',
      `/quan-tri/so-cai?type=PAYMENT_CAPTURED&eventId=${EVENT_ID}`,
    );
    expect(captured.getAttribute('href')).not.toContain('page=');
    expect(screen.getByText('Chưa có bút toán nào')).toBeVisible();
  });

  it('should keep filters on pagination links', async () => {
    mockApi(overview({ page: 1, totalPages: 2 }));

    render(
      await LedgerOverviewSection({
        page: 1,
        filter: { type: 'EVENT_RELEASE', eventId: EVENT_ID },
      }),
    );

    const nav = within(screen.getByRole('navigation', { name: 'Phân trang' }));
    expect(nav.getByRole('link', { name: 'Trang sau' })).toHaveAttribute(
      'href',
      `/quan-tri/so-cai?type=EVENT_RELEASE&eventId=${EVENT_ID}&page=2`,
    );
  });
});

describe('LedgerAccountDetails', () => {
  it('should show total debit, total credit and balance from the api account', () => {
    const account = buildLedgerAccount({
      totalDebit: 1_000_000,
      totalCredit: 3_375_000,
      balance: 2_375_000,
    });

    render(
      <LedgerAccountDetails
        page={1}
        result={{
          data: { account, entries: [] },
          meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
          eventNames: new Map(),
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ký quỹ người bán · Bình' })).toBeVisible();
    expect(screen.getByText('Tổng ghi nợ').nextElementSibling).toHaveTextContent('1.000.000 ₫');
    expect(screen.getByText('Tổng ghi có').nextElementSibling).toHaveTextContent('3.375.000 ₫');
    expect(screen.getByText('Số dư').nextElementSibling).toHaveTextContent('2.375.000 ₫');
    expect(screen.getByText('Chưa có bút toán nào')).toBeVisible();
  });

  it('should show "Sàn" as owner of a platform account', () => {
    render(
      <LedgerAccountDetails
        page={1}
        result={{
          data: { account: platformFee, entries: [] },
          meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
          eventNames: new Map(),
        }}
      />,
    );

    expect(screen.getByText(/Chủ sở hữu: Sàn/)).toBeVisible();
  });
});
