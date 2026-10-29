import { expect, type Locator, type Page } from '@playwright/test';

// Tài khoản mẫu từ seed (apps/api/src/db/seed-data.ts); id đầy đủ 019a2a00-0000-7000-8000-00000000000N
export const ACCOUNTS = {
  AN: 'Nguyễn Văn An',
  BINH: 'Trần Thị Bình',
  CHI: 'Lê Minh Chi',
  DUNG: 'Phạm Quốc Dũng',
} as const;

export const EVENT_SLUG = 'dem-nhac-mua-thu-2027';
export const EVENT_NAME = 'Đêm nhạc Mùa Thu 2027';

/** Chọn tài khoản ở dropdown đầu trang và chờ thông báo "Đang xem với tài khoản …" */
export async function chooseAccount(page: Page, displayName: string): Promise<void> {
  const trigger = page.getByRole('banner').getByRole('button');
  const item = page.getByRole('menuitemradio', { name: displayName });
  // Click có thể rơi trước khi hydrate xong → thử lại tới khi menu mở, không sleep cố định
  await expect(async () => {
    if (!(await item.isVisible())) await trigger.click();
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await item.click();
  await expect(
    page.getByRole('status').filter({ hasText: `Đang xem với tài khoản ${displayName}` }),
  ).toBeVisible();
  await expect(trigger).toContainText(displayName);
}

/** Ô giá trị (`dd`) đứng ngay sau nhãn (`dt`) trong danh sách mô tả */
export function valueOf(scope: Page | Locator, label: string): Locator {
  return scope.getByText(label, { exact: true }).locator('xpath=following-sibling::dd[1]');
}
