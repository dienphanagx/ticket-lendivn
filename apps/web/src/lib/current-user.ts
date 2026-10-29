// Tài khoản đang chọn = cookie `current_user_id` (specs/architecture.md § Auth & Authz); không phải xác thực
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';

import { isEntityId } from '@/lib/ids';

export const CURRENT_USER_COOKIE = 'current_user_id';

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 ngày (spec web § A Quy tắc nghiệp vụ)

// SameSite=Lax: VNPay chuyển về /don-hang/:orderId bằng điều hướng top-level từ site khác
export const currentUserCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_MAX_AGE_SECONDS,
  secure: process.env.APP_ENV === 'production',
});

/** Mã tài khoản trong cookie; thiếu hoặc sai dạng → null (không gửi giá trị lạ sang api) */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const value = (await cookies()).get(CURRENT_USER_COOKIE)?.value;
  return isEntityId(value) ? value : null;
});
