// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider, useAccountMenu } from '@/components/providers/account-menu-provider';
import { StyleNonce } from '@/components/providers/style-nonce';
import type { EventListing } from '@/features/events/types';
import { TicketPicker } from '@/features/listings/components/ticket-picker';

import '../support/dom';

import { buildListing, buildQuote, jsonResponse, USER_A, USER_B } from '../support/factories';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn<typeof fetch>();
const TEST_NONCE = 'test-nonce';

const stubViewport = (desktop: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

const otherListing = buildListing();
const ownListing = buildListing({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  seller: { id: USER_A, displayName: 'An' },
  unitPrice: 2_000_000,
  isOwnListing: true,
});

function MenuProbe() {
  const { open } = useAccountMenu();
  return <output aria-label="menu-state">{open ? 'open' : 'closed'}</output>;
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <StyleNonce nonce={TEST_NONCE} />
      <AccountMenuProvider>
        {children}
        <MenuProbe />
      </AccountMenuProvider>
    </QueryClientProvider>
  );
}

function renderPicker(listings: EventListing[], currentUserId: string | null) {
  const ui = (ids: EventListing[], userId: string | null) => (
    <TicketPicker listings={ids} eventOnSale currentUserId={userId} />
  );
  const view = render(ui(listings, currentUserId), { wrapper: Providers });
  return {
    ...view,
    rerenderWith: (l: EventListing[], u: string | null) => view.rerender(ui(l, u)),
  };
}

const itemOf = (sellerName: string) => {
  const item = screen.getByText(sellerName).closest('li');
  if (!item) throw new Error(`No listing item for ${sellerName}`);
  return within(item);
};

const panel = () => within(screen.getByRole('complementary'));

beforeEach(() => {
  // Desktop (≥ 768px): khu chọn là khối cố định bên cạnh, không phải bottom sheet
  stubViewport(true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const quantity = Number(
      new URL(String(input), 'http://localhost').searchParams.get('quantity'),
    );
    const subtotal = otherListing.unitPrice * quantity;
    const buyerFee = Math.floor(subtotal / 10);
    return jsonResponse({
      data: buildQuote({ quantity, subtotal, buyerFee, buyerTotal: subtotal + buyerFee }),
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

describe('TicketPicker', () => {
  it('should mark own listing and disable its select button', () => {
    renderPicker([ownListing, otherListing], USER_A);

    expect(itemOf('An').getByText('Tin của bạn')).toBeVisible();
    expect(itemOf('An').getByRole('button', { name: 'Chọn' })).toBeDisabled();
    expect(itemOf('Bình').getByRole('button', { name: 'Chọn' })).toBeEnabled();
  });

  it('should show the quote for quantity 1 after selecting a listing', async () => {
    renderPicker([otherListing], USER_A);

    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(1);
    expect(await panel().findByText('1.375.000 ₫')).toBeVisible();
    expect(panel().getByText('125.000 ₫')).toBeVisible();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/bff/listings/${otherListing.id}/quote?quantity=1`,
    );
  });

  it('should recalculate the quote when quantity increases', async () => {
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));
    expect(panel().getByRole('button', { name: 'Giảm' })).toBeDisabled();

    await user.click(panel().getByRole('button', { name: 'Tăng' }));

    expect(await panel().findByText('2.750.000 ₫')).toBeVisible();
  });

  it('should show the remaining-tickets error and dashes when quantity exceeds stock', async () => {
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));
    const input = panel().getByRole('spinbutton', { name: 'Số lượng' });

    await user.clear(input);
    await user.type(input, '9');

    expect(panel().getByText('Chỉ còn 5 vé')).toBeVisible();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(panel().getAllByText('—')).toHaveLength(3);
    expect(panel().getByRole('button', { name: 'Tăng' })).toBeDisabled();
  });

  it('should require a quantity when the field is cleared', async () => {
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    await user.clear(panel().getByRole('spinbutton', { name: 'Số lượng' }));

    expect(panel().getByText('Vui lòng nhập số lượng')).toBeVisible();
  });

  it('should drop the selection when the new account owns the selected listing', async () => {
    const view = renderPicker([otherListing], USER_A);
    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    view.rerenderWith([{ ...otherListing, isOwnListing: true }], USER_B);

    expect(screen.getByText('Bạn không thể mua tin bán của chính mình')).toBeVisible();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('should keep listing and quantity when switching to another buyer', async () => {
    const user = userEvent.setup();
    const view = renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));
    await user.click(panel().getByRole('button', { name: 'Tăng' }));

    view.rerenderWith([{ ...otherListing }], 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(2);
  });

  it('should ask for an account and open the account menu when none is chosen', async () => {
    const view = renderPicker([otherListing], null);

    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    expect(screen.getByText('Vui lòng chọn tài khoản để tiếp tục')).toBeVisible();
    expect(screen.getByLabelText('menu-state')).toHaveTextContent('open');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    view.rerenderWith([otherListing], USER_A);

    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(1);
  });

  it('should close the panel and refresh when the listing no longer exists', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'LISTING_NOT_FOUND', message: 'Listing not found' }, 404),
    );
    renderPicker([otherListing], USER_A);

    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    await waitFor(() => expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument());
    expect(screen.getByText('Tin bán không còn tồn tại')).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });

  it('should show the network error with a retry button', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    expect(await panel().findByText('Mất kết nối, vui lòng kiểm tra mạng')).toBeVisible();
    await user.click(panel().getByRole('button', { name: 'Thử lại' }));

    expect(await panel().findByText('1.375.000 ₫')).toBeVisible();
  });

  it('should close the desktop panel on Escape when no other layer handled it', async () => {
    renderPicker([otherListing], USER_A);
    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    });

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('should keep the selection when another layer already handled Escape', async () => {
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));
    await user.click(panel().getByRole('button', { name: 'Tăng' }));
    // Như DismissableLayer của Radix (dropdown tài khoản): bắt Esc ở capture rồi preventDefault
    const handledByMenu = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener('keydown', handledByMenu, { capture: true });

    try {
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      });
    } finally {
      document.removeEventListener('keydown', handledByMenu, { capture: true });
    }

    expect(panel().getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(2);
  });
});

describe('TicketPicker on mobile (< 768px)', () => {
  beforeEach(() => stubViewport(false));

  it('should open the selection in a bottom sheet dialog', async () => {
    renderPicker([otherListing], USER_A);

    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    const sheet = within(screen.getByRole('dialog', { name: 'Chọn số lượng vé' }));
    expect(sheet.getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(1);
    expect(await sheet.findByText('1.375.000 ₫')).toBeVisible();
  });

  it('should only inject style tags carrying the CSP nonce while the sheet is open', async () => {
    renderPicker([otherListing], USER_A);

    await userEvent.setup().click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    const styles = [...document.head.querySelectorAll('style')];
    expect(styles.length).toBeGreaterThan(0); // react-remove-scroll khoá cuộn nền
    for (const style of styles) expect(style).toHaveAttribute('nonce', TEST_NONCE);
  });

  it('should clear the selection on Escape and return focus to the select button', async () => {
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    const selectButton = itemOf('Bình').getByRole('button', { name: 'Chọn' });
    await user.click(selectButton);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(selectButton).toHaveFocus();
    await user.click(selectButton);
    expect(screen.getByRole('spinbutton', { name: 'Số lượng' })).toHaveValue(1);
  });

  it('should close the sheet with the close button', async () => {
    const user = userEvent.setup();
    renderPicker([otherListing], USER_A);
    await user.click(itemOf('Bình').getByRole('button', { name: 'Chọn' }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đóng' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
