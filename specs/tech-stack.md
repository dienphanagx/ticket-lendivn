# Tech Stack: Ticket Checkout with Escrow

> Chỉ pin major version của framework chính. Thư viện bổ sung không ghi version (cài bản mới nhất qua CLI scaffold), trừ khi cột Version ghi lý do.

## TÓM TẮT
- **apps/web**: Next.js 16 (≥ 16.3) + React 19, TypeScript 6
- **apps/api**: Node.js 24 LTS + Fastify 5, TypeScript 6
- **Database**: PostgreSQL 18 + Kysely 0.29 (driver `pg`) + Kysely Migrator
- **Runtime / package manager**: Node.js 24 LTS, pnpm 10 (≥ 10.19) cho cả 2 app
- **Thanh toán**: VNPay sandbox; nhận IPN về máy local qua ngrok agent 3 (service tuỳ chọn, compose profile `tunnel`)

## Chi Tiết

### `apps/web` (Next.js 16)

| Package | Mục đích | Version (chỉ điền nếu có ràng buộc) |
|---------|----------|-------------------------------------|
| `next` | App Router, Server Component dựng trang từ máy chủ, Server Action, Route Handler `/bff/*` | 16, ≥ 16.3 vì `error.tsx` nhận `retry()` từ 16.3 (skill `nextjs-feature` § Version) |
| `react`, `react-dom` | UI | 19 (skill `nextjs-feature` § Version) |
| `typescript` | Type check strict | 6, vì npm `latest` đã là 7 (rule `stack-ts` § Version) |
| `tailwindcss` | Styling mobile-first từ 360px | — |
| `shadcn/ui` | Drawer (bottom sheet chọn vé dưới 768px), Dialog (modal kết thúc sự kiện), Skeleton, Sonner (toast), Table, Badge — có sẵn đúng các thành phần spec web cần | CLI 4 (`pnpm dlx shadcn@4`, skill `nextjs-feature` § Version) |
| `lucide-react` | Icon (đang xử lý, đóng, dấu chọn) | — |
| `@tanstack/react-query` | Hỏi lại trạng thái đơn trên trang kết quả theo `retryAfterSeconds`, dừng sau 120 giây | 5 (skill `nextjs-feature` § Version) |
| `zod` | Validate tham số URL (slug, mã đơn, mã tài khoản sổ cái, `page`) và ô số lượng; `zod/mini` cho schema chạy ở trình duyệt để bundle nhỏ | 4 (skill `nextjs-feature` § Version) |
| `server-only` | Chặn module gọi `api` (đọc `API_INTERNAL_URL`, cookie) bị import vào Client Component | — |
| `vitest` | Unit test hàm thuần: tạm tính phí, định dạng tiền / giờ, logic dừng hỏi lại | 5 (bản đã chốt với user, cùng major với `apps/api`) |
| `next-intl` | Không dùng: app chỉ tiếng Việt, URL không prefix locale; câu lỗi map qua 1 hằng `ERROR_MESSAGES` theo `code` (rule `policy-api` § Response format) | — |
| `jose` | Không dùng: không có đăng nhập / token; người dùng hiện tại là cookie `current_user_id`, BFF forward header `X-User-Id` | — |

### `apps/api` (Fastify 5)

| Package | Mục đích | Version (chỉ điền nếu có ràng buộc) |
|---------|----------|-------------------------------------|
| `fastify` | HTTP server; logger `pino` có sẵn, `app.inject()` để test HTTP không cần mở port, error handler toàn cục | 5 |
| `typescript` | Type check strict, build ra `dist/` bằng `tsc` | 6 (rule `stack-ts` § Version) |
| `zod` | Schema request / response, env schema lúc bootstrap | 4 |
| `fastify-type-provider-zod` | Dùng schema Zod làm validator + serializer của route, suy type handler từ schema | — (peer yêu cầu `zod` ≥ 4.1.5, `fastify` ≥ 5.5) |
| `kysely` | Query builder có type: `.forUpdate()` / `.forShare()` / `.skipLocked()`, `db.transaction()`, template `sql` cho trigger, CTE, `ON CONFLICT`; `Migrator` + `FileMigrationProvider` làm migration | 0.29 — bản 0.x có thể breaking ở minor, specifier `kysely@0.29` giữ trong 0.29.x |
| `pg` | Driver PostgreSQL (pool) cho Kysely `PostgresDialect`; parser `int8` → `number` có kiểm safe integer | — |
| `croner` | Job định kỳ trong process `api`: hết hạn đơn mỗi 60 giây, `protect: true` chống chạy chồng; không runtime dependency | — |
| `@fastify/helmet` | Header bảo mật mặc định cho response JSON (`nosniff`, `frame-ancestors`) | — |
| `pino-pretty` | Log dễ đọc khi `APP_ENV=development` (devDependency) | — |
| `tsx` | Chạy TS khi dev (`tsx watch`) (devDependency) | — |
| `vitest` | Test trên PostgreSQL thật (DB `ticket_test`): công thức phí, bút toán cân, IPN trùng / sai chữ ký / sai số tiền, tiền đến muộn, giải phóng ký quỹ, 2 giao dịch đồng thời tranh 1 tin bán | 5 (bản đã chốt với user; engines Node ^24) |
| HTTP ra VNPay | `fetch` native của Node 24 + `AbortSignal.timeout(5000)`, không thêm HTTP client vì chỉ có 1 lời gọi `querydr` | — |
| HMAC / random | `node:crypto` (`createHmac('sha512')`, `timingSafeEqual`, `randomInt`) | — |

### Dịch Vụ / Hạ Tầng Ngoài

| Hạng mục | Lựa chọn | Lý do |
|----------|----------|-------|
| Cổng thanh toán | VNPay sandbox (`sandbox.vnpayment.vn`) | Hỗ trợ VND, thẻ test NCB công khai, có cả return URL lẫn IPN ký HMAC-SHA512 và API `querydr` để tra cứu chủ động |
| Tunnel nhận IPN | ngrok agent 3 (image `ngrok/ngrok:3`), dev domain cố định miễn phí, chỉ chạy khi bật profile `tunnel` | IPN URL của VNPay cấu hình cố định trên portal merchant nên cần hostname ổn định; cloudflared quick tunnel đổi hostname mỗi lần chạy |
| Database | PostgreSQL 18 (`postgres:18-alpine`) trong Docker Compose | `uuidv7()` native cho PK, `UNIQUE NULLS NOT DISTINCT` cho khoá tài khoản sổ cái, DDL trong transaction cho migration |
| Hosting | Docker Compose trên máy người chấm (`db`, `api`, `web`) | Ràng buộc requirements: khởi động toàn bộ bằng `docker compose up`; không có môi trường production |
| Cache / queue | Không dùng (không Redis, không BullMQ) | Số dư và tồn kho là dữ liệu tài chính cần đúng tuyệt đối, không cache (rule `policy-cache-queue` § Phải / Không); việc nền duy nhất là job định kỳ → schedule lib (§ Queue) |
| Error tracking | Không dùng | Bài test chạy local; lỗi 5xx đã log JSON đủ ngữ cảnh ra stdout |
| Object storage | Không dùng | Không có upload file |
| Email | Không dùng | Ngoài phạm vi (requirements § Sẽ không bao gồm) |
