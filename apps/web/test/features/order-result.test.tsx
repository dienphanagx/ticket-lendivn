// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenuProvider } from '@/components/providers/account-menu-provider';
import { OrderResult } from '@/features/orders/components/order-result';
import type { OrderDetail } from '@/features/orders/types';

import '../support/dom';

import { buildOrderDetail, jsonResponse, ORDER_ID, USER_A } from '../support/factories';

const fetchMock = vi.fn<typeof fetch>();
const pending = buildOrderDetail();
const paid = buildOrderDetail({
  status: 'PAID',
  paidAt: '2026-10-29T03:05:00.000Z',
  retryAfterSeconds: null,
});

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AccountMenuProvider>{children}</AccountMenuProvider>
    </QueryClientProvider>
  );
}

const renderResult = (order: OrderDetail = pending) =>
  render(
    <OrderResult initialOrder={order} currentUserId={USER_A} eventHref="/su-kien/dem-nhac" />,
    {
      wrapper: Providers,
    },
  );

const FLUSH_ROUNDS = 5;

/** Chạy timer rồi flush chuỗi promise của fetch + parse body + render React (không đẩy đồng hồ thêm) */
async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  for (let i = 0; i < FLUSH_ROUNDS; i += 1) await act(() => vi.advanceTimersByTimeAsync(0));
}

beforeEach(() => {
  vi.useFakeTimers();
  // notifyManager mặc định báo kết quả query qua setTimeout(0) (bị fake) → báo qua microtask
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async () => jsonResponse({ data: pending }));
});

afterEach(() => {
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('OrderResult', () => {
  it('should show pending block with hold time and order details without fetching on mount', () => {
    renderResult();

    expect(screen.getByText('Đang chờ xác nhận thanh toán từ cổng…')).toBeVisible();
    expect(screen.getByText('Giữ vé đến 10:15')).toBeVisible();
    expect(screen.getByText(ORDER_ID)).toBeVisible();
    expect(screen.getByText('2.750.000 ₫')).toBeVisible();
    expect(screen.queryByRole('link', { name: /tiếp tục/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should poll after retryAfterSeconds and replace the block when the order is paid', async () => {
    renderResult();

    await advance(2_900);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/bff/orders/${ORDER_ID}`);

    fetchMock.mockImplementation(async () => jsonResponse({ data: paid }));
    await advance(3_000);

    expect(screen.getByText('Thanh toán thành công')).toBeVisible();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Thanh toán thành công');
    const calls = fetchMock.mock.calls.length;
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(calls); // hết retryAfterSeconds → dừng
  });

  it('should follow the retryAfterSeconds of the latest successful response', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ data: { ...pending, retryAfterSeconds: 10 } }),
    );
    renderResult();

    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(9_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should keep the block and keep polling after a failed poll', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderResult();

    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Đang chờ xác nhận thanh toán từ cổng…')).toBeVisible();
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should stop after 120 seconds and restart the cycle with "Kiểm tra lại"', async () => {
    renderResult();

    await advance(120_000);
    expect(
      screen.getByText(
        'Chưa nhận được xác nhận từ cổng thanh toán. Kết quả sẽ được cập nhật tại trang Đơn hàng.',
      ),
    ).toBeVisible();
    const stoppedAt = fetchMock.mock.calls.length;
    expect(stoppedAt).toBeGreaterThanOrEqual(39);
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(stoppedAt);

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(stoppedAt + 1); // hỏi lại ngay
    expect(screen.queryByRole('button', { name: 'Kiểm tra lại' })).not.toBeInTheDocument();
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(stoppedAt + 2);
    await advance(120_000);
    expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeVisible();
  });

  it('should replace the page with "Không tìm thấy đơn hàng" and stop polling on 404', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ code: 'ORDER_NOT_FOUND', message: 'Order not found' }, 404),
    );
    renderResult();

    await advance(3_000);

    expect(screen.getByText('Không tìm thấy đơn hàng')).toBeVisible();
    expect(screen.queryByText(ORDER_ID)).not.toBeInTheDocument();
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'FAILED',
      'Thanh toán không thành công. Vé đã được trả lại cho tin bán.',
      'Quay lại sự kiện',
      '/su-kien/dem-nhac',
    ],
    [
      'EXPIRED',
      'Đơn đã hết hạn giữ chỗ. Vé đã được trả lại cho tin bán.',
      'Quay lại sự kiện',
      '/su-kien/dem-nhac',
    ],
    [
      'REFUND_REQUIRED',
      'Đã nhận thanh toán nhưng vé không còn đủ. 2.750.000 ₫ sẽ được hoàn lại và đang hiển thị ở số dư khả dụng của bạn.',
      'Xem tài khoản',
      '/tai-khoan',
    ],
    ['PAID', 'Thanh toán thành công', 'Xem đơn hàng', '/don-hang'],
  ] as const)('should render the %s block without polling', async (status, text, action, href) => {
    renderResult(
      buildOrderDetail({
        status,
        retryAfterSeconds: null,
        paidAt: status === 'PAID' ? paid.paidAt : null,
      }),
    );

    expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByRole('link', { name: action })).toHaveAttribute('href', href);
    await advance(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
