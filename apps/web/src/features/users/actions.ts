'use server';

import { cookies } from 'next/headers';

import { ERROR_CODES } from '@/constants/error-codes';
import { apiFetchAnonymous } from '@/lib/api/api-fetch';
import { CURRENT_USER_COOKIE, currentUserCookieOptions } from '@/lib/current-user';
import { AppError } from '@/lib/errors';
import { isEntityId } from '@/lib/ids';

import { listUsers } from './api';

type Failure = { success: false; code: string; message: string };
export type SelectUserState = { success: true; data: { displayName: string } } | Failure;

const fail = (code: string, message: string): Failure => ({ success: false, code, message });

/**
 * Lưu tài khoản đang chọn (spec web § A): mã phải có trong danh sách api trả về lúc chọn.
 * Set cookie trong Server Action → Next dựng lại trang hiện tại theo cookie mới.
 */
export async function selectUser(userId: unknown): Promise<SelectUserState> {
  if (!isEntityId(userId)) return fail(ERROR_CODES.VALIDATION_FAILED, 'User id is invalid');
  try {
    // Không gắn X-User-Id cũ: cookie có thể đang trỏ tới tài khoản không còn tồn tại
    const { data: users } = await listUsers(apiFetchAnonymous);
    const user = users.find((u) => u.id === userId);
    if (!user) return fail(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    (await cookies()).set(CURRENT_USER_COOKIE, user.id, currentUserCookieOptions());
    return { success: true, data: { displayName: user.displayName } };
  } catch (err) {
    if (!(err instanceof AppError)) throw err; // lỗi không lường trước → error.tsx
    return fail(err.code, err.message);
  }
}

/** Xoá lựa chọn khi tài khoản đã lưu không còn tồn tại (dữ liệu mẫu được nạp lại) */
export async function clearCurrentUser(): Promise<void> {
  (await cookies()).delete(CURRENT_USER_COOKIE);
}
