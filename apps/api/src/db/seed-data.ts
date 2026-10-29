import type { Database } from './client.js';
import type { NewEvent, NewListing, NewUser } from './types.js';

// Dữ liệu mẫu (specs/database.md § Conventions → Seed data): UUID cố định để cookie `current_user_id`
// còn khớp sau khi chạy lại seed. Không seed đơn hay bút toán — sổ cái chỉ sinh từ luồng thật.

export const SEED_USER_IDS = {
  /** Người bán. */
  AN: '019a2a00-0000-7000-8000-000000000001',
  /** Người bán. */
  BINH: '019a2a00-0000-7000-8000-000000000002',
  /** Vừa bán vừa mua. */
  CHI: '019a2a00-0000-7000-8000-000000000003',
  /** Người mua. */
  DUNG: '019a2a00-0000-7000-8000-000000000004',
} as const;

export const SEED_EVENT_IDS = {
  CONCERT: '019a2a00-0000-7000-8000-000000000101',
  FESTIVAL: '019a2a00-0000-7000-8000-000000000102',
} as const;

export const SEED_LISTING_IDS = {
  AN_CONCERT: '019a2a00-0000-7000-8000-000000000201',
  BINH_CONCERT: '019a2a00-0000-7000-8000-000000000202',
  CHI_CONCERT: '019a2a00-0000-7000-8000-000000000203',
  AN_FESTIVAL: '019a2a00-0000-7000-8000-000000000204',
  /** Giá 333.333 ₫: phí làm tròn xuống, sàn nhận phần lẻ. */
  BINH_FESTIVAL_ODD_PRICE: '019a2a00-0000-7000-8000-000000000205',
  CHI_FESTIVAL: '019a2a00-0000-7000-8000-000000000206',
} as const;

const USERS: readonly NewUser[] = [
  { id: SEED_USER_IDS.AN, display_name: 'Nguyễn Văn An' },
  { id: SEED_USER_IDS.BINH, display_name: 'Trần Thị Bình' },
  { id: SEED_USER_IDS.CHI, display_name: 'Lê Minh Chi' },
  { id: SEED_USER_IDS.DUNG, display_name: 'Phạm Quốc Dũng' },
];

const EVENTS: readonly NewEvent[] = [
  {
    id: SEED_EVENT_IDS.CONCERT,
    slug: 'dem-nhac-mua-thu-2027',
    name: 'Đêm nhạc Mùa Thu 2027',
    description: 'Đêm nhạc acoustic ngoài trời với các ca khúc về mùa thu Hà Nội.',
    venue: 'Nhà hát Lớn Hà Nội',
    starts_at: '2027-03-20T12:30:00Z',
  },
  {
    id: SEED_EVENT_IDS.FESTIVAL,
    slug: 'le-hoi-am-nhac-bien-2027',
    name: 'Lễ hội Âm nhạc Biển 2027',
    description: 'Hai ngày lễ hội âm nhạc điện tử bên bờ biển.',
    venue: 'Công viên Biển Đông, Đà Nẵng',
    starts_at: '2027-05-15T10:00:00Z',
  },
];

const LISTINGS: readonly NewListing[] = [
  {
    id: SEED_LISTING_IDS.AN_CONCERT,
    event_id: SEED_EVENT_IDS.CONCERT,
    seller_id: SEED_USER_IDS.AN,
    unit_price: 500_000,
    quantity_total: 10,
  },
  {
    id: SEED_LISTING_IDS.BINH_CONCERT,
    event_id: SEED_EVENT_IDS.CONCERT,
    seller_id: SEED_USER_IDS.BINH,
    unit_price: 750_000,
    quantity_total: 4,
  },
  {
    id: SEED_LISTING_IDS.CHI_CONCERT,
    event_id: SEED_EVENT_IDS.CONCERT,
    seller_id: SEED_USER_IDS.CHI,
    unit_price: 450_000,
    quantity_total: 2,
  },
  {
    id: SEED_LISTING_IDS.AN_FESTIVAL,
    event_id: SEED_EVENT_IDS.FESTIVAL,
    seller_id: SEED_USER_IDS.AN,
    unit_price: 1_200_000,
    quantity_total: 3,
  },
  {
    id: SEED_LISTING_IDS.BINH_FESTIVAL_ODD_PRICE,
    event_id: SEED_EVENT_IDS.FESTIVAL,
    seller_id: SEED_USER_IDS.BINH,
    unit_price: 333_333,
    quantity_total: 5,
  },
  {
    id: SEED_LISTING_IDS.CHI_FESTIVAL,
    event_id: SEED_EVENT_IDS.FESTIVAL,
    seller_id: SEED_USER_IDS.CHI,
    unit_price: 900_000,
    quantity_total: 1,
  },
];

export interface SeedResult {
  users: number;
  events: number;
  listings: number;
}

/**
 * Idempotent: `ON CONFLICT (id) DO NOTHING` — chạy lại mỗi lần container start không lỗi
 * và không ghi đè dữ liệu đã đổi (sự kiện đã `COMPLETED` giữ nguyên). Trả số dòng mới chèn.
 */
export async function seedDevData(db: Database): Promise<SeedResult> {
  return db.transaction().execute(async (trx) => {
    const users = await trx
      .insertInto('users')
      .values([...USERS])
      .onConflict((oc) => oc.column('id').doNothing())
      .executeTakeFirst();
    const events = await trx
      .insertInto('events')
      .values([...EVENTS])
      .onConflict((oc) => oc.column('id').doNothing())
      .executeTakeFirst();
    const listings = await trx
      .insertInto('listings')
      .values([...LISTINGS])
      .onConflict((oc) => oc.column('id').doNothing())
      .executeTakeFirst();

    return {
      users: Number(users.numInsertedOrUpdatedRows ?? 0n),
      events: Number(events.numInsertedOrUpdatedRows ?? 0n),
      listings: Number(listings.numInsertedOrUpdatedRows ?? 0n),
    };
  });
}
