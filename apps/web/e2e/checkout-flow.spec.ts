/**
 * E2E luồng chính: mua vé -> thanh toán (giả lập IPN) -> ký quỹ -> kết thúc sự kiện -> sổ cái.
 *
 * ĐIỀU KIỆN TIÊN QUYẾT (spec KHÔNG tự đặt lại DB)
 * - Stack docker đang chạy: web http://localhost:3000 (hoặc `E2E_BASE_URL`), api trong container `api`
 *   với khoá VNPay thử nghiệm; lệnh `docker compose exec` chạy từ root repo.
 * - DB dev ở trạng thái SEED SẠCH: chưa có đơn, sự kiện Mùa Thu đang bán, tin Bình 750.000 ₫ còn 4,
 *   tin An 500.000 ₫ còn 10. Spec ghi dữ liệu thật (đơn, sổ cái) và kết thúc sự kiện nên chỉ chạy
 *   được 1 lần trên DB sạch; chạy lại cần đặt lại DB.
 * - Đặt lại DB (NGƯỜI DÙNG chạy, ở root repo): `docker compose down`, xoá volume pgdata
 *   (`docker volume rm <project>_pgdata`), rồi `docker compose up -d --build --wait` để migrate + seed.
 * - Test mobile chạy TRƯỚC luồng chính vì luồng chính kết thúc sự kiện (khi đó nút "Chọn" bị khoá).
 *
 * Chạy: `cd apps/web && pnpm test:e2e`
 */
import { expect, test, type Page } from '@playwright/test';

import { ACCOUNTS, chooseAccount, EVENT_NAME, EVENT_SLUG, valueOf } from './support/accounts';
import { collectBrowserErrors } from './support/browser-errors';
import { sendIpn } from './support/ipn';

const EVENT_PATH = `/su-kien/${EVENT_SLUG}`;
const GATEWAY_URL = /^https:\/\/sandbox\.vnpayment\.vn\//;
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{12,20}$/;
const PAID_TIMEOUT_MS = 20_000;

const listingOf = (page: Page, sellerName: string) =>
  page.getByRole('listitem').filter({ hasText: sellerName });

test.describe('Chọn vé trên màn hình hẹp', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('should show bottom sheet and restore focus on Esc when picking a listing on mobile', async ({
    page,
  }) => {
    // Arrange
    const errors = collectBrowserErrors(page);
    await page.goto(EVENT_PATH);
    await chooseAccount(page, ACCOUNTS.DUNG);
    const chooseButton = listingOf(page, ACCOUNTS.BINH).getByRole('button', { name: 'Chọn' });

    // Act
    await chooseButton.click();

    // Assert: sheet mở, tạm tính cập nhật, cuộn nền bị khoá
    const sheet = page.getByRole('dialog', { name: 'Chọn số lượng vé' });
    await expect(sheet).toBeVisible();
    await expect(valueOf(sheet, 'Tổng thanh toán')).toHaveText('825.000 ₫');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe('hidden');

    // Act + Assert: Esc đóng sheet, focus về nút "Chọn"
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(chooseButton).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .not.toBe('hidden');

    expect(errors.csp, 'CSP violations').toEqual([]);
    expect(errors.js, 'JS errors').toEqual([]);
  });
});

test.describe('Luồng mua vé có ký quỹ', () => {
  test('should buy tickets, settle via IPN, release escrow and keep the ledger balanced', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectBrowserErrors(page);
    let orderId = '';
    const txn = String(Date.now()); // số giao dịch VNPay duy nhất theo thời gian
    let gatewayUrl: URL | undefined;
    // Chặn điều hướng ra cổng VNPay (không gọi mạng ngoài), chỉ ghi lại URL
    await page.route(GATEWAY_URL, (route) => {
      gatewayUrl = new URL(route.request().url());
      return route.abort();
    });

    await test.step('1. Mở trang sự kiện và chọn tài khoản Dũng', async () => {
      await page.goto(EVENT_PATH);
      await expect(page.getByRole('heading', { level: 1, name: EVENT_NAME })).toBeVisible();

      await chooseAccount(page, ACCOUNTS.DUNG);
    });

    await test.step('2. Chọn tin của Bình, số lượng 2 -> tạm tính', async () => {
      const binh = listingOf(page, ACCOUNTS.BINH);
      await expect(binh, 'DB phải ở trạng thái seed sạch (tin Bình còn 4)').toContainText(
        'Còn 4 vé',
      );
      await binh.getByRole('button', { name: 'Chọn' }).click();

      const panel = page.getByRole('complementary', { name: 'Chọn số lượng vé' });
      await panel.getByLabel('Số lượng').fill('2');

      await expect(valueOf(panel, 'Tiền vé')).toHaveText('1.500.000 ₫');
      await expect(valueOf(panel, 'Phí dịch vụ (10%)')).toHaveText('150.000 ₫');
      await expect(valueOf(panel, 'Tổng thanh toán')).toHaveText('1.650.000 ₫');
    });

    await test.step('3. Bấm "Thanh toán" -> trình duyệt bị chuyển tới cổng VNPay sandbox', async () => {
      const panel = page.getByRole('complementary', { name: 'Chọn số lượng vé' });

      await panel.getByRole('button', { name: 'Thanh toán' }).click();

      await expect.poll(() => gatewayUrl?.origin).toBe('https://sandbox.vnpayment.vn');
      expect(gatewayUrl?.searchParams.get('vnp_Amount')).toBe('165000000');
      expect(gatewayUrl?.searchParams.get('vnp_TxnRef')).toMatch(ORDER_ID_PATTERN);
    });

    await test.step('4. Mở /don-hang, lấy mã đơn, thấy "Đang chờ xác nhận"', async () => {
      await page.goto('/don-hang');
      const pendingOrder = page
        .getByRole('link')
        .filter({ has: page.getByText('Đang chờ xác nhận', { exact: true }) });
      await expect(pendingOrder).toHaveCount(1);
      const href = await pendingOrder.getAttribute('href');
      orderId = decodeURIComponent(href?.split('/').pop() ?? '');
      expect(orderId).toBe(gatewayUrl?.searchParams.get('vnp_TxnRef'));

      await page.goto(`/don-hang/${orderId}`);

      await expect(page.getByRole('heading', { name: 'Kết quả thanh toán' })).toBeVisible();
      await expect(page.getByText('Đang chờ xác nhận thanh toán từ cổng…')).toBeVisible();
      await expect(valueOf(page, 'Tổng thanh toán')).toHaveText('1.650.000 ₫');
    });

    await test.step('5. Giả lập thanh toán thành công bằng send-ipn, trang tự cập nhật', async () => {
      const successOutput = sendIpn(orderId, 1_650_000, 'success', txn);
      expect(successOutput).toContain('expected=00 received=00');

      await expect(page.getByText('Thanh toán thành công')).toBeVisible({
        timeout: PAID_TIMEOUT_MS,
      });
      await expect(page.getByText('Đang chờ xác nhận thanh toán từ cổng…')).toBeHidden();

      // IPN trùng giao dịch: api trả mã 02, trạng thái không đổi
      const duplicateOutput = sendIpn(orderId, 1_650_000, 'duplicate', txn);
      expect(duplicateOutput).toContain('expected=02 received=02');
      await page.reload();
      await expect(page.getByText('Thanh toán thành công')).toBeVisible();
    });

    await test.step('6. Bình: số dư đang chờ 1.425.000 ₫, khả dụng 0 ₫', async () => {
      await page.goto('/tai-khoan');
      await chooseAccount(page, ACCOUNTS.BINH);

      await expect(valueOf(page, 'Số dư đang chờ')).toHaveText('1.425.000 ₫');
      await expect(valueOf(page, 'Số dư khả dụng')).toHaveText('0 ₫');
    });

    await test.step('7. Quản trị: ký quỹ 1.650.000 ₫, huỷ rồi xác nhận kết thúc sự kiện', async () => {
      await page.goto('/quan-tri');
      const event = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: EVENT_NAME }) });
      await expect(valueOf(event, 'Đang ký quỹ')).toHaveText('1.650.000 ₫');
      const openButton = event.getByRole('button', { name: 'Đánh dấu kết thúc' });
      const dialog = page.getByRole('alertdialog', { name: `Kết thúc sự kiện ${EVENT_NAME}?` });

      await openButton.click();
      await expect(dialog).toBeVisible();
      await expect(valueOf(dialog, 'Số tiền ký quỹ sẽ giải phóng')).toHaveText('1.650.000 ₫');
      await dialog.getByRole('button', { name: 'Huỷ' }).click();

      await expect(dialog).toBeHidden();
      await expect(openButton).toBeFocused();

      await openButton.click();
      await dialog.getByRole('button', { name: 'Xác nhận kết thúc' }).click();

      await expect(
        page.getByText(`Đã kết thúc sự kiện ${EVENT_NAME}, giải phóng 1.650.000 ₫ cho 1 người bán`),
      ).toBeVisible();
      await expect(event.getByText('Đã kết thúc', { exact: true })).toBeVisible();
      await expect(event.getByRole('button', { name: 'Đánh dấu kết thúc' })).toHaveCount(0);
    });

    await test.step('8. Bình: số dư đang chờ 0 ₫, khả dụng 1.425.000 ₫', async () => {
      await page.goto('/tai-khoan');

      await expect(valueOf(page, 'Số dư đang chờ')).toHaveText('0 ₫');
      await expect(valueOf(page, 'Số dư khả dụng')).toHaveText('1.425.000 ₫');
    });

    await test.step('9. Sổ cái: tổng nợ = tổng có, có giao dịch giải phóng, lọc theo chip', async () => {
      await page.goto('/quan-tri/so-cai');

      const debit = valueOf(page, 'Tổng ghi nợ toàn sổ');
      const credit = valueOf(page, 'Tổng ghi có toàn sổ');
      await expect(debit).toHaveText('3.300.000 ₫');
      await expect(credit).toHaveText('3.300.000 ₫');
      const release = page.getByRole('listitem').filter({ hasText: 'Giải phóng ký quỹ' });
      await expect(release).toHaveCount(1);

      const filters = page.getByRole('navigation', { name: 'Lọc theo loại giao dịch' });
      await filters.getByRole('link', { name: 'Giải phóng ký quỹ' }).click();

      await expect(page).toHaveURL(/[?&]type=/);
      await expect(filters.getByRole('link', { name: 'Giải phóng ký quỹ' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(release).toHaveCount(1);
      await expect(
        page.getByRole('listitem').filter({ hasText: 'Ghi nhận thanh toán' }),
      ).toHaveCount(0);
    });

    await test.step('10. Không lỗi CSP và không lỗi JS trong suốt luồng', async () => {
      expect(errors.csp, 'CSP violations').toEqual([]);
      expect(errors.js, 'JS errors').toEqual([]);
    });
  });
});
