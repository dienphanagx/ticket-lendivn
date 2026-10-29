import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // Guard tên DB `_test` + migrate 1 lần trước mọi file
    globalSetup: ['test/global-setup.ts'],
    // Các file dùng chung DB `ticket_test` và TRUNCATE giữa test → chạy tuần tự
    fileParallelism: false,
  },
});
