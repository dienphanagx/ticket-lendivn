// @vitest-environment jsdom
import { Suspense, use, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider, useAccountMenu } from '@/components/providers/account-menu-provider';
import { AdminEventList } from '@/features/admin/components/admin-event-list';
import type { AdminEvent } from '@/features/admin/types';

import '../support/dom';

import { buildCompletion, EVENT_ID, jsonResponse } from '../support/factories';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const fetchMock = vi.fn<typeof fetch>();

const onSale: AdminEvent = {
  id: EVENT_ID,
  name: 'Đêm nhạc mùa thu',
  startsAt: '2026-11-20T12:30:00.000Z',
  status: 'ON_SALE',
  escrowTotal: 2_625_000,
  pendingOrderCount: 3,
  sellerCount: 2,
};

const completed: AdminEvent = {
  ...onSale,
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  name: 'Hội chợ sách',
  status: 'COMPLETED',
  escrowTotal: 0,
  pendingOrderCount: 0,
  sellerCount: 0,
};

// Giả lập `router.refresh()` của Next: RSC mới chưa về → transition còn chờ (component treo)
const rsc = { bump: () => undefined as void, pending: null as Promise<void> | null };
function RefreshProbe() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    rsc.bump = () => setVersion((v) => v + 1);
  }, []);
  if (version > 0 && rsc.pending) use(rsc.pending);
  return null;
}

function MenuState() {
  return <output data-testid="menu-open">{String(useAccountMenu().open)}</output>;
}

function renderList(events: AdminEvent[] = [onSale, completed]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AccountMenuProvider>
        {children}
        <MenuState />
        <Suspense fallback={null}>
          <RefreshProbe />
        </Suspense>
      </AccountMenuProvider>
    </QueryClientProvider>
  );
  return render(<AdminEventList events={events} />, { wrapper });
}

const openDialog = async () => {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Đánh dấu kết thúc' }));
  return screen.findByRole('alertdialog');
};

const confirmButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /Xác nhận kết thúc|Đang xử lý…/ });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  refresh.mockReset();
});

describe('AdminEventList + CompleteEventDialog', () => {
  it('should show the complete button only for an on-sale event', () => {
    renderList();

    expect(screen.getAllByRole('button', { name: 'Đánh dấu kết thúc' })).toHaveLength(1);
    expect(screen.getByText('Đã kết thúc')).toBeVisible();
  });

  it('should show escrow amount, seller count and expiring orders in the confirm dialog', async () => {
    renderList();

    const dialog = await openDialog();

    expect(
      within(dialog).getByRole('heading', { name: 'Kết thúc sự kiện Đêm nhạc mùa thu?' }),
    ).toBeVisible();
    expect(within(dialog).getByText('Thao tác không thể hoàn tác.')).toBeVisible();
    const amount = within(dialog).getByText('Số tiền ký quỹ sẽ giải phóng');
    expect(amount.nextElementSibling).toHaveTextContent('2.625.000 ₫');
    expect(within(dialog).getByText('Số người bán nhận tiền').nextElementSibling).toHaveTextContent(
      '2',
    );
    expect(
      within(dialog).getByText('Số đơn đang chờ thanh toán sẽ chuyển hết hạn').nextElementSibling,
    ).toHaveTextContent('3');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should close without calling the BFF on cancel', async () => {
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should send a single request when confirm is clicked twice quickly', async () => {
    let resolve: (res: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    renderList();
    const dialog = await openDialog();

    // 2 lần bấm liền nhau, trước khi React kịp render trạng thái khoá
    fireEvent.click(confirmButton(dialog));
    fireEvent.click(confirmButton(dialog));

    await waitFor(() => expect(confirmButton(dialog)).toBeDisabled());
    expect(confirmButton(dialog)).toHaveTextContent('Đang xử lý…');
    expect(within(dialog).getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/bff/events/${EVENT_ID}/complete`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    resolve(jsonResponse({ data: buildCompletion() }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('should close, show the release summary and refresh after success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: buildCompletion({ releasedTotal: 2_625_000 }) }),
    );
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(confirmButton(dialog));

    expect(
      await screen.findByText(
        'Đã kết thúc sự kiện Đêm nhạc mùa thu, giải phóng 2.625.000 ₫ cho 1 người bán',
      ),
    ).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('should keep the complete button locked until the refreshed list arrives', async () => {
    let finishRefresh: () => void = () => undefined;
    rsc.pending = new Promise<void>((r) => (finishRefresh = r));
    refresh.mockImplementation(() => rsc.bump());
    fetchMock.mockResolvedValue(jsonResponse({ data: buildCompletion() }));
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(confirmButton(dialog));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
    // Dòng cũ (ON_SALE) còn hiện trong lúc chờ RSC: nút phải khoá, không mở lại modal
    expect(screen.getByRole('button', { name: 'Đánh dấu kết thúc' })).toBeDisabled();

    await act(async () => {
      finishRefresh();
      await rsc.pending;
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Đánh dấu kết thúc' })).toBeEnabled(),
    );
    rsc.pending = null;
  });

  it('should close, explain and refresh when the event was already completed (409)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'EVENT_ALREADY_COMPLETED', message: 'Event is already completed' }, 409),
    );
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(confirmButton(dialog));

    expect(await screen.findByText('Sự kiện đã được đánh dấu kết thúc trước đó')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('should close and refresh when the event no longer exists (404)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'EVENT_NOT_FOUND', message: 'Event not found' }, 404),
    );
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(confirmButton(dialog));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('should keep the dialog open with a retry message on network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(confirmButton(dialog));

    expect(
      await within(dialog).findByText('Chưa kết thúc được sự kiện, vui lòng thử lại'),
    ).toBeVisible();
    expect(confirmButton(dialog)).toBeEnabled();
    expect(confirmButton(dialog)).toHaveTextContent('Xác nhận kết thúc');
    expect(refresh).not.toHaveBeenCalled();

    // Bấm lại an toàn: gửi yêu cầu mới
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: buildCompletion() }));
    await userEvent.setup().click(confirmButton(dialog));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should close and open the account menu when no account is selected (401)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'USER_NOT_SELECTED', message: 'Current user is not selected' }, 401),
    );
    renderList();
    const dialog = await openDialog();

    await userEvent.setup().click(confirmButton(dialog));

    expect(await screen.findByText('Vui lòng chọn tài khoản để tiếp tục')).toBeVisible();
    expect(screen.getByTestId('menu-open')).toHaveTextContent('true');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('CompleteEventDialog focus return', () => {
  it('should return focus to the open button after cancel', async () => {
    const user = userEvent.setup();
    renderList();
    const opener = screen.getByRole('button', { name: 'Đánh dấu kết thúc' });
    await user.click(opener);
    const dialog = await screen.findByRole('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('should return focus to the open button after Escape', async () => {
    const user = userEvent.setup();
    renderList();
    const opener = screen.getByRole('button', { name: 'Đánh dấu kết thúc' });
    await user.click(opener);
    await screen.findByRole('alertdialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('should not throw when the open button is gone after a successful completion', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: buildCompletion() }));
    const user = userEvent.setup();
    const view = renderList();
    // RSC mới về ngay khi refresh: dòng đã thành COMPLETED, nút mở biến mất
    refresh.mockImplementation(() =>
      view.rerender(<AdminEventList events={[{ ...onSale, status: 'COMPLETED' }, completed]} />),
    );
    const dialog = await openDialog();

    await user.click(confirmButton(dialog));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Đánh dấu kết thúc' })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBeNull();
  });
});
