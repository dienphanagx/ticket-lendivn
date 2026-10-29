import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Spec gọi `docker compose exec` trên stack local và ghi vào DB dev → chỉ cho phép nhắm máy local
const { hostname } = new URL(baseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
  throw new Error(
    `[e2e] STOP: E2E_BASE_URL host "${hostname}" is not local — suite writes to the dev DB`,
  );
}

// Không khai `webServer`: stack đã chạy qua docker compose (rule testing § Môi trường chạy test)
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
