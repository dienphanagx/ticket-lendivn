import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { AppError } from '../../lib/app-error.js';
import { entityIdSchema, isUuid } from '../../lib/ids.js';
import { findUserId } from './repository.js';

/** Header người dùng đang thao tác (spec api § Quy Tắc Chung); Fastify chuẩn hoá tên header về chữ thường. */
export const USER_ID_HEADER = 'x-user-id';

export const USER_ERRORS = {
  NOT_FOUND: { code: 'USER_NOT_FOUND', message: 'User not found', httpStatus: 404 },
} as const;

// `looseObject`: giữ nguyên các header khác trên request sau khi validate
export const requiredUserHeaders = z.looseObject({ [USER_ID_HEADER]: entityIdSchema });
export const optionalUserHeaders = z.looseObject({ [USER_ID_HEADER]: entityIdSchema.optional() });

/**
 * Mã đúng dạng (đã qua schema header) → kiểm tồn tại; không có → `USER_NOT_FOUND`.
 * Chỉ để biết ai đang thao tác, không phải xác thực hay phân quyền.
 */
export async function resolveCurrentUser(db: Database, userId: string): Promise<string> {
  const storedId = isUuid(userId) ? await findUserId(db, userId) : undefined;
  if (storedId === undefined) {
    throw new AppError(USER_ERRORS.NOT_FOUND);
  }
  // Trả id từ DB để so `sellerId === buyerId` đúng cả khi client gửi UUID chữ hoa
  return storedId;
}
