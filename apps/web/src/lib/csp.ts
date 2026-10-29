// Tách khỏi proxy để unit test; không import module `server-only`

// HSTS chỉ khi APP_ENV=production (local chạy HTTP) — specs/architecture.md § Cross-cutting Concerns
// Header request mang nonce cho code app đọc lại (layout → StyleNonce)
export const NONCE_HEADER = 'x-nonce';

const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

export function buildCsp(nonce: string, isDev = process.env.NODE_ENV === 'development'): string {
  const devEval = isDev ? " 'unsafe-eval'" : ''; // React dev cần eval
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function buildSecurityHeaders(csp: string, isProduction: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(isProduction ? { 'Strict-Transport-Security': HSTS_VALUE } : {}),
  };
}
