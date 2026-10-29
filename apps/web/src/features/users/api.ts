import type { Http } from '@/lib/errors';

import { userListResponseSchema } from './types';

/** `GET /v1/users` — người dùng mẫu A–Z, không phân trang */
export const listUsers = (http: Http) => http('/v1/users', userListResponseSchema);
