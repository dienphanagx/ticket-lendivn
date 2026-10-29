import { apiFetchAnonymous } from '@/lib/api/api-fetch';
import { getCurrentUserId } from '@/lib/current-user';
import { AppError } from '@/lib/errors';

import { listUsers } from '../api';
import type { UserSummary } from '../types';
import { AccountSwitcher } from './account-switcher';

type LoadResult = { users: UserSummary[]; loadFailed: boolean };

async function loadUsers(): Promise<LoadResult> {
  try {
    const { data } = await listUsers(apiFetchAnonymous);
    return { users: data, loadFailed: false };
  } catch (err) {
    // Lỗi danh sách tài khoản không làm hỏng cả trang: dropdown báo lỗi + "Thử lại" (spec web § A)
    if (!(err instanceof AppError)) throw err;
    return { users: [], loadFailed: true };
  }
}

/** Server Component nạp danh sách tài khoản cho dropdown trên header */
export async function AccountSwitcherLoader() {
  const [currentUserId, { users, loadFailed }] = await Promise.all([
    getCurrentUserId(),
    loadUsers(),
  ]);
  const stale = !loadFailed && currentUserId !== null && !users.some((u) => u.id === currentUserId);
  return (
    <AccountSwitcher
      users={users}
      currentUserId={stale ? null : currentUserId}
      loadFailed={loadFailed}
      stale={stale}
    />
  );
}
