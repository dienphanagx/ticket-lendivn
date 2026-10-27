import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HEALTH_ROUTE, ROUTES } from '@/constants/routes';
import { config, proxy } from '@/proxy';

describe('proxy matcher', () => {
  it.each([HEALTH_ROUTE, '/api/v1/events', '/bff/orders/abc', '/robots.txt', '/favicon.ico'])(
    'should not match %s',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    },
  );

  it.each([ROUTES.HOME, ROUTES.ORDERS, ROUTES.LEDGER, '/healthcare'])('should match %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });
});

describe('proxy security headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should set CSP with nonce, nosniff, referrer policy and no HSTS outside production', () => {
    vi.stubEnv('APP_ENV', 'development');

    const res = proxy(new NextRequest(new URL(ROUTES.HOME, 'http://localhost')));

    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('should set HSTS when APP_ENV is production', () => {
    vi.stubEnv('APP_ENV', 'production');

    const res = proxy(new NextRequest(new URL(ROUTES.HOME, 'http://localhost')));

    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('should generate a new nonce per request', () => {
    const first = proxy(new NextRequest(new URL(ROUTES.HOME, 'http://localhost')));
    const second = proxy(new NextRequest(new URL(ROUTES.HOME, 'http://localhost')));

    expect(first.headers.get('Content-Security-Policy')).not.toBe(
      second.headers.get('Content-Security-Policy'),
    );
  });
});
