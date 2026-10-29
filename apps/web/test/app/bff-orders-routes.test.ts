import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BFF_ROUTES } from '@/constants/routes';

import {
  buildOrderDetail,
  jsonResponse,
  ORDER_ID,
  USER_A,
  USER_B,
  USER_HEX,
} from '../support/factories';

vi.mock('server-only', () => ({}));
// `connection()` cần request scope của Next; test gọi handler trực tiếp
vi.mock('@/lib/site-url', () => ({ getSiteUrl: async () => new URL('http://localhost') }));
const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'current_user_id' && cookieStore.value ? { value: cookieStore.value } : undefined,
  }),
}));

const { POST: createOrderRoute } = await import('@/app/bff/orders/route');
const { POST: paymentUrlRoute } = await import('@/app/bff/orders/[orderId]/payment-url/route');
const { GET: orderRoute } = await import('@/app/bff/orders/[orderId]/route');

const LISTING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = '3b241101-e2bb-4255-8caf-4136c566a962';
const PAYMENT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=x';
const fetchMock = vi.fn<typeof fetch>();

const snapshot = {
  id: ORDER_ID,
  status: 'PENDING_PAYMENT',
  listingId: LISTING_ID,
  eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  quantity: 2,
  unitPrice: 1_250_000,
  subtotal: 2_500_000,
  buyerFee: 250_000,
  buyerTotal: 2_750_000,
  createdAt: '2026-10-29T03:00:00.000Z',
  holdExpiresAt: '2026-10-29T03:15:00.000Z',
};

const sameOrigin = { 'sec-fetch-site': 'same-origin' };

function postOrder(body: unknown, headers: Record<string, string> = {}) {
  return createOrderRoute(
    new NextRequest(`http://localhost${BFF_ROUTES.ORDERS}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': KEY,
        ...sameOrigin,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function postPaymentUrl(headers: Record<string, string> = {}, orderId = ORDER_ID) {
  return paymentUrlRoute(
    new NextRequest(`http://localhost${BFF_ROUTES.ORDER_PAYMENT_URL(orderId)}`, {
      method: 'POST',
      headers: { ...sameOrigin, ...headers },
    }),
    { params: Promise.resolve({ orderId }) },
  );
}

function getOrder(headers: Record<string, string> = {}, orderId = ORDER_ID) {
  return orderRoute(
    new NextRequest(`http://localhost${BFF_ROUTES.ORDER(orderId)}`, {
      headers: { ...sameOrigin, ...headers },
    }),
    { params: Promise.resolve({ orderId }) },
  );
}

const lastApiCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(url), init, headers: new Headers(init?.headers) };
};

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.test/api');
  vi.stubEnv('SITE_URL', 'http://localhost');
  vi.stubGlobal('fetch', fetchMock);
  cookieStore.value = USER_A;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('POST /bff/orders', () => {
  it('should create the order with Idempotency-Key and X-User-Id from the cookie', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: snapshot }, 201));

    const res = await postOrder({ listingId: LISTING_ID, quantity: 2 });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: snapshot });
    const { url, init, headers } = lastApiCall();
    expect(url).toBe('http://api.test/api/v1/orders');
    expect(init?.method).toBe('POST');
    expect(headers.get('Idempotency-Key')).toBe(KEY);
    expect(headers.get('X-User-Id')).toBe(USER_A);
    expect(JSON.parse(String(init?.body))).toEqual({ listingId: LISTING_ID, quantity: 2 });
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['cross-site', 'same-site'])('should reject Sec-Fetch-Site %s with 403', async (site) => {
    const res = await postOrder({ listingId: LISTING_ID, quantity: 1 }, { 'sec-fetch-site': site });

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should reject a foreign Origin when Sec-Fetch-Site is missing', async () => {
    const res = createOrderRoute(
      new NextRequest(`http://localhost${BFF_ROUTES.ORDERS}`, {
        method: 'POST',
        headers: { 'idempotency-key': KEY, origin: 'https://evil.example' },
        body: JSON.stringify({ listingId: LISTING_ID, quantity: 1 }),
      }),
    );

    expect((await res).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing key', { listingId: LISTING_ID, quantity: 1 }, { 'idempotency-key': '' }],
    ['non-uuid key', { listingId: LISTING_ID, quantity: 1 }, { 'idempotency-key': 'abc12345' }],
    ['quantity 0', { listingId: LISTING_ID, quantity: 0 }, {}],
    ['fractional quantity', { listingId: LISTING_ID, quantity: 1.5 }, {}],
    ['bad listing id', { listingId: '../admin', quantity: 1 }, {}],
    ['not json', '{', {}],
  ])('should reject %s with 400 without calling api', async (_case, body, headers) => {
    const res = await postOrder(body, headers);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return 401 USER_NOT_SELECTED without an account cookie', async () => {
    cookieStore.value = undefined;

    const res = await postOrder({ listingId: LISTING_ID, quantity: 1 });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: 'USER_NOT_SELECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'INSUFFICIENT_QUANTITY', { available: 1 }],
    [409, 'EVENT_NOT_ON_SALE', undefined],
    [422, 'CANNOT_BUY_OWN_LISTING', undefined],
    [404, 'LISTING_NOT_FOUND', undefined],
    [404, 'USER_NOT_FOUND', undefined],
  ])('should pass through api %i %s', async (status, code, details) => {
    fetchMock.mockResolvedValue(jsonResponse({ code, message: 'x', details }, status));

    const res = await postOrder({ listingId: LISTING_ID, quantity: 3 });

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toEqual(
      details ? { code, message: 'x', details } : { code, message: 'x' },
    );
  });

  it('should return 504 when the api does not answer within 15 seconds', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

    const res = await postOrder({ listingId: LISTING_ID, quantity: 1 });

    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({ code: 'BFF_UPSTREAM_TIMEOUT' });
  });

  it('should return 503 when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await postOrder({ listingId: LISTING_ID, quantity: 1 });

    expect(res.status).toBe(503);
  });
});

describe('POST /bff/orders/:orderId/payment-url', () => {
  const paymentOk = () =>
    jsonResponse({ data: { paymentUrl: PAYMENT_URL, expiresAt: snapshot.holdExpiresAt } });
  const paymentCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/payment-url'));

  /** api giả: `GET /v1/orders/:id` trả đơn (mặc định của USER_A), `POST …/payment-url` trả `payment` */
  function mockApi(payment: () => Response = paymentOk, order = buildOrderDetail()) {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith('/payment-url') ? payment() : jsonResponse({ data: order }),
    );
  }

  it('should check the buyer then send clientIp from X-Forwarded-For and locale vn', async () => {
    mockApi();

    const res = await postPaymentUrl({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: { paymentUrl: PAYMENT_URL, expiresAt: snapshot.holdExpiresAt },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://api.test/api/v1/orders/${ORDER_ID}`);
    const { url, init } = lastApiCall();
    expect(url).toBe(`http://api.test/api/v1/orders/${ORDER_ID}/payment-url`);
    expect(JSON.parse(String(init?.body))).toEqual({ clientIp: '203.0.113.7', locale: 'vn' });
  });

  it('should answer 404 ORDER_NOT_FOUND without creating a url when another account bought it', async () => {
    mockApi(paymentOk, buildOrderDetail({ buyer: { id: USER_B, displayName: 'Bình' } }));

    const res = await postPaymentUrl();

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: 'ORDER_NOT_FOUND',
      message: 'Order not found',
    });
    expect(paymentCalls()).toHaveLength(0);
  });

  it('should accept the buyer id in a different letter case', async () => {
    cookieStore.value = USER_HEX;
    mockApi(
      paymentOk,
      buildOrderDetail({ buyer: { id: USER_HEX.toUpperCase(), displayName: 'An' } }),
    );

    expect((await postPaymentUrl()).status).toBe(200);
    expect(paymentCalls()).toHaveLength(1);
  });

  it('should pass through api 404 when the order does not exist', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'ORDER_NOT_FOUND', message: 'Order not found' }, 404),
    );

    expect((await postPaymentUrl()).status).toBe(404);
    expect(paymentCalls()).toHaveLength(0);
  });

  it.each([
    [{}, '127.0.0.1'],
    [{ 'x-forwarded-for': 'not-an-ip' }, '127.0.0.1'],
    [{ 'x-forwarded-for': '::ffff:198.51.100.4' }, '198.51.100.4'],
    [{ 'x-real-ip': '2001:db8::1' }, '2001:db8::1'],
  ])('should derive a valid clientIp from %o', async (headers, expected) => {
    mockApi();

    await postPaymentUrl(headers);

    expect(JSON.parse(String(lastApiCall().init?.body))).toMatchObject({ clientIp: expected });
  });

  it('should pass through 503 PAYMENT_GATEWAY_UNAVAILABLE', async () => {
    mockApi(() =>
      jsonResponse({ code: 'PAYMENT_GATEWAY_UNAVAILABLE', message: 'not configured' }, 503),
    );

    const res = await postPaymentUrl();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: 'PAYMENT_GATEWAY_UNAVAILABLE' });
  });

  it('should return 502 when the api returns a non-http payment url', async () => {
    mockApi(() =>
      jsonResponse({
        data: { paymentUrl: 'javascript:alert(1)', expiresAt: snapshot.holdExpiresAt },
      }),
    );

    expect((await postPaymentUrl()).status).toBe(502);
  });

  it('should reject a malformed order id, cross-site call and missing account', async () => {
    expect((await postPaymentUrl({}, 'short')).status).toBe(400);
    expect((await postPaymentUrl({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    cookieStore.value = undefined;
    expect((await postPaymentUrl()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /bff/orders/:orderId', () => {
  it('should return the order of the current buyer without paymentUrl', async () => {
    const order = buildOrderDetail();
    fetchMock.mockResolvedValue(jsonResponse({ data: { ...order, paymentUrl: PAYMENT_URL } }));

    const res = await getOrder();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: order });
    expect(lastApiCall().url).toBe(`http://api.test/api/v1/orders/${ORDER_ID}`);
  });

  it('should answer 404 ORDER_NOT_FOUND when another account bought the order', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: buildOrderDetail({ buyer: { id: USER_B, displayName: 'Bình' } }) }),
    );

    const res = await getOrder();

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      code: 'ORDER_NOT_FOUND',
      message: 'Order not found',
    });
  });

  it('should accept the buyer id in a different letter case', async () => {
    cookieStore.value = USER_HEX;
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: buildOrderDetail({ buyer: { id: USER_HEX.toUpperCase(), displayName: 'An' } }),
      }),
    );

    expect((await getOrder()).status).toBe(200);
  });

  it('should pass through api 404 for an unknown order', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'ORDER_NOT_FOUND', message: 'Order not found' }, 404),
    );

    expect((await getOrder()).status).toBe(404);
  });

  it('should reject a malformed id, cross-site call and missing account without calling api', async () => {
    expect((await getOrder({}, 'bad-id!')).status).toBe(400);
    expect((await getOrder({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    cookieStore.value = undefined;
    expect((await getOrder()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should return 504 on api timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

    expect((await getOrder()).status).toBe(504);
  });
});
