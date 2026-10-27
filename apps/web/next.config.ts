import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Image Docker chỉ chép .next/standalone (server.js ở root output)
  output: 'standalone',
  // Không cho `next dev` chèn khối agent-rules vào CLAUDE.md / AGENTS.md của app
  agentRules: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      // Loader Tailwind v4 — thiếu thì build vẫn pass nhưng CSS mất utility
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
