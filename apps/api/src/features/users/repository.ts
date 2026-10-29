import type { Database } from '../../db/client.js';

export interface UserSummaryRow {
  id: string;
  displayName: string;
  hasListings: boolean;
}

/** Người dùng mẫu A–Z; cờ có tin bán tính bằng EXISTS, không lưu cột (specs/database.md § `users`). */
export async function listUsers(db: Database): Promise<UserSummaryRow[]> {
  return db
    .selectFrom('users as u')
    .select((eb) => [
      'u.id',
      'u.display_name as displayName',
      // PostgreSQL trả `boolean` cho EXISTS; SqlBool của Kysely gồm cả number cho MySQL / SQLite
      eb
        .exists(eb.selectFrom('listings as l').select('l.id').whereRef('l.seller_id', '=', 'u.id'))
        .$castTo<boolean>()
        .as('hasListings'),
    ])
    .orderBy('u.display_name')
    .orderBy('u.id')
    .execute();
}

/** Id dạng chuẩn của DB (chữ thường): `uuid` so khớp không phân biệt hoa thường nên không trả input. */
export async function findUserId(db: Database, userId: string): Promise<string | undefined> {
  const row = await db.selectFrom('users').select('id').where('id', '=', userId).executeTakeFirst();
  return row?.id;
}
