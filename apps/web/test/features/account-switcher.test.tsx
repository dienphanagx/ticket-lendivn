// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider } from '@/components/providers/account-menu-provider';
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

const renderSwitcher = (currentUserId: string | null = USER_A) => {
  const ui = (id: string | null) => (
    <AccountMenuProvider>
      <AccountSwitcher users={users} currentUserId={id} loadFailed={false} stale={false} />
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
});
