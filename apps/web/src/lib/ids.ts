// Dạng mã chung của spec api (người dùng, tin bán): 1–64 ký tự chữ, số, `_`, `-` (apps/api/src/lib/ids.ts)
export const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const ENTITY_ID_MAX_LENGTH = 64;

export const isEntityId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= ENTITY_ID_MAX_LENGTH &&
  ENTITY_ID_PATTERN.test(value);
