# web

Website Marketplace + Khu Quản Trị (Next.js 16 App Router, standalone output). Kiến trúc: `specs/architecture.md`.

```bash
pnpm install
cp -n .env.example .env
pnpm dev        # http://localhost:3000, health: /health
pnpm lint && pnpm typecheck && pnpm test
pnpm build && docker build -t ticket-web .
```
