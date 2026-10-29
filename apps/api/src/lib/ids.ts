import * as z from 'zod';

/** Dạng mã chung của spec api (người dùng, tin bán): 1–64 ký tự chữ, số, `_`, `-`. */
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const ENTITY_ID_MAX_LENGTH = 64;

// Cột `uuid` của PostgreSQL nhận dạng 8-4-4-4-12 hex; mã đúng dạng spec nhưng không phải UUID
// chắc chắn không có trong DB → coi là không tồn tại thay vì để PostgreSQL ném lỗi cast
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const entityIdSchema = z.string().min(1).max(ENTITY_ID_MAX_LENGTH).regex(ENTITY_ID_PATTERN);

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
