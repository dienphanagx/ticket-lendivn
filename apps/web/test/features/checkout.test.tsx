// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider, useAccountMenu } from '@/components/providers/account-menu-provider';
import { TicketPicker } from '@/features/listings/components/ticket-picker';
import { AccountSwitcher } from '@/features/users/components/account-switcher';

import '../support/dom';

import {
  buildListing,
  buildQuote,
  jsonResponse,
  ORDER_ID,
  USER_A,
  USER_B,
} from '../support/factories';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const assignLocation = vi.fn<(url: string) => void>();
vi.mock('@/lib/browser-navigation', () => ({
  assignLocation: (url: string) => {
    assignLocation(url);
  },
}));

// Server Action ('use server' + next/headers) — chỉ cần biết có bị gọi không
const selectUser = vi.fn();
vi.mock('@/features/users/actions', () => ({
  selectUser: (id: string) => selectUser(id) as unknown,
  clearCurrentUser: async () => undefined,
}));

const PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=261029';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const listing = buildListing();

type Handler = (init: RequestInit | undefined) => Promise<Response>;
const fetchMock = vi.fn<typeof fetch>();
let orderHandler: Handler;
let paymentHandler: Handler;
let quoteHandler: (quantity: number) => Promise<Response>;

const quoteFor = (quantity: number) => {
  const subtotal = listing.unitPrice * quantity;
  const buyerFee = Math.floor(subtotal / 10);
  return jsonResponse({
    data: buildQuote({ quantity, subtotal, buyerFee, buyerTotal: subtotal + buyerFee }),
  });
};

const snapshot = {
  id: ORDER_ID,
  status: 'PENDING_PAYMENT',
  listingId: listing.id,
  eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  quantity: 1,
  unitPrice: listing.unitPrice,
  subtotal: 1_250_000,
  buyerFee: 125_000,
  buyerTotal: 1_375_000,
  createdAt: '2026-10-29T03:00:00.000Z',
  holdExpiresAt: '2026-10-29T03:15:00.000Z',
};

function MenuProbe() {
  const { open } = useAccountMenu();
  return <output aria-label="menu-state">{open ? 'open' : 'closed'}</output>;
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <AccountMenuProvider>
        {children}
        <MenuProbe />
      </AccountMenuProvider>
    </QueryClientProvider>
  );
}

const panel = () => within(screen.getByRole('complementary'));
const checkoutButton = () => panel().getByRole('button', { name: /Thanh toán|Đang tạo đơn/ });

const orderCalls = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === '/bff/orders' && init?.method === 'POST',
  );
const keyOf = (call: Parameters<typeof fetch> | undefined) =>
  new Headers(call?.[1]?.headers).get('Idempotency-Key');

async function openPanel() {
  const user = userEvent.setup();
  render(<TicketPicker listings={[listing]} eventOnSale currentUserId={USER_A} />, {
    wrapper: Providers,
  });
  await user.click(screen.getByRole('button', { name: 'Chọn' }));
  await waitFor(() => expect(checkoutButton()).toBeEnabled());
  return user;
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal('fetch', fetchMock);
  quoteHandler = async (quantity) => quoteFor(quantity);
  orderHandler = async () => jsonResponse({ data: snapshot }, 200);
  paymentHandler = async () =>
    jsonResponse({ data: { paymentUrl: PAYMENT_URL, expiresAt: snapshot.holdExpiresAt } });
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/quote'))
      return quoteHandler(Number(url.searchParams.get('quantity')));
    if (url.pathname === '/bff/orders') return orderHandler(init);
    if (url.pathname === `/bff/orders/${ORDER_ID}/payment-url`) return paymentHandler(init);
    throw new Error(`Unexpected fetch ${url.pathname}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
  assignLocation.mockReset();
});

describe('Quote summary while recalculating', () => {
  it('should not show the previous total and lock checkout until the new quote arrives', async () => {
    const user = await openPanel();
    let release: (res: Response) => void = () => undefined;
    quoteHandler = () => new Promise((resolve) => (release = resolve));

    await user.click(panel().getByRole('button', { name: 'Tăng' }));

    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(2);
    expect(panel().queryByText('1.375.000 ₫')).not.toBeInTheDocument();
    expect(
      panel().queryByText('1.250.000 ₫', { selector: 'dd.tabular-nums' }),
    ).not.toBeInTheDocument();
    expect(checkoutButton()).toBeDisabled();

    release(quoteFor(2));

    expect(await panel().findByText('2.750.000 ₫')).toBeVisible();
    expect(checkoutButton()).toBeEnabled();
  });

  it('should not show a quote whose quantity differs from the input', async () => {
    const user = await openPanel();
    // api (giả) trả quote của số lượng khác số đang nhập
    quoteHandler = async () => quoteFor(1);

    await user.click(panel().getByRole('button', { name: 'Tăng' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('quantity=2'))).toBe(true),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(panel().queryByText('1.375.000 ₫')).not.toBeInTheDocument();
    expect(checkoutButton()).toBeDisabled();
  });
});

describe('Checkout', () => {
  it('should create the order, get the payment url and redirect the browser', async () => {
    const user = await openPanel();

    await user.click(checkoutButton());

    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(PAYMENT_URL));
    const [call] = orderCalls();
    expect(keyOf(call)).toMatch(UUID_V4);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ listingId: listing.id, quantity: 1 });
    expect(checkoutButton()).toBeDisabled();
  });

  it('should send a single request on double click and lock the quantity field', async () => {
    const user = await openPanel();
    orderHandler = () => new Promise(() => undefined); // chưa phản hồi

    await user.dblClick(checkoutButton());

    expect(orderCalls()).toHaveLength(1);
    expect(checkoutButton()).toHaveTextContent('Đang tạo đơn…');
    expect(checkoutButton()).toBeDisabled();
    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toBeDisabled();
  });

  it('should reuse the key after a timeout and regenerate it when the quantity changes', async () => {
    const user = await openPanel();
    orderHandler = async () =>
      jsonResponse({ code: 'BFF_UPSTREAM_TIMEOUT', message: 'Upstream API timed out' }, 504);

    await user.click(checkoutButton());
    expect(await panel().findByText('Chưa tạo được đơn, vui lòng thử lại')).toBeVisible();
    await user.click(checkoutButton());
    await waitFor(() => expect(orderCalls()).toHaveLength(2));
    const firstKey = keyOf(orderCalls()[0]);
    expect(keyOf(orderCalls()[1])).toBe(firstKey);

    await user.click(panel().getByRole('button', { name: 'Tăng' }));
    await user.click(panel().getByRole('button', { name: 'Giảm' }));
    await waitFor(() => expect(checkoutButton()).toBeEnabled());
    // Câu lỗi gắn với nội dung cũ đã ẩn
    expect(panel().queryByText('Chưa tạo được đơn, vui lòng thử lại')).not.toBeInTheDocument();
    await user.click(checkoutButton());

    await waitFor(() => expect(orderCalls()).toHaveLength(3));
    const thirdKey = keyOf(orderCalls()[2]);
    expect(thirdKey).toMatch(UUID_V4);
    expect(thirdKey).not.toBe(firstKey);
  });

  it('should show the remaining tickets and refresh listings on INSUFFICIENT_QUANTITY', async () => {
    const user = await openPanel();
    orderHandler = async () =>
      jsonResponse({ code: 'INSUFFICIENT_QUANTITY', message: 'x', details: { available: 1 } }, 409);

    await user.click(checkoutButton());

    expect(await panel().findByText('Chỉ còn 1 vé, vui lòng chọn lại số lượng')).toBeVisible();
    expect(refresh).toHaveBeenCalled();
    expect(assignLocation).not.toHaveBeenCalled();
  });

  it('should close the panel when the listing just sold out', async () => {
    const user = await openPanel();
    orderHandler = async () =>
      jsonResponse({ code: 'INSUFFICIENT_QUANTITY', message: 'x', details: { available: 0 } }, 409);

    await user.click(checkoutButton());

    expect(await screen.findByText('Tin bán này vừa hết vé')).toBeVisible();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    ['EVENT_NOT_ON_SALE', 409, 'Sự kiện đã kết thúc, ngừng bán vé'],
    ['CANNOT_BUY_OWN_LISTING', 422, 'Bạn không thể mua tin bán của chính mình'],
    ['LISTING_NOT_FOUND', 404, 'Tin bán không còn tồn tại'],
  ])('should close the panel and refresh on %s', async (code, status, message) => {
    const user = await openPanel();
    orderHandler = async () => jsonResponse({ code, message: 'x' }, status);

    await user.click(checkoutButton());

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('should ask for an account and open the menu on USER_NOT_SELECTED', async () => {
    const user = await openPanel();
    orderHandler = async () => jsonResponse({ code: 'USER_NOT_SELECTED', message: 'x' }, 401);

    await user.click(checkoutButton());

    expect(await panel().findByText('Vui lòng chọn tài khoản để tiếp tục')).toBeVisible();
    expect(screen.getByLabelText('menu-state')).toHaveTextContent('open');
  });

  it('should explain an unreachable gateway and retry with the same key', async () => {
    const user = await openPanel();
    paymentHandler = async () =>
      jsonResponse({ code: 'PAYMENT_GATEWAY_UNAVAILABLE', message: 'not configured' }, 503);

    await user.click(checkoutButton());
    expect(
      await panel().findByText('Không kết nối được cổng thanh toán, vui lòng thử lại sau'),
    ).toBeVisible();
    expect(checkoutButton()).toBeEnabled();
    await user.click(checkoutButton());

    await waitFor(() => expect(orderCalls()).toHaveLength(2));
    expect(keyOf(orderCalls()[1])).toBe(keyOf(orderCalls()[0]));
    expect(assignLocation).not.toHaveBeenCalled();
  });

  it('should use a new key after the order of the current key is no longer payable', async () => {
    const user = await openPanel();
    paymentHandler = async () => jsonResponse({ code: 'ORDER_NOT_PAYABLE', message: 'x' }, 409);

    await user.click(checkoutButton());
    expect(await panel().findByText('Chưa tạo được đơn, vui lòng thử lại')).toBeVisible();
    await user.click(checkoutButton());

    await waitFor(() => expect(orderCalls()).toHaveLength(2));
    expect(keyOf(orderCalls()[1])).not.toBe(keyOf(orderCalls()[0]));
  });
});

describe('Locks while checkout is pending', () => {
  const otherListing = buildListing({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    seller: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', displayName: 'Chi' },
    unitPrice: 900_000,
  });

  async function openWithSwitcher() {
    const user = userEvent.setup();
    render(
      <>
        <AccountSwitcher
          users={[
            { id: USER_A, displayName: 'An', hasListings: false },
            { id: USER_B, displayName: 'Bình Khác', hasListings: true },
          ]}
          currentUserId={USER_A}
          loadFailed={false}
          stale={false}
        />
        <TicketPicker listings={[listing, otherListing]} eventOnSale currentUserId={USER_A} />
      </>,
      { wrapper: Providers },
    );
    const itemOf = (name: string) => {
      const li = screen.getByText(name).closest('li');
      if (!li) throw new Error(name);
      return within(li);
    };
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));
    await waitFor(() => expect(checkoutButton()).toBeEnabled());
    return { user, itemOf };
  }

  it('should lock other listings, the close button and the account menu until it settles', async () => {
    const { user, itemOf } = await openWithSwitcher();
    let release: (res: Response) => void = () => undefined;
    orderHandler = () => new Promise((resolve) => (release = resolve));
    const accountTrigger = screen.getByRole('button', { name: /An/ });

    await user.click(checkoutButton());

    expect(itemOf('Chi').getByRole('button', { name: 'Chọn' })).toBeDisabled();
    expect(accountTrigger).toBeDisabled();
    await user.click(panel().getByRole('button', { name: 'Đóng' }));
    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toBeInTheDocument();
    expect(selectUser).not.toHaveBeenCalled();

    release(jsonResponse({ code: 'BFF_UPSTREAM_TIMEOUT', message: 'x' }, 504));

    await waitFor(() => expect(itemOf('Chi').getByRole('button', { name: 'Chọn' })).toBeEnabled());
    expect(accountTrigger).toBeEnabled();
  });

  it('should only redirect for the listing whose checkout was started', async () => {
    const { user, itemOf } = await openWithSwitcher();
    let release: (res: Response) => void = () => undefined;
    orderHandler = () => new Promise((resolve) => (release = resolve));

    await user.click(checkoutButton());
    await user.click(itemOf('Chi').getByRole('button', { name: 'Chọn' }));
    release(jsonResponse({ data: snapshot }));

    await waitFor(() => expect(assignLocation).toHaveBeenCalledWith(PAYMENT_URL));
    // Khu chọn vẫn là tin của lần bấm (không đổi sang tin khác giữa chừng)
    expect(panel().getByText('Bình', { selector: 'dd' })).toBeVisible();
    expect(orderCalls()).toHaveLength(1);
    expect(JSON.parse(String(orderCalls()[0]?.[1]?.body))).toMatchObject({ listingId: listing.id });
  });
});
