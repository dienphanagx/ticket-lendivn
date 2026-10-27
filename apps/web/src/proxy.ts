import { NextResponse, type NextRequest } from 'next/server';

import { buildCsp, buildSecurityHeaders } from '@/lib/csp';

// Không auth, không locale: proxy chỉ sinh CSP nonce + security header mỗi request
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Header REQUEST: Next parse nonce từ CSP để gắn vào script framework; x-nonce cho code app đọc lại
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const securityHeaders = buildSecurityHeaders(csp, process.env.APP_ENV === 'production');
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Loại: api, Route Handler /bff, health, asset _next/_vercel, mọi path có dấu chấm (robots.txt, favicon.ico…)
  matcher: ['/((?!(?:api|bff|health|_next|_vercel)(?:/|$)|.*\\..*).*)'],
};
