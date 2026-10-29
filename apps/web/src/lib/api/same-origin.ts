import 'server-only';

import type { NextRequest } from 'next/server';

import { getSiteUrl } from '@/lib/site-url';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** Chặn request cross-site tới Route Handler `/bff/*` (cookie `current_user_id` tự gửi kèm) */
export async function isSameOrigin(request: NextRequest): Promise<boolean> {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin'; // 'same-site' (subdomain khác) cũng chặn
  if (SAFE_METHODS.has(request.method)) return true; // trình duyệt cũ không gửi Sec-Fetch-*
  return request.headers.get('origin') === (await getSiteUrl()).origin;
}
