# Kiến Trúc Hệ Thống: Ticket Checkout with Escrow

## TÓM TẮT

- **Apps/Services**: `web` Next.js 16 (Website Marketplace + Khu Quản Trị, dựng trang từ máy chủ, BFF), `api` Fastify 5 (REST, tích hợp VNPay, sổ cái, job hết hạn đơn), PostgreSQL 18, `tunnel` ngrok (tuỳ chọn, chỉ để IPN của VNPay tới được máy local)
- **Giao tiếp**: REST/JSON; trình duyệt chỉ nói chuyện với `web`, `web` gọi `api` server-side trong mạng compose; VNPay → `api` qua HTTPS của tunnel (IPN) và qua trình duyệt (return URL)
- **Deploy**: Docker Compose trên máy người chấm: `docker compose up` chạy `db`, `api`, `web` và đi trọn luồng mua vé; `docker compose --profile tunnel up` thêm `tunnel`; profile `test` chạy `db-test` + `api-test` tách khỏi DB dev

## Chi Tiết

### Cấu Trúc Thư Mục

```text
apps/
 web/ # Website Marketplace + Khu Quản Trị, SSR + BFF (Next.js 16)
 api/ # REST API, VNPay, sổ cái kép, job hết hạn, script gửi IPN test (Node.js 24 + Fastify 5)
```

Tên app theo rule `policy-isolation`. Chỉ ghi app + vai trò; layout trong app do skill stack quy định, không vẽ lại cây. Root chỉ có `docker-compose.yml`, `.env.example`, `README.md` và tooling cho phép theo `policy-isolation` § Root orchestration được phép.

### Quan Hệ Giữa Các App

```text
trình duyệt → web (HTTP :3000; trang dựng từ máy chủ + Route Handler /bff/* same-origin; cookie current_user_id)
trình duyệt → VNPay sandbox (chuyển hướng tới vpcpay.html; VNPay chuyển về web /don-hang/:orderId kèm tham số vnp_* có chữ ký)
web → api (REST server-side qua API_INTERNAL_URL, header X-User-Id; không có lời gọi trình duyệt → api)
api → PostgreSQL (Kysely + pg, pool)
api → VNPay merchant_webapi (HTTPS POST JSON querydr, timeout 5s, ngoài transaction DB)
VNPay → tunnel (ngrok, HTTPS, domain cố định) → api GET /api/v1/payments/vnpay/ipn (chỉ khi bật profile tunnel)
script send-ipn (trong container api) → api GET /api/v1/payments/vnpay/ipn (HTTP nội bộ, IPN tự ký để test local)
```

### Routes

#### apps/api (Fastify 5)

Mọi route nghiệp vụ nằm dưới prefix `/api`; path dưới đây tính sau `/api`. Health ở root. Không tách namespace theo audience vì không có phân quyền: mọi endpoint mở cho mọi người dùng; IPN là endpoint duy nhất không do `web` gọi.

| Method | Path | Audience | Auth | Mô tả |
|--------|------|----------|------|-------|
| `GET` | `/v1/users` | web | public | Danh sách người dùng mẫu cho dropdown, A–Z, kèm cờ có tin bán |
| `GET` | `/v1/events` | web | public | Danh sách sự kiện + số vé còn lại, giá thấp nhất, `escrowTotal`, `pendingOrderCount`, `sellerCount`; lọc `status` (trang chủ, Quản trị) |
| `GET` | `/v1/events/:slug` | web | `X-User-Id` tuỳ chọn | Chi tiết sự kiện + tin bán (số vé còn lại, `isOwnListing`) |
| `GET` | `/v1/listings/:listingId/quote` | web | `X-User-Id` | Tính tổng tiền cho `?quantity=`: `subtotal`, `buyerFee`, `buyerTotal`, số vé còn lại |
| `POST` | `/v1/orders` | web | `X-User-Id` + `Idempotency-Key` | Tạo đơn `PENDING_PAYMENT`, giữ chỗ 15 phút, chốt snapshot tiền |
| `GET` | `/v1/orders` | web | public | Danh sách đơn, lọc `buyerId`, `status`, phân trang `page` / `limit`; hết hạn tại chỗ trước khi lọc |
| `GET` | `/v1/orders/:orderId` | web | public | Trạng thái thật của đơn; hết hạn tại chỗ; gọi `querydr` khi đủ điều kiện; `retryAfterSeconds` = 3 khi còn chờ |
| `POST` | `/v1/orders/:orderId/payment-url` | web | public | Tạo (lần đầu) hoặc trả lại URL VNPay đã ký; body `clientIp`, `locale` |
| `POST` | `/v1/payments/vnpay/return` | web | chữ ký VNPay (`vnp_SecureHash`) | Web chuyển tiếp nguyên tham số `vnp_*` của đường quay về; verify chữ ký + số tiền rồi ghi nhận như IPN |
| `GET` | `/v1/payments/vnpay/ipn` | internal | chữ ký VNPay (`vnp_SecureHash`) | IPN từ VNPay (qua tunnel) hoặc script `send-ipn`; luôn HTTP 200 + `{ RspCode, Message }` |
| `GET` | `/v1/me/balance` | web | `X-User-Id` | Số dư đang chờ, số dư khả dụng (tách bán vé / khoản cần hoàn), lịch sử bút toán phân trang |
| `GET` | `/v1/ledger` | web | public | Sổ cái toàn sàn: mọi tài khoản + tổng nợ / có / số dư, Σ nợ và Σ có toàn sổ, giao dịch phân trang lọc `type`, `eventId` |
| `GET` | `/v1/ledger/accounts/:accountId` | web | public | Thông tin + tổng của 1 tài khoản sổ cái và các dòng bút toán phân trang |
| `POST` | `/v1/events/:eventId/complete` | web | public | Đánh dấu sự kiện kết thúc: `COMPLETED`, đơn chờ → `EXPIRED`, giao dịch `EVENT_RELEASE` |
| `GET` | `/health` | internal | public | Liveness, không kiểm dependency (ngoài prefix `/api`) |
| `GET` | `/health/ready` | internal | public | Readiness: kiểm DB trong ngân sách 2 giây; healthcheck của compose (ngoài prefix `/api`) |

#### Module Split Theo Audience (BE)

Chỉ domain `payments` phục vụ > 1 audience. Entrypoint = Fastify plugin đăng ký route; Auth chain = chuỗi hook / bước kiểm trước service.

| Domain | Entrypoint | Path namespace | Audience | Auth chain |
|--------|-----------|----------------|----------|------------|
| `payments` | `paymentUrlRoutes` | `/v1/orders/:orderId/payment-url` | web | `onRequest` requestId → Zod schema |
| `payments` | `vnpayReturnRoutes` | `/v1/payments/vnpay/return` | web | `onRequest` requestId → Zod schema → verify `vnp_SecureHash` (lỗi → `422`) |
| `payments` | `vnpayIpnRoutes` | `/v1/payments/vnpay/ipn` | internal | `onRequest` requestId → verify `vnp_SecureHash` trước mọi đọc DB (lỗi → `RspCode 97`) → Zod schema (lỗi → `RspCode 99`) |

Cả return và IPN gọi chung `PaymentRecorder.record()` (cùng `querydr` trong `GET /v1/orders/:orderId`); 2 plugin chỉ khác cách map kết quả: return trả envelope `{ data }` của API, IPN trả `{ RspCode, Message }` theo giao thức VNPay.

#### apps/web (Next.js 16)

"Cần chọn tài khoản" = đọc cookie `current_user_id`; thiếu thì hiển thị "Vui lòng chọn tài khoản để tiếp tục" và mở dropdown, không chuyển trang. Mọi trang dựng từ máy chủ mỗi request, không cache (số vé, trạng thái, số dư đổi liên tục).

| Path | Auth | Mô tả |
|------|------|-------|
| `/` | public | Danh sách sự kiện ("Đang bán" trước, theo thời gian diễn ra) |
| `/su-kien/:slug` | public (nhãn "Tin của bạn" theo cookie) | Trang sự kiện + tin bán; khu chọn vé (bottom sheet dưới 768px), tạm tính phí qua `/bff/listings/:listingId/quote`; "Thanh toán" gọi `POST /bff/orders` rồi `POST /bff/orders/:orderId/payment-url`, nhận URL VNPay rồi `window.location.assign` |
| `/don-hang/:orderId` | cần chọn tài khoản | Trang kết quả, cũng là `vnp_ReturnUrl`; query có tham số `vnp_*` → chỉ khi có `vnp_SecureHash` mới chuyển tiếp nguyên các tham số `vnp_*` tới `POST /v1/payments/vnpay/return` (không gắn `X-User-Id`, bỏ qua kết quả / lỗi), rồi luôn `redirect` (replace) về URL không query; đơn không do tài khoản đang chọn mua → 404 "Không tìm thấy đơn hàng"; đơn đang chờ → hỏi lại qua `GET /bff/orders/:orderId` |
| `/don-hang` | cần chọn tài khoản | Đơn do tài khoản đang chọn mua (`buyerId` = cookie), `?page=`, `limit` 20 |
| `/tai-khoan` | cần chọn tài khoản | Số dư đang chờ, số dư khả dụng, lịch sử bút toán, `?page=`, `limit` 20 |
| `/quan-tri` | cần chọn tài khoản | Danh sách sự kiện kèm ký quỹ, đơn đang chờ; modal "Đánh dấu kết thúc" gọi `POST /bff/events/:eventId/complete` rồi `router.refresh()` |
| `/quan-tri/so-cai` | cần chọn tài khoản | Bảng tài khoản sổ cái: tổng nợ, tổng có, số dư; Σ nợ = Σ có toàn sổ |
| `/quan-tri/so-cai/:accountId` | cần chọn tài khoản | Chi tiết tài khoản sổ cái và dòng bút toán, `?page=`, `limit` 50 |
| `/bff/orders` | cookie `current_user_id` | Route Handler `POST` tạo đơn: header `Idempotency-Key` UUID v4 + body `listingId`, `quantity` → `POST /v1/orders` |
| `/bff/orders/:orderId/payment-url` | cookie `current_user_id` | Route Handler `POST` lấy URL VNPay: đọc đơn qua `GET /v1/orders/:orderId`, người mua ≠ cookie → 404 "Không tìm thấy đơn hàng"; `clientIp` lấy từ header request, không từ body trình duyệt → `POST /v1/orders/:orderId/payment-url` |
| `/bff/orders/:orderId` | cookie `current_user_id` | Route Handler `GET` cho TanStack Query hỏi lại trạng thái đơn; người mua ≠ cookie → 404 cùng thông báo; không trả `paymentUrl` |
| `/bff/listings/:listingId/quote` | cookie `current_user_id` | Route Handler `GET` `?quantity=` cho bảng tạm tính → `GET /v1/listings/:listingId/quote`; trình duyệt huỷ thì huỷ lời gọi `api` |
| `/bff/events/:eventId/complete` | cookie `current_user_id` | Route Handler `POST` đánh dấu sự kiện kết thúc → `POST /v1/events/:eventId/complete`; không chuyển tín hiệu huỷ của trình duyệt sang `api` |

Mọi Route Handler `/bff/*` đi cùng 1 khuôn: chặn cross-site (§ Auth & Authz) → validate param / query / body bằng Zod (`400 VALIDATION_FAILED`) → thiếu cookie `current_user_id` → `401 USER_NOT_SELECTED` → gọi `api` server-side; lỗi trả cùng envelope `{ code, message, details? }`, header response theo § Cross-cutting Concerns. Server Action duy nhất ở `features/users`: `selectUser` (kiểm mã có trong `GET /v1/users` rồi set cookie, Next dựng lại trang theo cookie mới) và `clearCurrentUser` (xoá cookie khi tài khoản đã lưu không còn tồn tại). Phân trang dùng `?page=` trên URL, chuyển trang = điều hướng dựng lại từ máy chủ.

### Dịch Vụ Ngoài (Third-party)

| Dịch vụ | Mục đích | Env var |
|---------|----------|---------|
| VNPay sandbox — trang thanh toán (`paymentv2/vpcpay.html`) | Tạo URL thanh toán ký HMAC-SHA512, người mua trả bằng thẻ test NCB | `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAYMENT_URL`, `VNPAY_RETURN_URL_BASE` (= `http://localhost:3000/don-hang`) |
| VNPay sandbox — `querydr` (`merchant_webapi/api/transaction`) | Tra cứu trạng thái giao dịch khi đơn còn chờ | `VNPAY_QUERY_URL` (+ `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`) |
| VNPay sandbox — IPN | Thông báo kết quả server-to-server; IPN URL đặt trên portal merchant sandbox = `https://NGROK_DOMAIN/api/v1/payments/vnpay/ipn` (README hướng dẫn) | Không có env phía `api` |
| ngrok | Tunnel HTTPS domain cố định từ Internet vào `api:8080`, chỉ khi bật profile `tunnel` | `NGROK_AUTHTOKEN`, `NGROK_DOMAIN` |

Secret VNPay / ngrok chỉ nằm trong `.env` (không commit); `.env.example` để rỗng các key bên thứ ba (rule `policy-code` § `.env.example`). Thiếu `VNPAY_*`: `api` vẫn khởi động, `payment-url` trả `503 PAYMENT_GATEWAY_UNAVAILABLE`, IPN / return trả lỗi chữ ký, `querydr` bị bỏ qua — người chấm vẫn xem được trang khi chưa có sandbox.

### Môi Trường Deploy

| App | Nền tảng | CI | Registry | Cách deploy | Domain | Ghi chú |
|-----|----------|----|----------|-------------|--------|---------|
| `web` | Docker Compose local, build `./apps/web` (Next.js standalone) | Không có (bài test chạy local) | — | `docker compose up` | `http://localhost:3000` | `APP_ENV`, `API_INTERNAL_URL=http://api:8080/api`, `SITE_URL` (mặc định `http://localhost:3000`, origin dùng để kiểm `Origin` của `/bff/*`); chờ `api` healthy |
| `api` | Docker Compose local, build `./apps/api` | Không có | — | `docker compose up`; entrypoint `migrate` → `seed` → server | `http://127.0.0.1:8080` (publish loopback để debug) | `APP_ENV`, `PORT=8080`, `DATABASE_URL`, `LOG_LEVEL`, `VNPAY_*`; chờ `db` healthy; healthcheck `GET /health/ready` |
| `db` | `postgres:18-alpine` trong Docker Compose | — | — | Volume `pgdata`; chỉ chứa DB dev `ticket` | Không publish port | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| `db-test` | `postgres:18-alpine`, compose profile `test` | — | — | Dựng cùng `api-test`; dữ liệu trên tmpfs, không volume, mất khi container dừng | Không publish port | DB `ticket_test`; tách khỏi `db` vì rule `destructive-ops` § Database: không dùng DB dev làm DB test, `TRUNCATE` chỉ trên DB test ephemeral |
| `tunnel` | `ngrok/ngrok:3`, compose profile `tunnel` | — | — | `docker compose --profile tunnel up` | `https://NGROK_DOMAIN` → `http://api:8080` | `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`; tắt thì luồng vẫn chạy qua return URL; người mua không quay về trang kết quả thì đơn không được ghi nhận vì `querydr` trên sandbox bị từ chối (§ Các Quyết Định Kỹ Thuật) |
| `api-test` | Target `test` của Dockerfile `api`, compose profile `test` | — | — | `docker compose --profile test run --rm api-test` | — | `DATABASE_URL` trỏ DB `ticket_test` của `db-test` (tên DB ghi literal, không lấy từ `.env`); chờ `db-test` healthy; chạy Vitest, guard tên DB đuôi `_test` trước migrate / `TRUNCATE` |

### Auth & Authz

- **Cơ chế**: không đăng nhập, không token (requirements § Sẽ không bao gồm)
  - Tài khoản đang chọn lưu ở cookie `current_user_id` của `web`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 ngày, `Secure` khi `APP_ENV=production`; set bằng Server Action `selectUser`
  - `SameSite=Lax` chứ không `Strict`: VNPay chuyển người mua về `/don-hang/:orderId` bằng điều hướng top-level từ site khác, `Strict` làm request đó thiếu cookie và trang kết quả rơi vào "chưa chọn tài khoản"
  - Server `web` đọc cookie rồi gắn header `X-User-Id` khi gọi `api`; `api` tin header, chỉ dùng để biết người thao tác (không phải xác thực); `api` trả `USER_NOT_FOUND` → `web` xoá cookie, hiện "Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại"
  - Endpoint VNPay (IPN, return) xác thực bằng chữ ký HMAC-SHA512 với `VNPAY_HASH_SECRET`
  - CSRF: mọi Route Handler `/bff/*` (kể cả `GET`) kiểm `isSameOrigin` trước khi đọc cookie, sai → `403`
    - Có `Sec-Fetch-Site` → chỉ nhận `same-origin` (`same-site` của subdomain khác cũng chặn)
    - Thiếu `Sec-Fetch-Site` (trình duyệt cũ): `GET` / `HEAD` cho qua vì chỉ đọc; `POST` bắt buộc `Origin` khớp origin của `SITE_URL`, thiếu hoặc lệch → chặn (fail-closed)
    - Server Action `selectUser` / `clearCurrentUser`: Next tự so `Origin` với `Host`
- **Token TTL**: không dùng — không có token
- **Roles của dự án**: không có; Khu Quản Trị mở cho mọi tài khoản. Không mua tin của chính mình là luật nghiệp vụ, trả `422 CANNOT_BUY_OWN_LISTING` (rule `policy-api` § HTTP status), không phải lỗi quyền

### API Conventions

- **Versioning**: `/v1/` URL prefix
- **Base URL**: mọi route nghiệp vụ dưới `/api` (Fastify `prefix: '/api'`), path trong code `/v1/...`; `/health`, `/health/ready` ở root; `API_INTERNAL_URL=http://api:8080/api`
- **Contract**: không dùng `specs/api/openapi.json` / `gen:api` (quyết định user) — `api` validate request và serialize response bằng schema Zod (field ngoài schema không lộ ra); `web` tự viết lớp gọi `api` nhỏ trong `src/lib/api/` (`server-only`) với type TS viết tay theo spec api, timeout 15 giây, parse lỗi `{ code, message, details }` thành `ApiError`
- **Response**: `{ data }`, `{ data, meta: { total, page, limit, totalPages } }`, lỗi `{ code, message, details? }` (rule `policy-api` § Response format); ngoại lệ duy nhất: IPN trả `{ RspCode, Message }` HTTP 200 theo giao thức VNPay (sai chữ ký là `RspCode 97`, không phải `401` như `policy-api` § Webhook inbound, vì VNPay chỉ đọc `RspCode`)
- **Idempotency**:
  - `POST /v1/orders` bắt buộc `Idempotency-Key`; cặp (`X-User-Id`, key) UNIQUE vĩnh viễn lưu trên đơn, lần gọi lại cùng nội dung trả `200` + đơn ở trạng thái hiện tại (thay cho cache 24h của `policy-api` § Idempotency & versioning, vì đơn chính là response đã lưu)
  - IPN, return, `querydr` idempotent theo `vnp_TransactionNo`; `POST /v1/events/:eventId/complete` idempotent theo trạng thái (lần sau `409 EVENT_ALREADY_COMPLETED`, không ghi thêm bút toán)

### Cross-cutting Concerns

| Concern | Lựa chọn | Ghi chú |
|---------|----------|---------|
| **Background jobs** | `croner` trong process `api`, `protect: true` | Hết hạn đơn mỗi 60 giây (batch 500, `FOR UPDATE SKIP LOCKED`, `specs/database.md`); log `orders.expired` kèm số đơn. Không có job tra cứu VNPay định kỳ: spec chỉ tra cứu khi xem đơn |
| **Cache** | Không dùng | Tồn kho, trạng thái đơn, số dư là dữ liệu tài chính phải đúng tại thời điểm đọc (rule `policy-cache-queue` § Phải / Không); trang `web` dựng mỗi request |
| **File storage** | Không dùng | Không có upload |
| **Rate limit policy** | Không dùng | `api` không publish ra Internet ngoài lúc bật tunnel, không có endpoint đăng nhập; VNPay tự giới hạn số lần gửi IPN |
| **CORS allowed origins** | Không cần — trình duyệt không gọi `api`, `api` không bật CORS | credentials: — |
| **Security headers** | `web`: CSP nonce sinh mỗi request trong `src/proxy.ts` (`default-src 'self'`, `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'` không `'unsafe-inline'`, `'unsafe-eval'` chỉ khi dev, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; HSTS chỉ khi `APP_ENV=production` (local là HTTP); chuyển sang VNPay bằng điều hướng top-level nên CSP không cần mở domain VNPay. Response `/bff/*`: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` (chỉ là data, trình duyệt không render / chạy được). `api`: `@fastify/helmet` mặc định (rule `policy-owasp` § Network & headers) | Thư viện chèn `<style>` lúc chạy phải mang nonce của request (`specs/tech-stack.md`: `get-nonce`, không `sonner` / `vaul`, Zod `jitless`) |

### Monitoring & Observability

| Concern | Lựa chọn | Ghi chú |
|---------|----------|---------|
| **Error tracking** | Không dùng | Bài test chạy local; 5xx log `error` kèm `err`, `requestId` |
| **APM / Tracing** | Không dùng | 2 service, 1 DB; `requestId` do `web` sinh, forward qua header `X-Request-ID` để nối log 2 bên |
| **Metrics** | Không dùng | Không yêu cầu chịu tải; số liệu nghiệp vụ (ký quỹ, Σ nợ / có) đã có ở trang Sổ cái |
| **Log aggregation** | stdout JSON (pino) → `docker compose logs`; `pino-pretty` khi `APP_ENV=development` | Event nghiệp vụ: `order.created`, `payment.recorded` (`source`, `disposition`), `payment.duplicate`, `payment.rejected` (warn: chữ ký / số tiền / không có đơn), `payment.overpaid` (warn), `querydr.failed` (warn), `ledger.unbalanced` (error), `event.completed`. Request log của `/v1/payments/vnpay/*` bỏ query string vì chứa `vnp_TmnCode`; `VNPAY_HASH_SECRET`, `NGROK_AUTHTOKEN` không bao giờ vào log (rule `policy-log` § Redact) |
| **Uptime monitoring** | Không dùng | Compose healthcheck `GET /health/ready` cho `api`, `web` chờ `api` healthy |
| **Alert policy** | Không dùng | Không có vận hành thật; người chấm đọc log |
| **Dashboard** | Không dùng | Trang `/quan-tri/so-cai` là nơi kiểm cân đối sổ |

### Các Quyết Định Kỹ Thuật

- **Ghi nhận thanh toán: 3 nguồn, 1 hàm `PaymentRecorder.record()`**: mọi thay đổi trạng thái đơn do tiền và mọi bút toán thanh toán đi qua 1 hàm idempotent; IPN, return URL và `querydr` chỉ là adapter lấy dữ liệu đã xác thực — trade-off: return URL được ghi nhận nên trang kết quả có trạng thái ngay cả khi không bật tunnel, đổi lại phải verify chữ ký ở 2 cửa vào thay vì 1 — alternatives considered: chỉ IPN + `querydr` (không tunnel thì mọi đơn phụ thuộc lần tra cứu), tin `vnp_ResponseCode` trên URL không verify (giả mạo được) — khi nào xem lại: lên production có IPN ổn định thì vẫn giữ, vì return có chữ ký tương đương IPN
  - Thứ tự kiểm chung, dừng ở bước đầu thất bại: chữ ký → mã đơn tồn tại → `vnp_Amount / 100` = `buyer_total` → `record()` (chống trùng + áp trạng thái + ghi sổ, 1 transaction, khoá `events` → `listings` → `orders` theo `specs/database.md`)
  - Input chung: mã đơn, `vnp_TransactionNo`, thành công khi `vnp_ResponseCode = '00'` và `vnp_TransactionStatus = '00'`, số tiền VND, `vnp_BankCode`, `vnp_PayDate`, nguồn (`IPN` / `RETURN_URL` / `QUERYDR`)
  - IPN: `RECORDED` → `00`, `DUPLICATE` → `02`, không có đơn → `01`, sai tiền → `04`, sai chữ ký → `97`, trường sai dạng sau khi chữ ký hợp lệ hoặc lỗi DB → `99` (để VNPay gửi lại); xử lý đồng bộ, không gọi dịch vụ ngoài, phản hồi < 5 giây
  - Return: sai chữ ký / sai tiền → `422 PAYMENT_SIGNATURE_INVALID` / `PAYMENT_AMOUNT_MISMATCH`, log warn, không đổi dữ liệu; `web` bỏ qua lỗi này, `redirect` về `/don-hang/:orderId` không query rồi đọc trạng thái như mọi lần (tải lại trang không gửi lại tham số; gửi lại cũng chỉ ra `DUPLICATE`)
  - `querydr`: chỉ tin khi chữ ký response hợp lệ, `vnp_TxnRef` = mã đơn, `vnp_Amount` = `buyer_total` × 100, `vnp_ResponseCode = '00'`; `vnp_TransactionStatus` `00` → thành công, `02` → thất bại, mã khác (`01` chưa hoàn tất, …) hoặc `vnp_ResponseCode` `91` (chưa có giao dịch) → không đổi đơn
  - Ràng buộc sandbox: `querydr` của VNPay sandbox hiện trả phản hồi lỗi không ký (`vnp_ResponseCode` `99`, không có `vnp_SecureHash`) nên kết quả tra cứu bị từ chối như sai chữ ký (đơn không đổi trạng thái, log `querydr.failed`); vì vậy trên sandbox, ghi nhận khi người mua không quay về trang kết quả phụ thuộc IPN (cần bật tunnel)
- **Quy tắc trong `record()` theo trạng thái đơn lúc đã giữ khoá**:
  - Thành công, đơn chưa `PAID` / `REFUND_REQUIRED` (`PENDING_PAYMENT` còn hạn hay quá hạn, `EXPIRED`, `FAILED`) đi chung 1 phép kiểm tồn kho: sự kiện `ON_SALE` và số vé còn lại của tin (`sumReservedQuantity` loại chính đơn này qua `excludeOrderId`, tính dưới khoá `listings` FOR UPDATE) ≥ số lượng đơn → `PAID`, bút toán `PAYMENT_CAPTURED` (tiền vào `ESCROW_SELLER` + `ESCROW_FEE`); không đủ vé, hoặc sự kiện không `ON_SALE` (kể cả `COMPLETED`) → `REFUND_REQUIRED` + `PAYMENT_REFUND_REQUIRED` (tiền vào `BUYER_REFUND_PAYABLE`, hiện ở số dư khả dụng của người mua)
  - Không có nhánh tắt "đơn `PENDING_PAYMENT` còn hạn → `PAID`", vì "còn hạn" đo bằng `now()` = giờ BEGIN của transaction, có thể trước lúc lấy được khoá tin bán; lý do chi tiết ở `specs/database.md` § Các Quyết Định Kỹ Thuật → "Chống bán trùng"
  - Thành công, `vnp_TransactionNo` khác, đơn đã `PAID` / `REFUND_REQUIRED` (thanh toán thừa) → giữ trạng thái, thêm `PAYMENT_REFUND_REQUIRED`, log `payment.overpaid`
  - Thành công, `vnp_TransactionNo` đã ghi nhận → `DUPLICATE`, không ghi gì
  - Thất bại, đơn `PENDING_PAYMENT` → `FAILED`, vé tự trả lại vì không còn được tính là giữ chỗ, không ghi sổ; thất bại tới đơn đã rời `PENDING_PAYMENT` → `DUPLICATE`
  - Tiền đã được cổng xác nhận luôn vào sổ cái ở 1 trong 2 bút toán, không có nhánh bỏ qua
- **Các thứ tự tới của IPN / return / tra cứu**:
  - IPN tới trước return: IPN ghi `PAID`; return verify xong nhận `DUPLICATE`; trang kết quả hiện "Thanh toán thành công" ngay, không qua trạng thái chờ
  - Return tới trước IPN (luôn xảy ra khi không bật tunnel): return ghi `PAID`; IPN tới sau nhận `DUPLICATE` → `RspCode 02` → VNPay dừng gửi lại
  - IPN và return tới đồng thời: xếp hàng ở khoá `orders` FOR UPDATE, bên sau thấy `payment_transactions` đã có → `DUPLICATE`; UNIQUE partial `gateway_txn_no` + UNIQUE `ledger_transactions.idempotency_key` là chốt cuối (`23505` → chạy lại → `DUPLICATE`)
  - Người mua đóng tab ở cổng, không có IPN: đơn còn chờ; lần xem đơn kế tiếp (trang kết quả, mở từ trang Đơn hàng) gọi `querydr`, chỉ ghi nhận khi chữ ký response hợp lệ — trên sandbox luôn bị từ chối (ràng buộc sandbox ở mục trên) nên đơn giữ `PENDING_PAYMENT` rồi hết hạn sau 15 phút dù người mua đã bị trừ tiền, không tự chuyển `REFUND_REQUIRED`; tiền nếu có về sau (IPN) đi phép kiểm tồn kho trong `record()` (mục trên)
  - VNPay gửi lại IPN khi nhận `01` / `04` / `97` / `99` hoặc timeout, dừng khi nhận `00` / `02`; vì vậy chỉ trả `99` cho lỗi tạm thời, còn trùng luôn trả `02`
- **Đánh dấu sự kiện kết thúc giải phóng ký quỹ**: 1 transaction khoá `events` FOR UPDATE → `COMPLETED` → mọi đơn `PENDING_PAYMENT` của sự kiện thành `EXPIRED` → đọc số dư thực tế của `ESCROW_SELLER` / `ESCROW_FEE` của sự kiện từ view sổ cái (không cộng từ đơn) → 1 giao dịch `EVENT_RELEASE` nhiều dòng chuyển sang `SELLER_PAYABLE` từng người bán và `PLATFORM_FEE_REVENUE`; ký quỹ = 0 thì không tạo giao dịch. Tiền về sau cho đơn của sự kiện thấy `COMPLETED` → `REFUND_REQUIRED`, không bao giờ vào ký quỹ đã đóng — trade-off: giữ khoá sự kiện suốt thao tác làm tạo đơn / ghi nhận của sự kiện đó chờ vài ms — alternatives considered: chặn kết thúc khi còn đơn chờ (spec đã chọn không chặn)
- **Chữ ký VNPay**: HMAC-SHA512, hex, khoá `VNPAY_HASH_SECRET` (`node:crypto`)
  - URL thanh toán và IPN / return: lấy mọi tham số `vnp_*` trừ `vnp_SecureHash`, `vnp_SecureHashType`, bỏ tham số không có tiền tố `vnp_`, sắp tăng dần theo tên, `key=value` URL-encode kiểu form (khoảng trắng → `+`), nối `&`
  - Verify trên giá trị đã decode rồi encode lại theo cùng quy tắc, không dùng chuỗi query thô (thứ tự và kiểu encode của client không đảm bảo); 1 key xuất hiện nhiều lần hoặc giá trị không phải chuỗi → sai chữ ký; chưa cấu hình khoá (`VNPAY_HASH_SECRET` rỗng) → sai chữ ký
  - Verify thử 2 kiểu chuỗi ký, đúng 1 kiểu là hợp lệ: (1) mọi tham số `vnp_*` kể cả giá trị rỗng; (2) chỉ khi (1) sai và có tham số rỗng — bỏ các tham số `vnp_*` giá trị rỗng khỏi chuỗi ký (một số mẫu code của VNPay ký như vậy). URL thanh toán và script `send-ipn` luôn ký theo kiểu (1)
  - Sau khi chữ ký hợp lệ, `vnp_PayDate` / `vnp_BankCode` rỗng coi như không gửi (lưu `NULL`)
  - So sánh: chuẩn hoá chữ thường, kiểm đúng 128 ký tự hex, `crypto.timingSafeEqual` (áp cho cả 2 kiểu chuỗi ký)
  - `querydr`: chuỗi ký request và response nối bằng `|` theo đúng thứ tự trường của tài liệu VNPay; `vnp_TransactionDate` = `orders.vnp_create_date` đã lưu, `vnp_RequestId` 32 ký tự hex ngẫu nhiên mỗi lần
  - URL thanh toán: `vnp_TxnRef` = mã đơn, `vnp_Amount` = `buyer_total` × 100, `vnp_CreateDate` / `vnp_ExpireDate` GMT+7 (`vnp_ExpireDate` = hạn giữ chỗ), `vnp_OrderInfo` = `Thanh toan don <mã đơn>`, `vnp_ReturnUrl` = `VNPAY_RETURN_URL_BASE/<mã đơn>`; lưu ở lần tạo đầu bằng `UPDATE ... WHERE payment_url IS NULL`, các lần sau trả lại đúng URL đó
- **`querydr` đồng bộ trong `GET /v1/orders/:orderId`, không throttle** (theo spec api § D): lời gọi nằm ngoài transaction DB, `AbortSignal.timeout(5000)`, không retry trong request vì lần hỏi lại kế tiếp của `web` (3 giây) chính là lần thử lại; lỗi / timeout → vẫn trả `PENDING_PAYMENT` — trade-off: mỗi tab đang chờ gọi VNPay tối đa ~40 lần trong 120 giây — alternatives considered: throttle theo đơn (đã bỏ theo quyết định user) — khi nào xem lại: VNPay giới hạn tần suất `querydr` hoặc có nhiều người mua đồng thời → throttle theo đơn + job đối soát định kỳ đơn chờ
- **Tunnel là service tuỳ chọn**: `tunnel` nằm sau compose profile `tunnel`, `docker compose up` không cần token ngrok mà vẫn đi trọn luồng khi người mua quay về trang kết quả (return URL; `querydr` trên sandbox bị từ chối nên không bù được, người mua đóng tab trước khi quay về chỉ được ghi nhận khi bật tunnel nhận IPN); README ghi cách lấy dev domain ngrok, đặt `NGROK_AUTHTOKEN` / `NGROK_DOMAIN`, bật profile và khai IPN URL `https://NGROK_DOMAIN/api/v1/payments/vnpay/ipn` trên portal merchant sandbox — trade-off: khi bật, tunnel mở toàn bộ `/api` (kể cả kết thúc sự kiện) ra Internet, chấp nhận cho bài test local, README ghi rõ — alternatives considered: tunnel bắt buộc (người chấm phải có tài khoản ngrok mới chạy được), cloudflared quick tunnel (hostname đổi mỗi lần, phải sửa IPN URL trên portal) — khi nào xem lại: production → chỉ route IPN công khai, Khu Quản Trị sau đăng nhập + phân quyền
- **Script gửi IPN có chữ ký để test local**: `apps/api/src/scripts/send-ipn.ts`, cú pháp `send-ipn <mã đơn> <số tiền VND> <success|duplicate|bad-signature|bad-amount> [--txn <số>] [--url <ipnUrl>]`
  - Chạy trong container: `docker compose exec -T api node dist/scripts/send-ipn.js <mã đơn> <số tiền VND> <kịch bản> ...`; chạy ngoài container khi dev: npm script `ipn:send` (`tsx`, đọc `.env` của `apps/api`)
  - `<số tiền VND>` = `buyerTotal` của đơn (script không đọc DB); ký bằng cùng hàm ký của `api` với `VNPAY_HASH_SECRET` (bắt buộc), `vnp_TmnCode` = `VNPAY_TMN_CODE` hoặc `LOCALTEST`; gửi `GET` tới `--url` nếu có (chỉ `http` / `https`), mặc định `http://localhost:<PORT>/api/v1/payments/vnpay/ipn`, timeout 10 giây
  - In 1 dòng `scenario`, mã đơn, `txn`, `RspCode` mong đợi / nhận được và `OK` / `MISMATCH`; exit code `0` khi khớp, `1` khi lệch hoặc lỗi
  - `success`: sinh `vnp_TransactionNo` mới (hoặc lấy `--txn`), số tiền đúng → `00` (in số giao dịch để dùng lại)
  - `duplicate --txn <số giao dịch>`: bắt buộc `--txn`, gửi lại lần thành công → `02`, không ghi sổ thêm
  - `bad-signature`: đổi 1 ký tự hex cuối của chữ ký → `97`, đơn không đổi
  - `bad-amount`: ký hợp lệ nhưng `vnp_Amount` lệch +1.000 VND → `04`, đơn không đổi
  - Từ chối chạy khi `APP_ENV=production`, vì script tạo ra "tiền" không có thật trong sổ cái; không in khoá, không in URL / tham số đã ký (chứa `vnp_TmnCode`)
- **Web là BFF, trình duyệt không gọi `api`**: Server Component lấy dữ liệu khi dựng trang; Client Component gọi Route Handler `/bff/*` qua TanStack Query (`bffFetch`) cho tạo đơn, lấy URL thanh toán, hỏi lại trạng thái đơn, tạm tính, kết thúc sự kiện; Server Action chỉ còn cho chọn / xoá tài khoản (set cookie); `api` không cần CORS và không bị trình duyệt chạm trực tiếp — trade-off: mọi lời gọi thêm 1 hop qua server Next, và Route Handler phải tự chặn CSRF (§ Auth & Authz) — alternatives considered: trình duyệt gọi `api` qua nginx `/api` (thêm nginx + CORS / cookie cho `api`), Server Action cho mọi thao tác ghi, mô hình jose / refresh của skill `nextjs-feature` (không có token để giữ)
  - Lệch skill `nextjs-feature`: không `next-intl` (1 ngôn ngữ, câu lỗi qua hằng `ERROR_MESSAGES` theo `code`), không `jose` / refresh; lớp gọi `api` server-side (`apiFetch`) chỉ gắn `X-User-Id` (từ cookie) + `X-Request-ID`, không forward cookie trình duyệt
  - Timeout: `apiFetch` cắt lời gọi `api` sau 15 giây (BFF trả `504` kèm envelope), `bffFetch` ở trình duyệt cắt sau 20 giây để luôn nhận được envelope của BFF trước
  - Khoá `Idempotency-Key` (UUID v4) sinh ở client cho 1 tin bán + số lượng, đổi khi đổi tin / số lượng; lỗi (kể cả timeout) → mở lại nút, lần bấm lại dùng lại khoá cũ nên không tạo đơn thứ hai; chỉ đổi khoá khi `api` báo khoá đã gắn với đơn không còn thanh toán được (`IDEMPOTENCY_KEY_REUSED`, `ORDER_NOT_PAYABLE`, `ORDER_NOT_FOUND`)
- **Fastify 5 + Kysely cho `api`**: schema Zod làm validator + serializer, `pino` có sẵn, `app.inject()` test HTTP trên Postgres thật không mở port — trade-off: không có skill `node-feature` trong repo, convention `api` theo rule chung (`policy-*`, `stack-ts`) — alternatives considered: Express 5 (không có schema / serializer), NestJS (nặng cho ~15 endpoint), Hono (hệ plugin Node kém hơn) — khi nào xem lại: không
- **Job hết hạn chạy trong process `api`**: `croner` mỗi 60 giây, không Redis / queue (rule `policy-cache-queue` § Queue: việc định kỳ → schedule lib); độ trễ của job không ảnh hưởng tồn kho vì số vé còn lại đã loại đơn quá hạn — trade-off: job dừng khi `api` dừng — alternatives considered: BullMQ repeatable job (thêm Redis), `pg_cron` (extension ngoài image chuẩn) — khi nào xem lại: chạy > 1 instance `api` → vẫn an toàn nhờ `SKIP LOCKED`, chỉ tốn thêm truy vấn
- **Không sinh OpenAPI** (quyết định user): `web` là client duy nhất, ~15 endpoint — trade-off: type của `web` có thể lệch schema `api` mà không có CI bắt (lệch rule `policy-isolation` § Contract) — alternatives considered: `@fastify/swagger` export `specs/api/openapi.json` + `gen:api` — khi nào xem lại: thêm client thứ hai (mobile, admin tách riêng) hoặc lệch type gây bug
