'use client';

// Radix (Dialog, DropdownMenu…) khoá cuộn qua react-remove-scroll → react-style-singleton chèn <style>;
// thư viện đó gắn nonce lấy từ `get-nonce`. Thiếu nonce thì CSP `style-src 'nonce-…'` (src/lib/csp.ts)
// chặn style → nền không bị khoá cuộn khi mở overlay.
import { setNonce } from 'get-nonce';

interface StyleNonceProps {
  nonce: string | undefined;
}

/** Đặt ở đầu <body>, trước mọi primitive Radix; gọi trong render để có nonce trước lần mở overlay đầu */
export function StyleNonce({ nonce }: StyleNonceProps) {
  if (nonce && typeof document !== 'undefined') setNonce(nonce);
  return null;
}
