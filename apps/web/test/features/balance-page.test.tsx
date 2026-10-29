// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider } from '@/components/providers/account-menu-provider';

import '../support/dom';

import { buildBalanceEntry, jsonResponse, ORDER_ID, USER_A } from '../support/factories';

vi.mock('server-only', () => ({}));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  RedirectType: { replace: 'replace' },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const { BalanceSection } = await import('@/features/account/components/balance-section');
const { default: AccountPage } = await import('@/app/tai-khoan/page');

const fetchMock = vi.fn<typeof fetch>();

const meta = (overrides: Partial<{ total: number; page: number; totalPages: number }> = {}) => ({
  total: 2,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...overrides,
});

const balanceBody = (overrides: Record<string, unknown> = {}, pageMeta = meta()) => ({
  data: {
    pendingBalance: 2_375_000,
    availableBalance: 1_375_000,
    availableBreakdown: { sales: 0, refunds: 1_375_000 },
    entries: [
      buildBalanceEntry(),
      buildBalanceEntry({
        id: 'b0000000-0000-4000-8000-000000000002',
        accountType: 'BUYER_REFUND_PAYABLE',
        transactionType: 'PAYMENT_REFUND_REQUIRED',
        description: `Khoản hoàn tiền · Đơn ${ORDER_ID}`,
        amount: -500_000,
        balanceType: 'AVAILABLE',
      }),
    ],
    ...overrides,
  },
  meta: pageMeta,
});

const users = { data: [{ id: USER_A, displayName: 'An', hasListings: false }] };

function mockApi(balance: unknown, status = 200) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/v1/users')) return jsonResponse(users);
    return jsonResponse(balance, status);
  });
}

const renderWithMenu = (ui: ReactElement) =>
  render(<AccountMenuProvider>{ui}</AccountMenuProvider>);

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.value = USER_A;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  redirect.mockClear();
});

describe('BalanceSection', () => {
  it('should show pending and available balances in their own labelled boxes', async () => {
    mockApi(balanceBody());

    renderWithMenu(await BalanceSection({ userId: USER_A, page: 1 }));

    const pending = screen.getByText('Số dư đang chờ');
    expect(pending.nextElementSibling).toHaveTextContent('2.375.000 ₫');
    expect(
      screen.getByText('Tiền bán vé đang được giữ ký quỹ đến khi sự kiện kết thúc'),
    ).toBeVisible();
    const available = screen.getByText('Số dư khả dụng');
    expect(available.nextElementSibling).toHaveTextContent('1.375.000 ₫');
    expect(screen.getByText('An')).toBeVisible();
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes('/me/balance')) ?? [];
    expect(String(url)).toBe('http://api.test/api/v1/me/balance?page=1&limit=20');
    expect(new Headers(init?.headers).get('X-User-Id')).toBe(USER_A);
  });

  it('should sign amounts with + / − and a text label, not only by colour', async () => {
    mockApi(balanceBody());

    renderWithMenu(await BalanceSection({ userId: USER_A, page: 1 }));

    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Tăng +2.375.000 ₫');
    expect(within(rows[0]!).getByText('Đang chờ')).toBeVisible();
    expect(rows[1]).toHaveTextContent('Giảm −500.000 ₫');
    expect(within(rows[1]!).getByText('Khả dụng')).toBeVisible();
    // Chỉ khoản hoàn tiền (đơn do chính tài khoản mua) có link sang trang đơn
    expect(within(rows[0]!).queryByRole('link')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByRole('link', { name: `Xem đơn ${ORDER_ID}` })).toHaveAttribute(
      'href',
      `/don-hang/${ORDER_ID}`,
    );
  });

  it('should show 0 ₫ and the empty message when there are no entries', async () => {
    mockApi(
      balanceBody(
        {
          pendingBalance: 0,
          availableBalance: 0,
          availableBreakdown: { sales: 0, refunds: 0 },
          entries: [],
        },
        meta({ total: 0, totalPages: 0 }),
      ),
    );

    renderWithMenu(await BalanceSection({ userId: USER_A, page: 1 }));

    expect(screen.getByText('Số dư đang chờ').nextElementSibling).toHaveTextContent('0 ₫');
    expect(screen.getByText('Số dư khả dụng').nextElementSibling).toHaveTextContent('0 ₫');
    expect(screen.getByText('Chưa có giao dịch nào')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Phân trang' })).not.toBeInTheDocument();
  });

  it('should render pagination from meta when there is more than one page', async () => {
    mockApi(balanceBody({}, meta({ total: 45, page: 2, totalPages: 3 })));

    renderWithMenu(await BalanceSection({ userId: USER_A, page: 2 }));

    const nav = within(screen.getByRole('navigation', { name: 'Phân trang' }));
    expect(nav.getByText('Trang 2/3')).toBeVisible();
    expect(nav.getByRole('link', { name: 'Trang trước' })).toHaveAttribute('href', '/tai-khoan');
    expect(nav.getByRole('link', { name: 'Trang sau' })).toHaveAttribute(
      'href',
      '/tai-khoan?page=3',
    );
  });

  it('should redirect to page 1 when page is beyond totalPages', async () => {
    mockApi(balanceBody({}, meta({ total: 2, page: 5, totalPages: 1 })));

    await expect(BalanceSection({ userId: USER_A, page: 5 })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/tai-khoan');
  });

  it('should ask to pick again when the selected account no longer exists', async () => {
    mockApi({ code: 'USER_NOT_FOUND', message: 'User not found' }, 404);

    renderWithMenu(await BalanceSection({ userId: USER_A, page: 1 }));

    expect(
      screen.getByText('Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại'),
    ).toBeVisible();
  });

  it('should bubble system errors to error.tsx', async () => {
    mockApi({ code: 'INTERNAL_ERROR', message: 'boom' }, 500);

    await expect(BalanceSection({ userId: USER_A, page: 1 })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('AccountPage', () => {
  it('should ask to pick an account without calling api when none is selected', async () => {
    cookieStore.value = undefined;

    renderWithMenu(await AccountPage({ searchParams: Promise.resolve({}) } as never));

    expect(screen.getByText('Vui lòng chọn tài khoản để tiếp tục')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
