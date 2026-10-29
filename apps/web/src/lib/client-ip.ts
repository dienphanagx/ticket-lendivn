// IP trình duyệt cho `vnp_IpAddr` (body `clientIp` của api payment-url): chỉ để cổng ghi nhận, không dùng phân quyền
import 'server-only';

import { isIP } from 'node:net';

// api chỉ nhận IPv4 / IPv6 hợp lệ; thiếu header (chạy sau proxy lạ, test) → loopback thay vì để api từ chối
export const FALLBACK_CLIENT_IP = '127.0.0.1';

const IPV4_MAPPED_PREFIX = '::ffff:';
const NOT_AN_IP = 0;

function normalize(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  // Socket dual-stack báo IPv4 dạng `::ffff:1.2.3.4` → gửi cổng dạng IPv4
  if (value.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)) {
    const v4 = value.slice(IPV4_MAPPED_PREFIX.length);
    if (isIP(v4) === 4) return v4;
  }
  return isIP(value) === NOT_AN_IP ? null : value;
}

/** `X-Forwarded-For` (mục đầu = client) → `X-Real-IP` → loopback */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0];
  return (
    normalize(forwarded) ?? normalize(headers.get('x-real-ip') ?? undefined) ?? FALLBACK_CLIENT_IP
  );
}
