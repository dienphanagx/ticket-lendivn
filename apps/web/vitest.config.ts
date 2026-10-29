import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true }, // alias `@/*` theo tsconfig.json
  test: {
    // Test server (Route Handler, proxy) chạy trên Node thật; file test render khai `// @vitest-environment jsdom`
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
