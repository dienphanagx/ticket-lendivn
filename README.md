# Ticket Checkout with Escrow

Lát cắt mỏng của sàn bán lại vé sự kiện: chọn vé, thanh toán qua VNPay sandbox, tiền nằm ký quỹ trong sổ cái kép, kết thúc sự kiện thì giải phóng sang số dư khả dụng của người bán. Brief gốc: [`assets/test-task-ticket-checkout-escrow.md`](assets/test-task-ticket-checkout-escrow.md).

## Tóm tắt

- **Làm gì**: trang sự kiện dựng từ máy chủ, giữ chỗ 15 phút, chuyển sang VNPay, trang kết quả hiện trạng thái thật của đơn, xử lý IPN có chữ ký, sổ cái kép, số dư đang chờ / khả dụng, kết thúc sự kiện.
- **Stack**: Next.js 16 (`apps/web`, SSR + BFF) + Fastify 5 (`apps/api`) + PostgreSQL 18; hai app standalone, chạy bằng Docker Compose.
- **Kiểm thử hiện có**: api 379 test (Vitest, Postgres thật), web 288 test Vitest + 2 E2E Playwright, 215 test case QA chức năng trong [`specs/test-cases/web.md`](specs/test-cases/web.md) (111 PASS, 0 FAIL, 19 PARTIAL, 85 PENDING). 2 E2E Playwright chạy xanh nguyên file trên DB seed sạch (2 passed, 10,5 giây, một lần duy nhất, không retry). Số test api (379) / web Vitest (288) lấy từ lần chạy gần nhất trong quá trình làm, tôi không chạy lại khi viết README này.
- **Chưa thử với VNPay sandbox thật** (xem mục 4): mọi kiểm thử dùng khoá giả + script gửi IPN tự ký.
- **Trạng thái**: đủ các hạng mục của brief; chưa sẵn sàng production (mục 4).

---

## 1. Cách chạy

### Điều kiện

- Docker + Docker Compose v2. Không cần cài Node / pnpm để chạy ứng dụng (chỉ cần khi chạy `pnpm test` của web).

### Các bước

```bash
cp .env.example .env
# Mở .env, điền VNPAY_TMN_CODE và VNPAY_HASH_SECRET (gửi riêng, không commit)
docker compose up -d --build
```

- Web: http://localhost:3000
- Api: http://127.0.0.1:8080 (publish loopback để debug; trình duyệt không gọi api trực tiếp)
- `api` khi khởi động tự chạy `migrate` rồi `seed` rồi mới mở server (xem `apps/api/Dockerfile`).
- Chưa có khoá sandbox: `api` vẫn khởi động, xem được trang, nhưng "Thanh toán" trả `503 PAYMENT_GATEWAY_UNAVAILABLE` (`specs/architecture.md` § Dịch Vụ Ngoài).
- Mọi lần `docker compose up -d --build` tạo lại container `api` với giá trị hiện có trong `.env`; sửa `.env` thì chạy lại lệnh này.

### Người dùng và dữ liệu seed

Chọn người dùng bằng dropdown ở đầu trang (không có đăng nhập; lựa chọn lưu ở cookie `current_user_id`).

| Người dùng | Vai trò |
|---|---|
| Nguyễn Văn An | bán |
| Trần Thị Bình | bán |
| Lê Minh Chi | vừa bán vừa mua |
| Phạm Quốc Dũng | mua |

| Sự kiện (`/su-kien/<slug>`) | An | Bình | Chi |
|---|---|---|---|
| Đêm nhạc Mùa Thu 2027 (`dem-nhac-mua-thu-2027`) | 500.000 ₫ x 10 | 750.000 ₫ x 4 | 450.000 ₫ x 2 |
| Lễ hội Âm nhạc Biển 2027 (`le-hoi-am-nhac-bien-2027`) | 1.200.000 ₫ x 3 | 333.333 ₫ x 5 (giá lẻ để thử làm tròn phí) | 900.000 ₫ x 1 |

Đi thử nhanh: chọn Dũng, mở Đêm nhạc Mùa Thu, chọn tin của Bình, bấm Thanh toán. Số dư ở `/tai-khoan` (đang chờ / khả dụng), Khu Quản Trị ở `/quan-tri` (kết thúc sự kiện) và `/quan-tri/so-cai` (sổ cái, Σ nợ = Σ có).

### Thanh toán trên VNPay sandbox

Người mua được chuyển tới `sandbox.vnpayment.vn`, trả bằng thẻ test NCB (`specs/tech-stack.md`). **Số thẻ / OTP test không được ghi trong repo**; lấy từ email đăng ký sandbox hoặc trang hướng dẫn của VNPay. Tôi không ghi lại từ trí nhớ để tránh sai.

### Callback của cổng tới máy local thế nào

**Mặc định không cần tunnel.** Ba đường ghi nhận thanh toán cùng gọi một hàm idempotent `PaymentRecorder.record()`:

| Đường | Khi nào chạy | Cần tunnel? |
|---|---|---|
| Return URL (VNPay chuyển trình duyệt về `/don-hang/<mã đơn>?vnp_*`) | người mua quay lại; `web` chuyển tiếp tham số có chữ ký tới `api`, chữ ký sai thì bỏ qua | không |
| `querydr` (api hỏi VNPay) | mỗi lần xem đơn còn `PENDING_PAYMENT`, trang kết quả hỏi lại mỗi 3 giây | không (api gọi ra ngoài) |
| IPN (VNPay gọi `GET /api/v1/payments/vnpay/ipn`) | VNPay chủ động | có, vì VNPay phải gọi vào máy bạn |

Giao dịch tới từ nhiều đường chỉ ghi sổ một lần (xem mục 3). Trang kết quả luôn hiển thị trạng thái đọc từ hệ thống, không tin tham số trên URL.

**Tunnel ngrok (tuỳ chọn)** để nhận IPN thật:

1. Lấy `NGROK_AUTHTOKEN` và một dev domain cố định (`NGROK_DOMAIN`, không kèm `https://`) trên dashboard ngrok, điền vào `.env`.
2. `docker compose --profile tunnel up -d` (service `tunnel` trỏ vào `api:8080`).
3. Trên portal merchant VNPay sandbox đặt IPN URL = `https://<NGROK_DOMAIN>/api/v1/payments/vnpay/ipn`.

Cảnh báo: khi bật tunnel, **toàn bộ `/api` (kể cả kết thúc sự kiện) lộ ra Internet** (mục 4b).

**Giả lập IPN có chữ ký để thử local** (ký bằng `VNPAY_HASH_SECRET` trong container `api`, từ chối chạy khi `APP_ENV=production`):

```bash
docker compose exec -T api node dist/scripts/send-ipn.js <mã đơn> <số tiền VND> <success|duplicate|bad-signature|bad-amount> [--txn <số>]
```

- `<số tiền VND>` = `buyerTotal` của đơn (script không đọc DB). `duplicate` bắt buộc `--txn` với số giao dịch mà lần `success` đã in ra.
- `RspCode` mong đợi: `success` 00, `duplicate` 02, `bad-signature` 97, `bad-amount` 04. Script in `OK` / `MISMATCH`, exit code 0 / 1.
- Cần `VNPAY_HASH_SECRET` khác rỗng. Chưa có khoá thật, đặt giá trị tuỳ ý để thử local: URL thanh toán vẫn được tạo nhưng không thanh toán thật được.

### Chạy test

| Lệnh | Phạm vi |
|---|---|
| `docker compose --profile test run --rm --build api-test` | Test api trên Postgres thật (`db-test`, dữ liệu trên tmpfs, tách khỏi DB dev) |
| `cd apps/web && pnpm test` | Vitest của web (cần `pnpm install` trước) |
| `cd apps/web && pnpm test:e2e` | E2E Playwright, 2 test, chạy trên stack đang chạy ở `http://localhost:3000` |

E2E ghi dữ liệu thật vào DB dev (đơn, sổ cái, kết thúc sự kiện) nên **chỉ chạy được một lần trên DB seed sạch**. Đã chạy xanh nguyên file một lần trên DB seed sạch: 2 passed (10,5 giây). Thứ tự trong file là test bottom sheet mobile chạy trước luồng chính: luồng chính kết thúc sự kiện Mùa Thu nên làm nút "Chọn" bị khoá, vì vậy chạy riêng test mobile sau luồng chính sẽ đỏ vì lý do đó, không phải lỗi app. Sau lần chạy E2E, DB dev không còn là seed sạch. Đặt lại DB (**lệnh phá huỷ: xoá toàn bộ dữ liệu dev**):

```bash
docker compose stop api web db && docker compose rm -f api web db && docker volume rm ticket_pgdata
docker compose up -d --build
```

Tên volume `ticket_pgdata` suy ra từ `name: ticket` trong `docker-compose.yml`; kiểm bằng `docker volume ls` nếu khác.

---

## 2. Cổng thanh toán: VNPay sandbox

Lý do (từ `specs/requirements.md` § Điểm Cần Làm Rõ, `specs/tech-stack.md`):

- Phù hợp người dùng Việt Nam và VND; sandbox công khai, có thẻ test NCB.
- Có đủ ba đường xác nhận mà brief cần: return URL có chữ ký, IPN ký HMAC-SHA512, API tra cứu giao dịch `querydr`. `querydr` cho phép chạy không cần tunnel.
- Ứng viên khác trong specs là MoMo test và PayOS; specs chỉ liệt kê, không có so sánh sâu hơn nên tôi không bịa thêm.

**Chưa kiểm với sandbox thật** (đã dựng theo tài liệu VNPay, test bằng khoá giả):

- Chuỗi ký request / response của `querydr` (nối bằng `|`, đúng thứ tự trường theo tài liệu).
- `vnp_IpAddr` khi chạy local là `127.0.0.1` (lấy từ header request).
- Việc VNPay chấp nhận URL thanh toán đã ký và thực sự gọi IPN theo định dạng giả định. Phần verify chữ ký có thử hai kiểu chuỗi ký (có / không có tham số rỗng) vì mẫu code của VNPay không thống nhất.

---

## 3. Các quyết định khi brief im lặng

Chi tiết ở [`specs/requirements.md`](specs/requirements.md) § Điểm Cần Làm Rõ, [`specs/architecture.md`](specs/architecture.md), [`specs/database.md`](specs/database.md).

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Giữ chỗ khi chờ thanh toán | 15 phút, không gia hạn. Hết hạn bằng job `croner` mỗi 60 giây và cả khi đọc (đơn quá hạn được cập nhật tại chỗ). Vé còn lại luôn tính từ đơn nên hết hạn có hiệu lực đúng giây thứ 900 dù job chưa chạy | Khớp `vnp_ExpireDate` của VNPay; không cần bảng giữ chỗ riêng, không cột "đã bán / đang giữ" có thể lệch |
| Tiền đến sau khi đơn hết hạn | Vẫn ghi nhận. Còn vé thì đơn thành `PAID`; hết vé hoặc sự kiện đã kết thúc thì `REFUND_REQUIRED`, tiền vào `BUYER_REFUND_PAYABLE` (hiện ở số dư khả dụng của người mua) | Tiền cổng đã xác nhận không được rơi khỏi sổ cái. Không có hoàn tiền thật (mục 4h) |
| Ba nguồn xác nhận trùng nhau | IPN, return, `querydr` dùng chung `PaymentRecorder.record()`. Chống ghi trùng 3 lớp: kiểm dưới khoá đơn, UNIQUE partial `payment_transactions.gateway_txn_no`, UNIQUE `ledger_transactions.idempotency_key = PAYMENT:<vnp_TransactionNo>`. Idempotency theo `vnp_TransactionNo` | Chạy được không cần tunnel; tới trước hay tới sau đều ra cùng kết quả; lớp 2-3 là chốt cuối khi code sai |
| Chống bán quá vé | Số còn lại tính từ `orders`; tạo đơn và ghi nhận thanh toán đều khoá `listings FOR UPDATE`. Không có lối tắt "đơn còn hạn thì `PAID`" | Đồng hồ `now()` của transaction có thể cũ hơn lúc lấy được khoá; chi tiết ở `specs/database.md` § Chống bán trùng |
| Làm tròn phí | Phí tính trên tổng dòng (giá x số lượng), làm tròn xuống; phần lẻ thuộc sàn. Ví dụ 333.333 x 1: người mua 366.666, người bán 316.667, sàn 49.999 | Tổng luôn cân; sàn giữ phần chênh |
| Khi nào phí sàn thành doanh thu | Lúc thanh toán chỉ vào `ESCROW_FEE`; kết thúc sự kiện mới chuyển sang `PLATFORM_FEE_REVENUE` | Nếu sự kiện huỷ thì hoàn được toàn bộ cho người mua |
| Mô hình sổ cái | Sổ kép 3 bảng, 6 loại tài khoản: `GATEWAY_CASH`, `ESCROW_SELLER`, `ESCROW_FEE`, `SELLER_PAYABLE`, `BUYER_REFUND_PAYABLE`, `PLATFORM_FEE_REVENUE`. Ba loại bút toán: `PAYMENT_CAPTURED`, `PAYMENT_REFUND_REQUIRED`, `EVENT_RELEASE` | Truy vết được từng đồng; phân biệt tiền bán vé với tiền cần hoàn |
| Số dư | Không có cột số dư; view `ledger_account_balances` là công thức duy nhất. Đang chờ = Σ `ESCROW_SELLER`; khả dụng = `SELLER_PAYABLE` + `BUYER_REFUND_PAYABLE` | "Mọi số dư derive từ sổ cái" của brief, không thể lệch |
| Bảo vệ sổ cái ở DB | Constraint trigger deferred kiểm Σ nợ = Σ có lúc COMMIT; trigger chặn UPDATE / DELETE (`LEDGER_IMMUTABLE`); trigger chặn thêm dòng vào giao dịch đã commit | Bug code không làm sổ lệch hoặc sửa lịch sử âm thầm |
| Kết thúc sự kiện | Một chiều, không đảo ngược. Đơn `PENDING_PAYMENT` của sự kiện thành `EXPIRED`; tiền về sau đi vào `REFUND_REQUIRED`, không vào ký quỹ đã đóng. Một giao dịch `EVENT_RELEASE` nhiều dòng | Ký quỹ đã đóng thì không được mở lại |
| Phân quyền | Không có. Dropdown chọn người dùng; Khu Quản Trị mở cho mọi người; header `X-User-Id` chỉ cho biết ai thao tác | Brief cho phép; ghi rõ ở mục 4 |
| Mua tin của chính mình | Cấm, trả `422 CANNOT_BUY_OWN_LISTING` (cả CHECK `buyer_id <> seller_id` ở DB) | Chi vừa bán vừa mua nên cần luật này |
| Huỷ sự kiện | Không hỗ trợ hoàn tiền từ ký quỹ | Ngoài phạm vi; ghi là bước tiếp theo |
| OpenAPI / codegen | Không dùng; `web` có lớp gọi api viết tay, schema Zod ở `api` | 2 app, 1 client, khoảng 15 endpoint |
| Cấu trúc | Hai app tách riêng; trình duyệt chỉ gọi `web` (BFF `/bff/*`), `web` gọi `api` trong mạng compose | `api` không cần CORS, không bị trình duyệt chạm trực tiếp |

---

## 4. Chưa sẵn sàng cho production và bước tiếp theo

Danh sách theo thứ tự ưu tiên (a-b quan trọng nhất).

| # | Hạng mục | Chi tiết |
|---|---|---|
| a | Chưa thử với VNPay sandbox thật | Chuỗi ký response `querydr`, `vnp_IpAddr=127.0.0.1`, URL thanh toán chưa được VNPay xác nhận. Mọi kiểm thử dùng khoá giả + `send-ipn` |
| b | Không có xác thực / phân quyền | Khu Quản Trị mở cho mọi người; `X-User-Id` giả được. **Bật tunnel thì toàn bộ `/api` lộ ra Internet.** Ai biết mã đơn đều lấy được URL thanh toán; người khác có thể mở phiên VNPay của đơn rồi huỷ, đơn thành `FAILED` |
| c | Giữ chỗ hàng loạt | Không giới hạn số đơn `PENDING_PAYMENT` hay số vé mỗi đơn, không rate limit; một người có thể giữ hết vé của tin trong 15 phút |
| d | Không có job đối soát `querydr` định kỳ | Không có IPN và không ai mở đơn thì tiền chưa được ghi nhận; `querydr` chỉ chạy khi có người xem đơn |
| e | DB chưa tách quyền | Một superuser; chưa có role `app_owner` / `app_runtime`; chưa đặt `lock_timeout` / `statement_timeout`; chưa có trigger chặn ghi tiền vào ký quỹ của sự kiện đã kết thúc ở tầng DB (hiện chỉ code đảm bảo) |
| f | `GET /v1/ledger` không scale | Cộng toàn bộ sổ mỗi lần gọi, không phân trang tài khoản; khi lớn cần snapshot số dư theo mốc |
| g | Không CI/CD, deploy, backup, giám sát | Chỉ chạy local. Sentry / APM / alert là việc tiếp theo |
| h | Chưa hoàn tiền thật | `REFUND_REQUIRED` và huỷ sự kiện mới chỉ ghi khoản phải trả (`BUYER_REFUND_PAYABLE`), không gọi API hoàn tiền của cổng |
| i | Hai chỗ dễ vỡ ở `web` | `POST /bff/orders` đọc body không giới hạn kích thước. Quên `import '@/lib/zod-config'` ở module schema mới sẽ làm lại lỗi CSP chặn `eval` của Zod |
| j | Rác trên máy dev | Image Docker nháp từ kiểm thử đột biến còn trên máy tôi (`docker image ls \| grep mut`), không nằm trong repo |
| k | 86 test case QA còn PENDING | Xem `specs/test-cases/web.md`: không giả lập được lỗi mạng, timeout, luồng cổng thật |

**Bước tiếp theo** (theo thứ tự): thử trọn luồng với sandbox thật; đăng nhập thật + phân quyền Khu Quản Trị và chỉ mở route IPN ra ngoài; job đối soát `querydr`; rate limit + giới hạn giữ chỗ; role DB least-privilege và timeout; hoàn tiền thật; CI/CD; giám sát.

---

## 5. Cách dùng AI và thời gian

**Quy trình.** Tôi dùng Claude Code làm điều phối viên (orchestrator) và giao việc cho các agent chuyên biệt, mỗi agent một vai: `requirement-analyst`, `business-analyst`, `architect`, `implementer`, `code-reviewer`, `security-reviewer`, `ui-reviewer`, `qa-functional`, `test-engineer`, `devops`, `git-manager`. Luồng: requirements, functional spec, kiến trúc / tech stack / database (đều là file trong `specs/`), rồi implement từng lát (api trước, web sau), review, vòng sửa (fix-loop) cho tới khi hết lỗi mức NGHIÊM TRỌNG và CẢNH BÁO. Sau đó viết test, làm mutation check thủ công (phá có chủ đích một đoạn code tiền để xem test có bắt được không; các image `*-mut*` ở mục 4j là dấu vết), và QA chức năng trên trình duyệt thật. Quy tắc điều phối nằm ở `CLAUDE.md`, `ORCHESTRATION.md`.

**Thống kê có thật**: lịch sử commit xem bằng `git log --oneline`; 379 test api, 288 test Vitest web, 2 E2E, 215 test case QA (111 PASS / 19 PARTIAL / 85 PENDING) (nguồn số liệu: xem mục Tóm tắt).

**Lỗi thật mà review / test bắt được** (còn dấu vết trong specs hoặc git log):

- Bán vượt vé khi tiền đến sát giờ hết hạn: đơn còn hạn theo `now()` cũ của transaction có thể đã mất vé cho đơn khác trong lúc chờ khoá. Đã bỏ lối tắt "còn hạn thì `PAID`", mọi thanh toán đi chung phép kiểm tồn kho (`specs/database.md` § Chống bán trùng; commit `302f654`).
- `ledger_entry_guard` fail-open có race thật: khi không thấy giao dịch cha, trigger cho qua. Đổi thành fail-closed bằng migration `202610291000_ledger_entry_guard_fail_closed`.
- CSP chặn `<style>` do thư viện chèn lúc chạy: phải truyền nonce (`get-nonce`), bỏ `sonner` / `vaul` (commit `afb1f36`).
- Nonce CSP bị ghi đè sau Server Action khi layout dựng lại (commit `e661522`).
- Zod gọi `new Function` bị CSP chặn: bật `jitless` (commit `049bfda`).
- Focus không trả về nút mở khi đóng dialog kết thúc sự kiện (commit `b262ecd`).

**Thời gian làm**: TODO(người nộp bài): tổng số giờ thực tế

---

## Cấu trúc repo

| Đường dẫn | Nội dung |
|---|---|
| `apps/api/` | Fastify 5 + Kysely: REST, VNPay, sổ cái, job hết hạn, migration + seed, `src/scripts/send-ipn.ts` |
| `apps/web/` | Next.js 16: trang SSR, BFF `/bff/*`, unit test (`test/`), E2E (`e2e/`) |
| `specs/` | Đặc tả chuẩn: [`requirements.md`](specs/requirements.md), [`architecture.md`](specs/architecture.md), [`tech-stack.md`](specs/tech-stack.md), [`database.md`](specs/database.md), `functional-spec/` ([api](specs/functional-spec/api.md), [web](specs/functional-spec/web.md)), [`test-cases/web.md`](specs/test-cases/web.md) |
| `assets/` | Brief gốc của bài test |
| `docker-compose.yml` | `db`, `api`, `web`; profile `tunnel` (ngrok); profile `test` (`db-test`, `api-test`) |
| `docker-compose.override.yml` | Publish port `127.0.0.1:8080` (api) và `127.0.0.1:3000` (web) |
| `.env.example` | Mẫu cấu hình; khoá bên thứ ba để trống |
