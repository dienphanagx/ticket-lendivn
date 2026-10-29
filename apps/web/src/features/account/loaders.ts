// Nạp dữ liệu trang Tài khoản (Server Component)
import 'server-only';

import { ERROR_CODES } from '@/constants/error-codes';
import { listUsers } from '@/features/users/api';
import { apiFetch, apiFetchAnonymous, isApiError } from '@/lib/api/api-fetch';

import { getMyBalance } from './api';

/** Tên hiển thị của tài khoản đang chọn; lỗi danh sách tài khoản không làm hỏng trang số dư */
async function findDisplayName(userId: string): Promise<string | null> {
  try {
    const { data } = await listUsers(apiFetchAnonymous);
    return data.find((user) => user.id.toLowerCase() === userId.toLowerCase())?.displayName ?? null;
  } catch {
    return null;
  }
}

/** `USER_NOT_FOUND` = cookie trỏ tới tài khoản không còn (dữ liệu mẫu nạp lại) → null */
export async function loadAccountBalance(userId: string, page: number) {
  const [balance, displayName] = await Promise.all([
    getMyBalance(apiFetch, page).catch((err: unknown) => {
      if (isApiError(err, ERROR_CODES.USER_NOT_FOUND)) return null;
      throw err; // lỗi hệ thống / timeout → error.tsx
    }),
    findDisplayName(userId),
  ]);
  return balance ? { ...balance, displayName } : null;
}
