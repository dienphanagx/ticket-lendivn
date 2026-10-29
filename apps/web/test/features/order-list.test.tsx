// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ListPagination } from '@/components/common/list-pagination';
import { OrderListItem } from '@/features/orders/components/order-list-item';
import { ResetPageOnAccountChange } from '@/features/orders/components/reset-page-on-account-change';
import { parsePageParam } from '@/lib/pagination';

import '../support/dom';

import { buildOrderSummary, ORDER_ID, USER_A, USER_B } from '../support/factories';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

describe('ListPagination', () => {
  it('should hide when totalPages is 1 or 0', () => {
    const { container, rerender } = render(
      <ListPagination
        pathname="/don-hang"
        meta={{ total: 5, page: 1, limit: 20, totalPages: 1 }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ListPagination
        pathname="/don-hang"
        meta={{ total: 0, page: 1, limit: 20, totalPages: 0 }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('should link previous and next pages from meta', () => {
    render(
      <ListPagination
        pathname="/don-hang"
        meta={{ total: 60, page: 2, limit: 20, totalPages: 3 }}
      />,
    );

    const nav = within(screen.getByRole('navigation', { name: 'Phân trang' }));
    expect(nav.getByRole('link', { name: 'Trang trước' })).toHaveAttribute('href', '/don-hang');
    expect(nav.getByRole('link', { name: 'Trang sau' })).toHaveAttribute(
      'href',
      '/don-hang?page=3',
    );
    expect(nav.getByText('Trang 2/3')).toBeVisible();
  });

  it('should disable next on the last page', () => {
    render(
      <ListPagination
        pathname="/don-hang"
        meta={{ total: 60, page: 3, limit: 20, totalPages: 3 }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });
});

describe('OrderListItem', () => {
  it('should show order fields, hold time for pending and link to the result page', () => {
    render(
      <ul>
        <OrderListItem order={buildOrderSummary()} />
      </ul>,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `/don-hang/${ORDER_ID}`);
    expect(within(link).getByText('Đang chờ xác nhận')).toBeVisible();
    expect(within(link).getByText('2.750.000 ₫')).toBeVisible();
    expect(within(link).getByText('2 vé')).toBeVisible();
    expect(within(link).getByText('Giữ vé đến 10:15')).toBeVisible();
  });

  it('should not show the hold time for a paid order', () => {
    render(
      <ul>
        <OrderListItem
          order={buildOrderSummary({ status: 'PAID', paidAt: '2026-10-29T03:05:00.000Z' })}
        />
      </ul>,
    );

    expect(screen.getByText('Đã thanh toán')).toBeVisible();
    expect(screen.queryByText(/Giữ vé đến/)).not.toBeInTheDocument();
  });
});

describe('parsePageParam', () => {
  it.each([
    [undefined, 1],
    ['3', 3],
    ['0', 1],
    ['-2', 1],
    ['1.5', 1],
    ['abc', 1],
    [['2', '3'], 1],
    ['99999999999999999999', 1],
  ])('should parse %s as %i', (raw, expected) => {
    expect(parsePageParam(raw)).toBe(expected);
  });
});

describe('ResetPageOnAccountChange', () => {
  const ui = (userId: string, page: number) => (
    <ResetPageOnAccountChange userId={userId} page={page} pathname="/don-hang" />
  );

  it('should go back to page 1 when the account changes on a later page', () => {
    const { rerender } = render(ui(USER_A, 3));
    rerender(ui(USER_A, 3));
    expect(replace).not.toHaveBeenCalled();

    rerender(ui(USER_B, 3));

    expect(replace).toHaveBeenCalledExactlyOnceWith('/don-hang');
  });

  it('should not navigate when the account changes on page 1', () => {
    replace.mockReset();
    const { rerender } = render(ui(USER_A, 1));

    rerender(ui(USER_B, 1));

    expect(replace).not.toHaveBeenCalled();
  });
});
