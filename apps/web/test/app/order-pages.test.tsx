import { isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildOrderDetail,
  buildOrderSummary,
  jsonResponse,
  ORDER_ID,
  USER_A,
  USER_B,
  USER_HEX,
} from '../support/factories';

vi.mock('server-only', () => ({}));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

class NavigationSignal extends Error {
  constructor(
    readonly kind: 'notFound' | 'redirect',
    readonly url?: string,
  ) {
    super(kind);
  }
}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NavigationSignal('notFound');
  },
  redirect: (url: string) => {
    throw new NavigationSignal('redirect', url);
  },
  RedirectType: { replace: 'replace', push: 'push' },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: OrderResultPage } = await import('@/app/don-hang/[orderId]/page');
const { OrderListSection } = await import('@/features/orders/components/order-list-section');

const fetchMock = vi.fn<typeof fetch>();
const SECURE_HASH = 'a'.repeat(128);
const event = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  slug: 'dem-nhac-mua-thu',
  name: 'Đêm nhạc mùa thu',
  venue: 'Nhà hát Lớn',
  startsAt: '2026-11-20T12:30:00.000Z',
  status: 'ON_SALE',
  completedAt: null,
  listingCount: 1,
  availableQuantity: 3,
  minUnitPrice: 1_250_000,
  escrowTotal: 0,
  pendingOrderCount: 0,
  sellerCount: 1,
};

function renderPage(searchParams: Record<string, string | string[]> = {}, orderId = ORDER_ID) {
  return OrderResultPage({
    params: Promise.resolve({ orderId }),
    searchParams: Promise.resolve(searchParams),
  });
}

async function navigation(promise: Promise<unknown>): Promise<NavigationSignal> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof NavigationSignal))
    throw new Error(`Expected navigation, got ${String(err)}`);
  return err;
}

const callsTo = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname === `/api${path}`);

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.value = USER_A;
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/api/v1/payments/vnpay/return') {
      return jsonResponse({ data: { orderId: ORDER_ID, status: 'PAID', result: 'RECORDED' } });
    }
    if (pathname === `/api/v1/orders/${ORDER_ID}`)
      return jsonResponse({ data: buildOrderDetail() });
    if (pathname === '/api/v1/events') return jsonResponse({ data: [event] });
    throw new Error(`Unexpected ${pathname}`);
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('/don-hang/[orderId] — return from VNPay', () => {
  it('should forward only vnp_* params as JSON then redirect to the URL without query', async () => {
    const signal = await navigation(
      renderPage({
        vnp_TxnRef: ORDER_ID,
        vnp_Amount: '275000000',
        vnp_ResponseCode: '00',
        vnp_OrderInfo: 'Thanh toan don 261029ABCDE12345',
        vnp_SecureHash: SECURE_HASH,
        utm_source: 'mail',
      }),
    );

    expect(signal).toMatchObject({ kind: 'redirect', url: `/don-hang/${ORDER_ID}` });
    const [call] = callsTo('/v1/payments/vnpay/return');
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      vnp_TxnRef: ORDER_ID,
      vnp_Amount: '275000000',
      vnp_ResponseCode: '00',
      vnp_OrderInfo: 'Thanh toan don 261029ABCDE12345',
      vnp_SecureHash: SECURE_HASH,
    });
    // Ghi nhận không phụ thuộc tài khoản đang chọn
    expect(new Headers(call?.[1]?.headers).has('X-User-Id')).toBe(false);
    expect(callsTo(`/v1/orders/${ORDER_ID}`)).toHaveLength(0);
  });

  it('should redirect without forwarding when vnp_SecureHash is missing', async () => {
    const signal = await navigation(renderPage({ vnp_TxnRef: ORDER_ID, vnp_ResponseCode: '00' }));

    expect(signal).toMatchObject({ kind: 'redirect', url: `/don-hang/${ORDER_ID}` });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      '422 signature invalid',
      async () => jsonResponse({ code: 'PAYMENT_SIGNATURE_INVALID', message: 'x' }, 422),
    ],
    [
      '404 order not found',
      async () => jsonResponse({ code: 'ORDER_NOT_FOUND', message: 'x' }, 404),
    ],
    ['network error', async () => Promise.reject(new TypeError('fetch failed'))],
    [
      '15 second timeout',
      async () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    ],
  ])('should still redirect when forwarding fails with %s', async (_case, reply) => {
    fetchMock.mockImplementation(reply);

    const signal = await navigation(
      renderPage({ vnp_TxnRef: ORDER_ID, vnp_SecureHash: SECURE_HASH }),
    );

    expect(signal).toMatchObject({ kind: 'redirect', url: `/don-hang/${ORDER_ID}` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should forward and redirect even when no account is chosen', async () => {
    cookieStore.value = undefined;

    const signal = await navigation(
      renderPage({ vnp_TxnRef: ORDER_ID, vnp_SecureHash: SECURE_HASH }),
    );

    expect(signal.kind).toBe('redirect');
    expect(callsTo('/v1/payments/vnpay/return')).toHaveLength(1);
  });

  it.each(['short', 'ABC-DEF-123456', 'A'.repeat(21)])(
    'should answer 404 for malformed order id %s without calling api',
    async (orderId) => {
      const signal = await navigation(
        renderPage({ vnp_TxnRef: orderId, vnp_SecureHash: SECURE_HASH }, orderId),
      );

      expect(signal.kind).toBe('notFound');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('/don-hang/[orderId] — status page', () => {
  it('should render the order of the current buyer with the event link', async () => {
    const element = (await renderPage()) as ReactElement<Record<string, unknown>>;

    expect(element.props).toMatchObject({
      initialOrder: buildOrderDetail(),
      currentUserId: USER_A,
      eventHref: '/su-kien/dem-nhac-mua-thu',
    });
  });

  it('should render the order when the buyer id differs only in letter case', async () => {
    cookieStore.value = USER_HEX;
    const order = buildOrderDetail({ buyer: { id: USER_HEX.toUpperCase(), displayName: 'An' } });
    fetchMock.mockImplementation(async (input) =>
      new URL(String(input)).pathname === '/api/v1/events'
        ? jsonResponse({ data: [event] })
        : jsonResponse({ data: order }),
    );

    const element = (await renderPage()) as ReactElement<Record<string, unknown>>;

    expect(element.props).toMatchObject({ initialOrder: order });
  });

  it('should answer 404 when the order belongs to another buyer', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ data: buildOrderDetail({ buyer: { id: USER_B, displayName: 'Bình' } }) }),
    );

    expect((await navigation(renderPage())).kind).toBe('notFound');
  });

  it('should answer 404 when api has no such order', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ code: 'ORDER_NOT_FOUND', message: 'x' }, 404),
    );

    expect((await navigation(renderPage())).kind).toBe('notFound');
  });

  it('should ask for an account without calling the order api', async () => {
    cookieStore.value = undefined;

    const element = await renderPage();

    expect(isValidElement(element)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should throw system errors to error.tsx', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ code: 'INTERNAL_ERROR', message: 'x' }, 500),
    );

    await expect(renderPage()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('/don-hang list section', () => {
  const list = (total: number, page: number, count: number) =>
    jsonResponse({
      data: Array.from({ length: count }, (_, i) =>
        buildOrderSummary({ id: `261029ORDER${String(i).padStart(5, '0')}` }),
      ),
      meta: { total, page, limit: 20, totalPages: Math.ceil(total / 20) },
    });

  it('should request the current buyer with page and limit 20', async () => {
    fetchMock.mockImplementation(async () => list(45, 2, 20));

    const element = (await OrderListSection({ userId: USER_A, page: 2 })) as ReactElement;

    expect(isValidElement(element)).toBe(true);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/v1/orders');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      buyerId: USER_A,
      page: '2',
      limit: '20',
    });
  });

  it('should redirect to page 1 when page exceeds totalPages', async () => {
    fetchMock.mockImplementation(async () => list(25, 5, 0));

    const signal = await navigation(OrderListSection({ userId: USER_A, page: 5 }));

    expect(signal).toMatchObject({ kind: 'redirect', url: '/don-hang' });
  });

  it('should not redirect an empty list (totalPages 0)', async () => {
    fetchMock.mockImplementation(async () => list(0, 3, 0));

    await expect(OrderListSection({ userId: USER_A, page: 3 })).resolves.toBeTruthy();
  });
});
