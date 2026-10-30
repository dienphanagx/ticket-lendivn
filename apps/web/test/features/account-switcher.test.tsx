// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider, useAccountMenu } from '@/components/providers/account-menu-provider';
import { AccountSwitcher } from '@/features/users/components/account-switcher';

import '../support/dom';

import { buildUserSummary, USER_A, USER_B } from '../support/factories';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const selectUser = vi.hoisted(() => vi.fn());
vi.mock('@/features/users/actions', () => ({ selectUser, clearCurrentUser: vi.fn() }));

const users = [
  buildUserSummary({ id: USER_A, displayName: 'An' }),
  buildUserSummary({ id: USER_B, displayName: 'Bình', hasListings: false }),
];

// Thay khu thanh toán: bật checkoutPending của provider như lúc đang tạo đơn
function StartCheckout() {
  const { setCheckoutPending } = useAccountMenu();
  return (
    <button type="button" onClick={() => setCheckoutPending(true)}>
      Bắt đầu thanh toán
    </button>
  );
}

const renderSwitcher = (currentUserId: string | null = USER_A, loadFailed = false) => {
  const ui = (id: string | null) => (
    <AccountMenuProvider>
      <AccountSwitcher users={users} currentUserId={id} loadFailed={loadFailed} stale={false} />
      <StartCheckout />
    </AccountMenuProvider>
  );
  const view = render(ui(currentUserId));
  return { ...view, rerenderWith: (id: string | null) => view.rerender(ui(id)) };
};

// Timer giả chỉ bật sau khi menu mở: findBy*/waitFor của RTL dùng setTimeout thật để poll
const switchTo = async (name: string) => {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'An' }));
  const item = await screen.findByRole('menuitemradio', { name });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // userEvent/RTL asyncWrapper chờ setTimeout thật của jest → treo khi timer giả của vitest bật
  await act(async () => {
    fireEvent.click(item);
    await vi.advanceTimersByTimeAsync(0);
  });
};

beforeEach(() => {
  selectUser.mockResolvedValue({ success: true, data: { displayName: 'Bình' } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  selectUser.mockReset();
  refresh.mockReset();
});

describe('AccountSwitcher', () => {
  it('should show the switched notice right after the action resolves', async () => {
    renderSwitcher();

    await switchTo('Bình');

    expect(selectUser).toHaveBeenCalledWith(USER_B);
    expect(screen.getByText('Đang xem với tài khoản Bình')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang xem với tài khoản Bình');
  });

  it('should keep the notice when the tree re-renders with new props after the cookie changes', async () => {
    const { rerenderWith } = renderSwitcher();
    await switchTo('Bình');

    rerenderWith(USER_B);

    expect(screen.getByRole('status')).toHaveTextContent('Đang xem với tài khoản Bình');
  });

  it('should hide the notice after 3 seconds', async () => {
    renderSwitcher();
    await switchTo('Bình');
    screen.getByText('Đang xem với tài khoản Bình');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_999);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Đang xem với tài khoản Bình');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  // spec web § Quy Tắc Chung: mất mạng → giữ trang + lựa chọn (test case A.1-15)
  it('should show the offline notice and keep the current account when the action fetch fails', async () => {
    selectUser.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSwitcher();

    await switchTo('Bình');

    expect(screen.getByRole('status')).toHaveTextContent('Mất kết nối, vui lòng kiểm tra mạng');
    expect(screen.getByRole('button', { name: 'An' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Mất kết nối, vui lòng kiểm tra mạng');
  });

  it('should show the generic notice when the action responds with an error', async () => {
    selectUser.mockRejectedValue(new Error('An unexpected response was received from the server.'));
    renderSwitcher();

    await switchTo('Bình');

    expect(screen.getByRole('status')).toHaveTextContent('Có lỗi xảy ra, vui lòng thử lại sau');
    expect(screen.getByRole('button', { name: 'An' })).toBeEnabled();
  });

  it('should not offer retry when the action fetch fails offline', async () => {
    selectUser.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSwitcher();

    await switchTo('Bình');

    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  // spec web § Quy Tắc Chung: lỗi hệ thống → câu chung + nút "Thử lại" (test case A.1-16)
  it('should retry the same account and show the switched notice when retry succeeds', async () => {
    selectUser.mockResolvedValueOnce({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    renderSwitcher();
    await switchTo('Bình');
    expect(screen.getByRole('status')).toHaveTextContent('Có lỗi xảy ra, vui lòng thử lại sau');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(selectUser).toHaveBeenCalledTimes(2);
    expect(selectUser).toHaveBeenLastCalledWith(USER_B);
    expect(screen.getByRole('status')).toHaveTextContent('Đang xem với tài khoản Bình');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('should keep the retry button when the retried action rejects again', async () => {
    selectUser.mockRejectedValue(new Error('An unexpected response was received from the server.'));
    renderSwitcher();
    await switchTo('Bình');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(selectUser).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Có lỗi xảy ra, vui lòng thử lại sau');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  // Server Action đổi NETWORK_ERROR của toFetchError (web → api) sang mã này (select-user.test.ts)
  it('should show the generic notice with retry when the server cannot reach api', async () => {
    selectUser.mockResolvedValue({
      success: false,
      code: 'BFF_UPSTREAM_UNAVAILABLE',
      message: 'Upstream API is unavailable',
    });
    renderSwitcher();

    await switchTo('Bình');

    expect(screen.getByRole('status')).toHaveTextContent('Có lỗi xảy ra, vui lòng thử lại sau');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it.each(['USER_NOT_FOUND', 'VALIDATION_FAILED'])(
    'should not offer retry for business error %s',
    async (code) => {
      selectUser.mockResolvedValue({ success: false, code, message: 'Business error' });
      renderSwitcher();

      await switchTo('Bình');

      expect(screen.getByRole('status')).not.toBeEmptyDOMElement();
      expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    },
  );

  it('should drop the stale retry button while a new switch is pending', async () => {
    selectUser.mockResolvedValueOnce({ success: false, code: 'INTERNAL_ERROR', message: 'x' });
    selectUser.mockReturnValueOnce(new Promise(() => undefined)); // lần chọn sau chưa xong
    renderSwitcher();
    await switchTo('Bình');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    vi.useRealTimers();

    await switchTo('Bình');

    expect(selectUser).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'An' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('should hide the retry button while checkout is pending', async () => {
    selectUser.mockResolvedValue({ success: false, code: 'INTERNAL_ERROR', message: 'x' });
    renderSwitcher();
    await switchTo('Bình');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu thanh toán' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent('Có lỗi xảy ra, vui lòng thử lại sau');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  // spec web § Quy Tắc Chung: mất mạng → giữ nguyên trang, không điều hướng
  it('should show the offline notice without refreshing when the user list retry runs offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderSwitcher(USER_A, true);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: 'An' }));

    await user.click(await screen.findByRole('menuitem', { name: 'Thử lại' }));

    expect(screen.getByRole('status')).toHaveTextContent('Mất kết nối, vui lòng kiểm tra mạng');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('should refresh the user list on retry when online', async () => {
    renderSwitcher(USER_A, true);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: 'An' }));

    await user.click(await screen.findByRole('menuitem', { name: 'Thử lại' }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
