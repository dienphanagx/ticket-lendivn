'use client';

// Radix (Dialog, DropdownMenu…) khoá cuộn qua react-remove-scroll → react-style-singleton chèn <style>;
// thư viện đó gắn nonce lấy từ `get-nonce`. Thiếu nonce thì CSP `style-src 'nonce-…'` (src/lib/csp.ts)
// chặn style → nền không bị khoá cuộn khi mở overlay.
import { getNonce, setNonce } from 'get-nonce';

interface StyleNonceProps {
  nonce: string | undefined;
}

/** Đặt ở đầu <body>, trước mọi primitive Radix; gọi trong render để có nonce trước lần mở overlay đầu */
export function StyleNonce({ nonce }: StyleNonceProps) {
  // Chỉ nhận nonce lần đầu (lúc hydrate = nonce trong CSP của document). Server Action / router.refresh
  // dựng lại root layout bằng nonce của request mới, CSP của trang vẫn là nonce cũ → <style> bị chặn
  if (nonce && typeof document !== 'undefined' && getNonce() === undefined) setNonce(nonce);
  return null;
}
