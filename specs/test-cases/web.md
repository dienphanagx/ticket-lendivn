# Test Cases — Web

## TÓM TẮT
- **Spec**: `specs/functional-spec/web.md`
- **Actor**: Người mua · Người bán

**Trạng thái:** ✅ PASS · ❌ FAIL · ⚠️ PARTIAL · 🔄 PENDING

### Chỉ mục

| Mục | Chức năng | Spec Ref | Trạng thái |
|-----|-----------|----------|------------|
| A.1 | Chọn Tài Khoản Hiện Tại | §A. Chọn Người Dùng | ⚠️ PARTIAL |
| B.1 | Xem Danh Sách Sự Kiện | §B. Sự Kiện | ⚠️ PARTIAL |
| B.2 | Xem Trang Sự Kiện | §B. Sự Kiện | ⚠️ PARTIAL |
| C.1 | Chọn Vé Và Xem Tổng Tiền | §C. Mua Vé | 🔄 PENDING |
| C.2 | Xác Nhận Thanh Toán | §C. Mua Vé | ⚠️ PARTIAL |
| C.3 | Xem Kết Quả Thanh Toán | §C. Mua Vé | ⚠️ PARTIAL |
| D.1 | Xem Số Dư Và Lịch Sử Bút Toán | §D. Tài Khoản | ⚠️ PARTIAL |
| D.2 | Xem Danh Sách Đơn Hàng | §D. Tài Khoản | ⚠️ PARTIAL |
| E.1 | Đánh Dấu Sự Kiện Kết Thúc | §E. Quản Trị | ⚠️ PARTIAL |
| E.2 | Xem Sổ Cái Và Số Dư Sàn | §E. Quản Trị | ⚠️ PARTIAL |

---

## A. Chọn Người Dùng

> Spec ref: §A. Chọn Người Dùng — `specs/functional-spec/web.md#a-chọn-người-dùng`

### A.1 Chọn Tài Khoản Hiện Tại

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| A.1-01 | 1 | Nhấn dropdown tài khoản trên thanh đầu trang | — | — | Dropdown mở | ✅ PASS | |
| A.1-02 | 2 | Hệ thống mở danh sách thả xuống | — | — | 4 mục tên hiển thị (Lê Minh Chi, Nguyễn Văn An, Phạm Quốc Dũng, Trần Thị Bình); tài khoản đang chọn có dấu chọn; chưa chọn thì dropdown ghi "Chọn tài khoản" | ✅ PASS | |
| A.1-03 | 3 | Chọn "Phạm Quốc Dũng" trong danh sách | — | — | Menu đóng | ✅ PASS | |
| A.1-04 | 4 | Hệ thống lưu lựa chọn, tải lại dữ liệu trang theo tài khoản mới | `selectUser` (Server Action) | — | Dropdown ghi tên mới; nội dung trang theo góc nhìn tài khoản (nhãn "Tin của bạn", nút Chọn đổi trạng thái) | ✅ PASS | |
| A.1-05 | 4 | Hệ thống hiển thị thông báo ngắn "Đang xem với tài khoản {tên}" tự ẩn sau 3 giây | — | — | Thông báo xuất hiện sau khi đổi, ẩn sau 3 giây | ✅ PASS | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| A.1-06 | Tài khoản được chọn | Mã không có trong danh sách `api` | UI | Không chọn được mã ngoài danh sách (dropdown chỉ liệt kê mã hợp lệ) | 🔄 PENDING | |
| A.1-07 | Tài khoản được chọn | Mã không có trong danh sách (bypass UI) | API | `selectUser` trả lỗi `USER_NOT_FOUND`, không đặt cookie | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| A.1-08 | Không tải được danh sách tài khoản | UI | Trong dropdown: "Không tải được danh sách tài khoản" + nút "Thử lại" | 🔄 PENDING | Chưa giả lập được lỗi `api` (không dừng container) |
| A.1-09 | Danh sách tài khoản rỗng | UI | "Chưa có tài khoản mẫu, vui lòng nạp dữ liệu mẫu" | 🔄 PENDING | Cần xoá dữ liệu seed, không thực hiện |
| A.1-10 | Tài khoản đã lưu không còn tồn tại | UI | Xoá lựa chọn, về "Chọn tài khoản", hiển thị "Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại" | 🔄 PENDING | Cần nạp lại seed, không thực hiện |
| A.1-11 | Đổi sang người bán của tin đang chọn (Dũng chọn tin Bình, đổi sang Bình) | UI | Bỏ lựa chọn vé, hiển thị "Bạn không thể mua tin bán của chính mình" | ✅ PASS | |
| A.1-12 | Đổi sang tài khoản khác không phải người bán của tin đang chọn (Dũng → An khi đang chọn tin Bình) | UI | Giữ nguyên tin bán và số lượng | ✅ PASS | |
| A.1-13 | Đổi tài khoản khi đang ở trang kết quả của một đơn | UI | Xử lý theo §C Xem Kết Quả Thanh Toán ("Không tìm thấy đơn hàng" thay nội dung tại chỗ) | 🔄 PENDING | Chưa thử đổi tại chỗ trên trang đơn; mở trực tiếp bằng tài khoản khác đã PASS ở C.3-15 |
| A.1-14 | Chưa chọn tài khoản, vào /tai-khoan, /don-hang, /quan-tri, /quan-tri/so-cai hoặc nhấn "Chọn" ở tin bán | UI | "Vui lòng chọn tài khoản để tiếp tục" và mở dropdown chọn tài khoản | ✅ PASS | |
| A.1-15 | Mất kết nối mạng | UI | "Mất kết nối, vui lòng kiểm tra mạng", giữ nguyên trang và lựa chọn | 🔄 PENDING | Chưa giả lập mất mạng |
| A.1-16 | `api` không phản hồi 15 giây hoặc lỗi hệ thống | UI | "Có lỗi xảy ra, vui lòng thử lại sau" + nút "Thử lại"; lỗi dựng trang từ máy chủ → trang lỗi chung, giữ URL | 🔄 PENDING | Chưa giả lập lỗi `api` |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| A.1-17 | Không đăng nhập | Dùng website | Không có form đăng nhập / mật khẩu / xác minh | ✅ PASS | |
| A.1-18 | Lưu lựa chọn | Chọn Dũng rồi tải lại trang | Vẫn là Dũng sau khi tải lại | ✅ PASS | |
| A.1-19 | Cookie 30 ngày | Cookie `current_user_id` hiệu lực 30 ngày, giữ khi mở tab mới và khi quay về từ cổng | Max-Age 30 ngày; mở tab mới / quay về cổng vẫn giữ | 🔄 PENDING | Cookie httpOnly, chưa đọc được Max-Age; chưa thử tab mới / quay về từ cổng |
| A.1-20 | Người bán vẫn mua | An (có tin bán) xem trang sự kiện | Nút "Chọn" ở tin của Chi và Bình bật; chỉ tin của An bị khoá | ✅ PASS | |
| A.1-21 | Chưa chọn vẫn xem được | Chưa chọn tài khoản, mở danh sách và trang sự kiện | Xem được đầy đủ, nội dung giống khi đã chọn | ✅ PASS | |
| A.1-22 | Thanh đầu trang mọi trang | Mở /, trang sự kiện, /don-hang, /tai-khoan, /quan-tri, sổ cái, trang 404 | Có dropdown + liên kết "Sự kiện", "Đơn hàng", "Tài khoản", "Quản trị" | ✅ PASS | |
| A.1-23 | Yêu cầu kèm mã tài khoản | Mọi yêu cầu tới `api` kèm mã tài khoản đang chọn | Header `X-User-Id` theo cookie | 🔄 PENDING | Chưa quan sát request server → api |
| A.1-24 | Định dạng tiền | Hiển thị số tiền | VND số nguyên, dấu chấm ngăn hàng nghìn, hậu tố "₫" (vd `1.650.000 ₫`) | ✅ PASS | |
| A.1-25 | Số tiền âm | Bút toán giảm | Dấu "−" phía trước | 🔄 PENDING | Chưa gặp dòng âm trên UI (tài khoản đã xem chỉ có dòng +) |
| A.1-26 | Định dạng thời gian | Hiển thị thời điểm | `dd/MM/yyyy HH:mm` múi giờ Asia/Ho_Chi_Minh (vd 15:27Z → 22:27) | ✅ PASS | |
| A.1-27 | Responsive 360px | Mở trang sự kiện ở 360×740 | Không cuộn ngang | ✅ PASS | |
| A.1-28 | Vùng chạm 44×44px | Nút thao tác | Tối thiểu 44×44px | 🔄 PENDING | Không có công cụ đo kích thước phần tử |
| A.1-29 | Khung chờ | Tải /tai-khoan | Skeleton đúng vị trí nội dung | ✅ PASS | |
| A.1-32 | CSP sau Server Action | Mở /su-kien/dem-nhac-mua-thu-2027, đổi tài khoản bằng dropdown (Server Action), mở lại dropdown 2 lần; đổi tài khoản lần hai rồi mở lại 2 lần | 0 vi phạm CSP (`securitypolicyviolation`) phát sinh khi mở dropdown sau action; console không lỗi | ✅ PASS | |
| A.1-33 | CSP khi tải trang sự kiện | Tải /su-kien/dem-nhac-mua-thu-2027 (desktop 1280×800 và 360×740) | 0 vi phạm CSP khi tải trang | ⚠️ PARTIAL | Còn đúng 1 sự kiện `securitypolicyviolation` lúc tải (t≈110–230ms, trước mọi thao tác): `script-src` chặn `eval` tại `/_next/static/chunks/3lvevp_x87fl7.js:53` (dò `Function("")` trong try/catch, có vẻ của zod); không lặp lại khi mở dropdown / sau action, console không lỗi; `/` và trang 404 không bị. Không kiểm được nonce `<style>`: DOM không có thẻ `<style>`; nonce `<script>` có và khớp header CSP |

#### Phân quyền

| TC | Actor | Hành động | Expected | Status | Ghi chú |
|----|-------|-----------|----------|--------|---------|
| A.1-30 | Người mua (Dũng, chỉ mua) | Mở /quan-tri và thao tác kết thúc sự kiện | Thực hiện được, không phân quyền theo vai trò | ✅ PASS | |
| A.1-31 | Người bán (An) | Xem trang sự kiện, chọn tin của người khác | Thực hiện được | ✅ PASS | |

---

## B. Sự Kiện

> Spec ref: §B. Sự Kiện — `specs/functional-spec/web.md#b-sự-kiện`

### B.1 Xem Danh Sách Sự Kiện

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| B.1-01 | 1 | Mở trang chủ | — | `/` | Trang danh sách sự kiện | ✅ PASS | |
| B.1-02 | 2 | Hệ thống hiển thị danh sách thẻ (dựng từ máy chủ) | `GET /v1/events` | — | Mỗi thẻ: tên, thời gian, địa điểm, "Từ {giá} ₫", "Còn N vé", nhãn "Đang bán" (Mùa Thu: Từ 450.000 ₫, Còn 16 vé; Biển: Từ 333.333 ₫, Còn 9 vé) | ✅ PASS | |
| B.1-03 | 3 | Nhấn một thẻ sự kiện | — | `/su-kien/:slug` | Chuyển sang trang sự kiện | ⚠️ PARTIAL | Chỉ xác nhận href `/su-kien/dem-nhac-mua-thu-2027` trong a11y tree, chưa bấm thẻ |
| B.1-04 | 4 | Hệ thống hiển thị trang sự kiện | — | — | Nội dung theo B.2 | ⚠️ PARTIAL | Vào bằng URL trực tiếp, chưa qua thao tác bấm thẻ |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| B.1-05 | Chưa có sự kiện nào | UI | "Chưa có sự kiện nào" | 🔄 PENDING | Cần xoá seed, không thực hiện |
| B.1-06 | Sự kiện đang bán nhưng mọi tin hết vé | UI | Thẻ "Hết vé" thay cho giá và số vé còn lại | 🔄 PENDING | |
| B.1-07 | Sự kiện đã kết thúc | UI | Nhãn "Đã kết thúc", không hiển thị giá và số vé còn lại | ⚠️ PARTIAL | Sau kết thúc Mùa Thu, SSR trang `/` có thẻ nhãn "Đã kết thúc"; chưa xác nhận ẩn giá / số vé |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| B.1-08 | Sắp xếp | "Đang bán" trước, mỗi nhóm theo thời gian tăng dần | Mùa Thu (20/03) trước Biển (15/05); đã kết thúc xuống sau | ⚠️ PARTIAL | Thứ tự tăng dần đúng trước khi kết thúc; thứ tự sau kết thúc mới xác nhận ở `/quan-tri` (Biển trước Mùa Thu), chưa đọc thứ tự thẻ ở `/` |
| B.1-09 | Không phân trang | Danh sách 2 sự kiện | Không có điều khiển phân trang | ✅ PASS | |
| B.1-10 | Vé giữ chỗ không tính vào số còn lại | Dũng tạo đơn 2 vé Bình (chờ) | Số còn lại giảm (Mùa Thu 16 → 14 theo `GET /v1/events`) | ⚠️ PARTIAL | Xác nhận ở `api` và trang sự kiện (Bình còn 1 vé), chưa tải lại `/` sau khi tạo đơn |
| B.1-11 | SEO robots (ngoài production) | `/robots.txt` và `curl -sI /` ở môi trường local | `Disallow: /`; header `X-Robots-Tag: noindex, nofollow` | ⚠️ PARTIAL | `/robots.txt` có `Disallow: /`; `curl -sI /` thẳng app không có `X-Robots-Tag` (local không có edge nginx) |

### B.2 Xem Trang Sự Kiện

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| B.2-01 | 1 | Mở URL trang sự kiện | — | `/su-kien/dem-nhac-mua-thu-2027` | Trang sự kiện | ✅ PASS | |
| B.2-02 | 2 | Hệ thống hiển thị thông tin (dựng từ máy chủ) | — | — | Tên, thời gian, địa điểm, mô tả, nhãn "Đang bán"; mỗi tin: tên người bán, giá, số vé còn lại, nút "Chọn" | ✅ PASS | |
| B.2-03 | 3 | Xem danh sách tin bán | — | — | Thứ tự Chi 450.000, An 500.000, Bình 750.000 | ✅ PASS | |
| B.2-04 | 4 | Hệ thống đánh dấu tin theo tài khoản đang chọn | — | — | Nhãn "Tin của bạn" và nút "Chọn" vô hiệu ở tin của chính tài khoản | ✅ PASS | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| B.2-05 | Slug | Sai dạng (`Bad_Slug`) | UI | HTTP 404, "Không tìm thấy sự kiện" | ✅ PASS | |
| B.2-06 | Slug | Sai dạng (`Bad_Slug`) | API | Không gọi `api` | 🔄 PENDING | Chưa quan sát request |
| B.2-07 | Slug | 101 ký tự | UI | 404 "Không tìm thấy sự kiện" | 🔄 PENDING | |
| B.2-08 | Slug | 101 ký tự | API | Không gọi `api` | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| B.2-09 | Slug không tồn tại (`khong-co-slug`) | UI | HTTP 404 "Không tìm thấy sự kiện" | ✅ PASS | |
| B.2-10 | Slug không tồn tại | API | 404 + `code` theo spec `api` | 🔄 PENDING | |
| B.2-11 | Sự kiện không có tin bán | UI | "Sự kiện chưa có tin bán vé" | 🔄 PENDING | Không có dữ liệu phù hợp |
| B.2-12 | Tin còn 0 vé | UI | Nhãn "Hết vé", nút "Chọn" vô hiệu (tin Chi sau khi bị mua hết) | ✅ PASS | |
| B.2-13 | Sự kiện đã kết thúc | UI | Băng "Sự kiện đã kết thúc, ngừng bán vé"; mọi nút "Chọn" vô hiệu; ẩn số vé còn lại | ⚠️ PARTIAL | SSR có băng thông báo; chưa xác nhận nút bị vô hiệu và số vé bị ẩn |
| B.2-14 | Chưa chọn tài khoản, nhấn "Chọn" tin Bình | UI | Thông báo yêu cầu chọn tài khoản + mở dropdown; chọn Dũng xong mở khu chọn số lượng của tin Bình | ✅ PASS | |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| B.2-15 | Sắp xếp tin | Khác giá | Giá tăng dần | ✅ PASS | |
| B.2-16 | Sắp xếp tin | Cùng giá | Tin còn nhiều vé hơn đứng trước | 🔄 PENDING | Dữ liệu seed không có hai tin cùng giá |
| B.2-17 | Số còn lại | Bình: 4 vé, 2 đã bán, 1 đang giữ chỗ | Hiển thị "Còn 1 vé" | ✅ PASS | |
| B.2-18 | Nội dung không phụ thuộc tài khoản | Xem khi chưa chọn và khi đã chọn | Cùng sự kiện, tin, giá, số còn lại | ✅ PASS | |
| B.2-19 | Không mua tin của chính mình | Chi / An / Bình xem tin của mình | Nút "Chọn" vô hiệu | ✅ PASS | |
| B.2-20 | URL | Trang sự kiện | `/su-kien/[slug]`, slug không dấu | ✅ PASS | |

---

## C. Mua Vé

> Spec ref: §C. Mua Vé — `specs/functional-spec/web.md#c-mua-vé`

### C.1 Chọn Vé Và Xem Tổng Tiền

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| C.1-01 | 1 | Dũng nhấn "Chọn" ở tin Bình | — | — | Khu chọn số lượng mở | ✅ PASS | |
| C.1-02 | 2 | Hệ thống mở khu chọn số lượng | `GET /bff/listings/:id/quote` | — | Người bán Trần Thị Bình, giá 750.000 ₫, còn 4, ô số lượng mặc định 1 với nút "Giảm"/"Tăng", bảng tạm tính 750.000 / 75.000 / 825.000, nút "Thanh toán" | ✅ PASS | |
| C.1-03 | 2 | Mở khu chọn ở viewport 360×740 (dưới 768px) | — | — | Hiển thị dạng bottom sheet, không cuộn ngang | ✅ PASS | |
| C.1-04 | 3 | Nhấn "Tăng" lên 2 | — | — | Số lượng = 2 | ✅ PASS | |
| C.1-05 | 4 | Hệ thống tính lại bảng tạm tính | `GET /bff/listings/:id/quote?quantity=2` | — | Tiền vé 1.500.000 / Phí dịch vụ (10%) 150.000 / Tổng thanh toán 1.650.000 | ✅ PASS | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| C.1-06 | Số lượng | Để trống | UI | "Vui lòng nhập số lượng", nút "Thanh toán" vô hiệu, bảng tạm tính "—" | ✅ PASS | |
| C.1-07 | Số lượng | Để trống (bypass UI) | API | 400 `VALIDATION_FAILED`, `details` có key `quantity` | 🔄 PENDING | |
| C.1-08 | Số lượng | Nhập 0 | UI | "Số lượng tối thiểu là 1", nút "Thanh toán" vô hiệu, bảng "—" | ✅ PASS | |
| C.1-09 | Số lượng | Nhập 0 (bypass UI) | API | 400 `VALIDATION_FAILED`, `details` có key `quantity` | 🔄 PENDING | |
| C.1-10 | Số lượng | Gõ ký tự không phải 0-9 (`a`, `-`, `.`, `e`) | UI | Ô chỉ nhận chữ số | ✅ PASS | |
| C.1-11 | Số lượng | Không phải số nguyên (bypass UI) | API | 400 `VALIDATION_FAILED`, `details` có key `quantity` | 🔄 PENDING | |
| C.1-12 | Số lượng | Nhập 9 (tin còn 4) | UI | "Chỉ còn 4 vé", nút "Thanh toán" vô hiệu, bảng "—" | ✅ PASS | |
| C.1-13 | Số lượng | Lớn hơn số còn lại (bypass UI) | API | 409 + `code` hết vé theo spec `api` | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| C.1-14 | Số lượng = 1 | UI | Nút "Giảm" vô hiệu | ✅ PASS | |
| C.1-15 | Số lượng bằng số vé còn lại | UI | Nút "Tăng" vô hiệu | 🔄 PENDING | |
| C.1-16 | Nhấn "Chọn" ở tin khác | UI | Khu chọn chuyển sang tin mới, số lượng đặt lại 1 | 🔄 PENDING | |
| C.1-17 | Nhấn Esc khi khu chọn đang mở (bottom sheet 360px) | UI | Đóng khu chọn, không tạo đơn | ✅ PASS | |
| C.1-18 | Đóng bằng nút đóng / vuốt xuống bottom sheet | UI | Đóng khu chọn, không tạo đơn | 🔄 PENDING | Có nút "Đóng" trong a11y tree nhưng chưa bấm; chưa thử vuốt |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| C.1-19 | Chỉ chọn 1 tin | Chọn tin mới khi đã mở khu chọn | Khu chọn chỉ có một tin | ✅ PASS | |
| C.1-20 | Phí làm tròn xuống | Tin Bình 333.333 ₫ × 1 | Phí = 33.333 ₫ (làm tròn xuống), tổng 366.666 ₫ | 🔄 PENDING | Chưa chạy tin 333.333 ₫ |
| C.1-21 | Số tạm tính chỉ để hiển thị | Đơn thật 2 vé Bình | Đơn do `api` tính: buyerTotal 1.650.000 trùng tạm tính | ✅ PASS | |
| C.1-22 | Không hiển thị 5% người bán | Xem khu chọn số lượng | Không có dòng phí / khấu trừ của người bán | ✅ PASS | |

### C.2 Xác Nhận Thanh Toán

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| C.2-01 | 1 | Dũng nhấn "Thanh toán" (2 vé Bình) | — | — | Gửi yêu cầu | ✅ PASS | |
| C.2-02 | 2 | Nút chuyển trạng thái đang xử lý | — | — | Nút "Đang tạo đơn…" vô hiệu, ô số lượng bị khoá | 🔄 PENDING | Phản hồi quá nhanh, chưa bắt được trạng thái trung gian |
| C.2-03 | 3 | Hệ thống tạo đơn, giữ chỗ | `POST /bff/orders` | — | 200, đơn `2610290V770BOGVN` PENDING_PAYMENT, Mùa Thu còn lại 16 → 14 | ✅ PASS | |
| C.2-04 | 4 | Hệ thống lấy liên kết và chuyển sang cổng VNPay sandbox | `POST /bff/orders/:id/payment-url` | `https://sandbox.vnpayment.vn/...` | 200; trình duyệt chuyển sang cổng với số tiền = tổng thanh toán | ⚠️ PARTIAL | Có chuyển sang `sandbox.vnpayment.vn/paymentv2/Payment/Error.html?code=72` (cổng từ chối do TMN / secret giả, chủ đích); không kiểm được số tiền trên trang cổng |
| C.2-05 | 5 | Nhập thẻ test và xác nhận trên cổng | — | — | Thanh toán trên cổng | 🔄 PENDING | Không thanh toán thật được (secret giả); kết quả giả lập bằng send-ipn |
| C.2-06 | 6 | Cổng chuyển người mua về trang kết quả | — | `/don-hang/:mã` | Về `/don-hang/{mã đơn}` | 🔄 PENDING | Không đi qua cổng thật |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| C.2-07 | Số lượng | Không hợp lệ (9 > còn 4) | UI | Nút "Thanh toán" vô hiệu, không gửi yêu cầu | ✅ PASS | |
| C.2-08 | Khoá chống trùng | Thiếu `Idempotency-Key` (bypass UI) | API | 400 `VALIDATION_FAILED` | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| C.2-09 | Tin Chi (còn 1) bị người khác mua mất lúc đang chọn, Dũng nhấn "Thanh toán" | UI | Không tạo đơn; đóng khu chọn; tin "Hết vé"; thông báo "Tin bán này vừa hết vé" | ✅ PASS | |
| C.2-10 | Như C.2-09 | API | 409 + `code` hết vé theo spec `api` | 🔄 PENDING | Chưa gọi trực tiếp |
| C.2-11 | Vé còn lại ít hơn số chọn lúc tạo đơn (còn N > 0) | UI | "Chỉ còn {N} vé, vui lòng chọn lại số lượng" | 🔄 PENDING | Quote làm mới số còn lại ngay khi đổi số lượng ("Chỉ còn 1 vé" từ validation); chưa tạo được race thật |
| C.2-12 | Sự kiện kết thúc trong lúc đang chọn | UI | Không tạo đơn, đóng khu chọn, băng "Sự kiện đã kết thúc, ngừng bán vé" | 🔄 PENDING | |
| C.2-13 | Tạo đơn sau khi sự kiện đã kết thúc | API | 409 `EVENT_NOT_ON_SALE` | ✅ PASS | |
| C.2-14 | Tin bán của chính tài khoản | UI | "Bạn không thể mua tin bán của chính mình" | ✅ PASS | |
| C.2-15 | Tin bán của chính tài khoản | API | 4xx + `code` theo spec `api` | 🔄 PENDING | |
| C.2-16 | Tin bán không còn tồn tại | UI | Đóng khu chọn, tải lại danh sách, "Tin bán không còn tồn tại" | 🔄 PENDING | |
| C.2-17 | Mất mạng hoặc quá 15 giây khi tạo đơn | UI | Mở lại nút, "Chưa tạo được đơn, vui lòng thử lại"; bấm lại không tạo đơn thứ hai | 🔄 PENDING | |
| C.2-18 | Không mở được trang cổng thanh toán | UI | "Không kết nối được cổng thanh toán, vui lòng thử lại sau"; đơn giữ chờ thanh toán | 🔄 PENDING | |
| C.2-19 | Nhấn Back từ cổng về trang sự kiện | UI | Số vé còn lại tải lại (đã trừ giữ chỗ); đơn vẫn chờ | 🔄 PENDING | |
| C.2-20 | Huỷ / thất bại trên cổng | UI | Cổng chuyển về trang kết quả, trạng thái theo `api` | 🔄 PENDING | |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| C.2-21 | Khoá chống trùng | Đổi tin hoặc số lượng | Sinh khoá UUID v4 mới | 🔄 PENDING | |
| C.2-22 | Địa chỉ quay về | Liên kết thanh toán | Quay về `/don-hang/{mã đơn}` | 🔄 PENDING | Không đọc được URL cổng (chứa chữ ký) |
| C.2-23 | Không "tiếp tục thanh toán" | Mở đơn đang chờ | Không có nút tiếp tục thanh toán | ✅ PASS | |
| C.2-24 | Một lần bấm một yêu cầu | Bấm "Thanh toán" một lần | Chỉ 1 `POST /bff/orders` | ✅ PASS | |

### C.3 Xem Kết Quả Thanh Toán

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| C.3-01 | 1 | Mở `/don-hang/2610290V770BOGVN` bằng tài khoản người mua | — | `/don-hang/:mã` | Trang kết quả đơn | ✅ PASS | |
| C.3-02 | 2 | Hệ thống hiển thị đơn đang chờ | `GET /v1/orders/:id` | — | Mã đơn, sự kiện, người bán, 2 vé, 750.000, tiền vé 1.500.000, phí 150.000, tổng 1.650.000, thời điểm tạo 29/10/2026 22:27; khối "Đang chờ xác nhận thanh toán từ cổng…", "Giữ vé đến 22:42" | ✅ PASS | |
| C.3-03 | 2 | Đơn đã thanh toán (sau IPN success) | — | — | "Thanh toán thành công", thời điểm thanh toán, nút "Xem đơn hàng" | ⚠️ PARTIAL | Thấy "Thanh toán thành công"; chưa kiểm thời điểm thanh toán và nút "Xem đơn hàng" |
| C.3-04 | 2 | Đơn thất bại | — | — | "Thanh toán không thành công. Vé đã được trả lại cho tin bán.", nút "Quay lại sự kiện" | 🔄 PENDING | |
| C.3-05 | 2 | Đơn hết hạn (`261029R73B57KB4H`) | — | — | "Đơn đã hết hạn giữ chỗ. Vé đã được trả lại cho tin bán.", nút "Quay lại sự kiện" | ✅ PASS | |
| C.3-06 | 2 | Đơn cần hoàn tiền | — | — | "Đã nhận thanh toán nhưng vé không còn đủ. {tổng} ₫ sẽ được hoàn lại…", nút "Xem tài khoản" | 🔄 PENDING | |
| C.3-07 | 3-4 | Ở lại trang khi đơn chờ rồi send-ipn success | `GET /v1/orders/:id` | — | Trang tự đổi sang "Thanh toán thành công" trong ≤ 20s | ✅ PASS | |
| C.3-08 | 4 | Dừng hỏi lại khi đơn ra khỏi trạng thái chờ | — | — | Không còn hỏi lại | 🔄 PENDING | |
| C.3-09 | 2 | Cổng chuyển về kèm `vnp_*` | `GET /v1/payments/vnpay/return` | — | Chuyển tiếp nguyên tham số cho `api`, redirect về URL không còn query | 🔄 PENDING | Không có chữ ký hợp lệ do secret ẩn |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| C.3-10 | Mã đơn | Sai dạng `abc` kèm `vnp_*` | UI | HTTP 404, "Không tìm thấy đơn hàng" | ✅ PASS | |
| C.3-11 | Mã đơn | Sai dạng `abc` | API | Không gọi `api` (kể cả có `vnp_*`) | 🔄 PENDING | |
| C.3-12 | Mã đơn | 16 ký tự đúng dạng nhưng không tồn tại (`ZZZZZZZZZZZZZZZZ`) | UI | HTTP 404, "Không tìm thấy đơn hàng" | ✅ PASS | |
| C.3-13 | Mã đơn | `ZZZZZZZZZZZZZZZZ` | API | 404 `ORDER_NOT_FOUND` | 🔄 PENDING | |
| C.3-14 | Tham số quay về | Có `vnp_*` nhưng thiếu `vnp_SecureHash` | UI | Không chuyển tiếp, vẫn redirect về URL không query | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| C.3-15 | Bình (người bán) mở đơn của Dũng | UI | HTTP 404, chỉ "Không tìm thấy đơn hàng", không lộ chi tiết đơn | ✅ PASS | |
| C.3-16 | Chưa chọn tài khoản kèm `vnp_*` | UI | Chuyển tiếp rồi redirect về URL không query, rồi yêu cầu chọn tài khoản | 🔄 PENDING | |
| C.3-17 | `api` từ chối ghi nhận từ đường quay về | UI | Không hiện lỗi kỹ thuật, redirect, hiển thị trạng thái thật | 🔄 PENDING | |
| C.3-18 | Tải lại / Back sau redirect | UI | Không chuyển tiếp lại | 🔄 PENDING | |
| C.3-19 | Sau 120 giây đơn vẫn chờ | UI | Dừng hỏi lại, "Chưa nhận được xác nhận từ cổng thanh toán…" + nút "Kiểm tra lại" | 🔄 PENDING | |
| C.3-20 | Một lần hỏi lại lỗi mạng / hệ thống | UI | Giữ khối trạng thái, lần sau theo `retryAfterSeconds` gần nhất | 🔄 PENDING | |
| C.3-21 | Đơn đổi trạng thái khi đang xem | UI | Thay khối trạng thái và đọc cho trình đọc màn hình | 🔄 PENDING | Chưa kiểm vùng aria-live |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| C.3-22 | IPN success | `send-ipn 2610290V770BOGVN 1650000 success` | RspCode 00 "Confirm Success"; đơn PAID; sổ cái: GATEWAY_CASH nợ 1.650.000, ESCROW_SELLER có 1.425.000, ESCROW_FEE có 225.000 | ✅ PASS | |
| C.3-23 | IPN duplicate | `duplicate --txn 19663174` sau success | RspCode 02 "Order already confirmed"; sổ cái vẫn 1 giao dịch PAYMENT_CAPTURED | ✅ PASS | |
| C.3-24 | IPN sai chữ ký | `bad-signature` trên đơn `26102980XPBF0BRD` | RspCode 97; đơn giữ PENDING_PAYMENT | ✅ PASS | |
| C.3-25 | IPN sai số tiền | `bad-amount` trên đơn `26102980XPBF0BRD` | RspCode 04; đơn giữ PENDING_PAYMENT | ✅ PASS | |
| C.3-26 | Số tiền do `api` ghi | Trang đơn | Hiển thị đúng số `api` (1.650.000), không dùng số tạm tính | ✅ PASS | |
| C.3-27 | Phạm vi xem | Người bán (Bình) của đơn do Dũng mua | Không xem được | ✅ PASS | |
| C.3-28 | Thông báo tới trước khi quay về | Mở trang sau khi IPN đã tới | Hiển thị ngay trạng thái đã ghi nhận, không qua chờ | 🔄 PENDING | |

---

## D. Tài Khoản

> Spec ref: §D. Tài Khoản — `specs/functional-spec/web.md#d-tài-khoản`

### D.1 Xem Số Dư Và Lịch Sử Bút Toán

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| D.1-01 | 1 | Nhấn "Tài khoản" trên thanh đầu trang | — | `/tai-khoan` | Chuyển sang trang Tài khoản | ⚠️ PARTIAL | Vào bằng URL, chỉ thấy href `/tai-khoan` trên header |
| D.1-02 | 2 | Hệ thống hiển thị số dư Bình sau đơn đã trả | `GET /v1/me/balance` | — | Tên "Trần Thị Bình"; "Số dư đang chờ" 1.425.000 ₫ + chú thích; "Số dư khả dụng" 0 ₫; 1 dòng "Bán 2 vé · Đêm nhạc Mùa Thu 2027 · Đơn 2610290V770BOGVN", "Đang chờ", +1.425.000 ₫ | ✅ PASS | |
| D.1-03 | 2 | Số dư Bình sau khi kết thúc Mùa Thu | `GET /v1/me/balance` | — | Đang chờ 0, khả dụng 1.425.000 ₫, dòng "Giải phóng ký quỹ · Đêm nhạc Mùa Thu 2027" | ⚠️ PARTIAL | `api` đúng (curl); chưa mở lại trang `/tai-khoan` của Bình sau kết thúc |
| D.1-04 | 3 | Nhấn sang trang khác của lịch sử | — | — | Chuyển trang | 🔄 PENDING | Mỗi tài khoản ≤ 2 dòng, chưa đủ 2 trang |
| D.1-05 | 4 | Hệ thống tải trang lịch sử tương ứng | `GET /v1/me/balance?page=` | — | Các dòng trang đó; số dư giữ nguyên | 🔄 PENDING | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| D.1-06 | `page` | `?page=abc` | UI | Hiển thị trang 1 | 🔄 PENDING | |
| D.1-07 | `page` | `page=0` (bypass UI) | API | 400 `VALIDATION_FAILED`, `details` có key `page` | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| D.1-08 | Chưa chọn tài khoản | UI | "Vui lòng chọn tài khoản để tiếp tục" + mở dropdown | ✅ PASS | |
| D.1-09 | Chưa có bút toán (Dũng) | UI | Hai ô `0 ₫`, bảng "Chưa có giao dịch nào" | ✅ PASS | |
| D.1-10 | `page` vượt `meta.totalPages` | UI | Về trang 1 | 🔄 PENDING | |
| D.1-11 | Tải lịch sử lỗi, số dư tải được | UI | Hiển thị số dư, bảng "Không tải được lịch sử giao dịch" + "Thử lại" | 🔄 PENDING | |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| D.1-12 | Số dư từ `api` | Bình sau đơn đã trả | Số trên UI (1.425.000 / 0) khớp `GET /v1/me/balance` | ✅ PASS | |
| D.1-13 | Mới nhất trước | Bình có 2 dòng sau kết thúc | Dòng giải phóng đứng trước dòng bán | 🔄 PENDING | Chưa mở UI sau kết thúc |
| D.1-14 | Người mua thường 0 | Dũng | 0 / 0 | ✅ PASS | |
| D.1-15 | Không có rút tiền | Xem trang | Không có nút rút / chi trả | ✅ PASS | |

### D.2 Xem Danh Sách Đơn Hàng

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| D.2-01 | 1 | Nhấn "Đơn hàng" trên thanh đầu trang | — | `/don-hang` | Chuyển sang trang Đơn hàng | ⚠️ PARTIAL | Vào bằng URL, chỉ thấy href `/don-hang` trên header |
| D.2-02 | 2 | Hệ thống hiển thị danh sách đơn của Dũng | `GET /v1/orders?buyerId=` | — | 3 đơn; mỗi đơn mã, sự kiện, người bán, số vé, tổng, nhãn trạng thái, thời điểm tạo; đơn chờ có "Giữ vé đến 22:43" | ✅ PASS | |
| D.2-03 | 3 | Nhấn vào một đơn | — | `/don-hang/:mã` | Chuyển sang trang kết quả | 🔄 PENDING | |
| D.2-04 | 4 | Hệ thống hiển thị trang kết quả của đơn | — | — | Nội dung theo C.3 | 🔄 PENDING | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| D.2-05 | `page` | `?page=abc` | UI | Hiển thị trang 1 | 🔄 PENDING | |
| D.2-06 | `page` | `page=0` (bypass UI) | API | 400 `VALIDATION_FAILED`, `details` có key `page` | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| D.2-07 | Chưa chọn tài khoản | UI | "Vui lòng chọn tài khoản để tiếp tục" + mở dropdown | ✅ PASS | |
| D.2-08 | Chưa có đơn nào | UI | "Bạn chưa có đơn hàng nào" + nút "Xem sự kiện" | 🔄 PENDING | |
| D.2-09 | Đổi tài khoản khi đang ở trang Đơn hàng | UI | Tải lại danh sách theo tài khoản mới, về trang 1 | 🔄 PENDING | |
| D.2-10 | `page` vượt `meta.totalPages` | UI | Về trang 1 | 🔄 PENDING | |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| D.2-11 | Chỉ đơn của người mua | Dũng mua 3 đơn; An mua đơn qua API | Dũng chỉ thấy đơn của mình | ✅ PASS | |
| D.2-12 | Chỉ đọc | Xem trang | Không có thao tác huỷ / sửa / hoàn tiền | ✅ PASS | |
| D.2-13 | Sắp xếp | Đơn 22:28, 22:27, 16:40 | Mới nhất trước | ✅ PASS | |
| D.2-14 | Đơn hết hạn vẫn hiện tổng kèm nhãn | Đơn `261029R73B57KB4H` | Nhãn "Hết hạn" kèm tổng 550.000 ₫ | ⚠️ PARTIAL | Thấy nhãn "Hết hạn"; dòng tổng của thẻ nằm ngoài ảnh chụp, tổng 550.000 ₫ chỉ xác nhận ở trang chi tiết |
| D.2-15 | Không tự hỏi lại | Để trang mở | Không polling | 🔄 PENDING | |
| D.2-16 | Phân trang `limit` 20 | Điều khiển ẩn khi `totalPages` ≤ 1 | Ẩn; ≥ 2 trang thì dựng theo `meta` | 🔄 PENDING | Chỉ có 3 đơn |

---

## E. Quản Trị

> Spec ref: §E. Quản Trị — `specs/functional-spec/web.md#e-quản-trị`

### E.1 Đánh Dấu Sự Kiện Kết Thúc

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| E.1-01 | 1 | Nhấn "Quản trị" trên thanh đầu trang | — | `/quan-tri` | Chuyển sang trang Quản trị | ⚠️ PARTIAL | Vào bằng URL, chỉ thấy href `/quan-tri` trên header |
| E.1-02 | 2 | Hệ thống hiển thị danh sách sự kiện | `GET /v1/events` | — | Mùa Thu: Đang bán, ký quỹ 1.650.000 ₫, 3 đơn chờ; Biển: 0 ₫, 0 đơn; nút "Đánh dấu kết thúc"; liên kết "Xem sổ cái" | ✅ PASS | |
| E.1-03 | 3 | Nhấn "Đánh dấu kết thúc" ở Mùa Thu | — | — | Mở modal | ✅ PASS | |
| E.1-04 | 4 | Hệ thống mở modal xác nhận | — | — | "Kết thúc sự kiện Đêm nhạc Mùa Thu 2027?", "Thao tác không thể hoàn tác.", ký quỹ giải phóng 1.650.000 ₫, 1 người bán, 3 đơn chuyển hết hạn, nút "Huỷ" và "Xác nhận kết thúc" | ✅ PASS | |
| E.1-05 | 5 | Nhấn "Xác nhận kết thúc" | `POST /v1/events/:id/complete` | — | 200 | ✅ PASS | |
| E.1-06 | 6 | Hệ thống đóng modal, cập nhật dòng sự kiện | — | — | Thông báo "Đã kết thúc sự kiện Đêm nhạc Mùa Thu 2027, giải phóng 1.650.000 ₫ cho 1 người bán"; trạng thái "Đã kết thúc"; ký quỹ 0 ₫; nút biến mất | ✅ PASS | |
| E.1-07 | 6 | Số đơn chờ sau kết thúc | — | — | 0 | ✅ PASS | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| E.1-08 | Sự kiện được chọn | Sự kiện không còn "Đang bán" | UI | Không có nút "Đánh dấu kết thúc" ở sự kiện đã kết thúc | ✅ PASS | |
| E.1-09 | Sự kiện được chọn | Sự kiện đã kết thúc (bypass UI) | API | 409 `EVENT_ALREADY_COMPLETED` | ✅ PASS | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| E.1-10 | Chưa chọn tài khoản | UI | "Vui lòng chọn tài khoản để tiếp tục" + mở dropdown | ✅ PASS | |
| E.1-11 | Nhấn "Huỷ" trên modal | UI | Đóng modal, không đổi gì | ✅ PASS | |
| E.1-12 | Nhấn Esc trên modal | UI | Đóng modal, không đổi gì | ✅ PASS | |
| E.1-13 | Nút đóng trên modal | UI | Có nút đóng, bấm thì đóng modal | ⚠️ PARTIAL | Modal chỉ có "Huỷ" và "Xác nhận kết thúc", không có nút đóng (X) riêng như spec liệt kê |
| E.1-14 | Sự kiện đã được kết thúc trước đó (tab khác) | UI | Đóng modal, cập nhật dòng, "Sự kiện đã được đánh dấu kết thúc trước đó" | 🔄 PENDING | Không thử hai tab (giới hạn một sự kiện được kết thúc) |
| E.1-15 | Sự kiện đã được kết thúc trước đó | API | 409 `EVENT_ALREADY_COMPLETED` | ✅ PASS | |
| E.1-16 | Lỗi mạng / lỗi hệ thống khi xác nhận | UI | Giữ modal, mở lại nút, "Chưa kết thúc được sự kiện, vui lòng thử lại" | 🔄 PENDING | |
| E.1-17 | Không có sự kiện nào | UI | "Chưa có sự kiện nào" | 🔄 PENDING | |
| E.1-18 | Sự kiện không có tiền ký quỹ | UI | Modal vẫn cho xác nhận, hiển thị `0 ₫` | 🔄 PENDING | Chỉ được kết thúc một sự kiện (Mùa Thu có ký quỹ) |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| E.1-19 | Không phân quyền | Dũng (chỉ mua) kết thúc sự kiện | Thực hiện được | ✅ PASS | |
| E.1-20 | Giải phóng ký quỹ | Sau kết thúc Mùa Thu | Bình: đang chờ 0, khả dụng 1.425.000; phí sàn 225.000 sang Doanh thu phí sàn; giao dịch EVENT_RELEASE | ✅ PASS | |
| E.1-21 | Đơn chờ chuyển hết hạn | 3 đơn chờ của Mùa Thu | Chuyển EXPIRED | ⚠️ PARTIAL | UI báo 0 đơn chờ; chưa đọc trạng thái từng đơn |
| E.1-22 | Trạng thái ở lần tải kế tiếp | Mở `/` và trang sự kiện Mùa Thu sau kết thúc | "Đã kết thúc" trên thẻ; băng "Sự kiện đã kết thúc, ngừng bán vé" | ✅ PASS | |
| E.1-23 | Chặn mua sau kết thúc | `POST /v1/orders` vào tin Mùa Thu | 409 `EVENT_NOT_ON_SALE` | ✅ PASS | |
| E.1-24 | Một chiều | Dòng sự kiện đã kết thúc | Không có nút hoàn tác | ✅ PASS | |

#### Phân quyền

| TC | Actor | Hành động | Expected | Status | Ghi chú |
|----|-------|-----------|----------|--------|---------|
| E.1-25 | Người mua (Dũng) | Kết thúc sự kiện | Thực hiện được (Khu Quản Trị không phân quyền) | ✅ PASS | |

### E.2 Xem Sổ Cái Và Số Dư Sàn

#### Luồng chính

| TC | Bước | Mô tả | API | Route | Expected | Status | Ghi chú |
|----|------|-------|-----|-------|----------|--------|---------|
| E.2-01 | 1 | Nhấn "Xem sổ cái" trên trang Quản trị | — | `/quan-tri/so-cai` | Chuyển sang trang Sổ cái | ⚠️ PARTIAL | Vào bằng URL; chỉ thấy href `/quan-tri/so-cai` |
| E.2-02 | 2 | Hệ thống hiển thị bảng tài khoản sổ cái | `GET /v1/ledger` | — | Mỗi dòng: tên tài khoản (Tiền tại cổng thanh toán, Ký quỹ người bán · Trần Thị Bình, Ký quỹ phí sàn, Phải trả người bán · Trần Thị Bình, Doanh thu phí sàn), tổng nợ, tổng có, số dư | ✅ PASS | |
| E.2-03 | 3 | Nhấn vào một tài khoản sổ cái | — | `/quan-tri/so-cai/:id` | Chuyển sang chi tiết | 🔄 PENDING | |
| E.2-04 | 4 | Hệ thống hiển thị chi tiết tài khoản | `GET /v1/ledger/accounts/:id` | — | Tên, số dư; dòng bút toán (thời điểm, mã giao dịch, diễn giải, tham chiếu, nợ, có); limit 50 | 🔄 PENDING | |

#### Validation

| TC | Trường | Vi phạm | Layer | Expected | Status | Ghi chú |
|----|--------|---------|-------|----------|--------|---------|
| E.2-05 | Mã tài khoản sổ cái | Sai dạng (`a b`) | UI | HTTP 404 | ✅ PASS | |
| E.2-06 | Mã tài khoản sổ cái | Sai dạng | API | Không gọi `api` | 🔄 PENDING | |
| E.2-07 | `page` | `?page=abc` | UI | Hiển thị trang 1 | 🔄 PENDING | |
| E.2-08 | `page` | `page=0` (bypass UI) | API | 400 `VALIDATION_FAILED`, `details` có key `page` | 🔄 PENDING | |

#### Ngoại lệ

| TC | Tình huống | Layer | Expected | Status | Ghi chú |
|----|------------|-------|----------|--------|---------|
| E.2-09 | Chưa chọn tài khoản | UI | "Vui lòng chọn tài khoản để tiếp tục" | ✅ PASS | |
| E.2-10 | Chưa có bút toán | UI | Bảng "Chưa có bút toán nào" | 🔄 PENDING | |
| E.2-11 | Mã tài khoản sổ cái đúng dạng nhưng không tồn tại (`khong-ton-tai`) | UI | HTTP 404 "Không tìm thấy tài khoản sổ cái" | ✅ PASS | |
| E.2-12 | Như E.2-11 | API | 404 + `code` theo spec `api` | 🔄 PENDING | |
| E.2-13 | `page` vượt `meta.totalPages` | UI | Về trang 1 | 🔄 PENDING | |

#### Business rules

| TC | Rule | Mô tả | Expected | Status | Ghi chú |
|----|------|-------|----------|--------|---------|
| E.2-14 | Chỉ đọc | Xem trang | Không có thao tác thêm / sửa / xoá bút toán | ✅ PASS | |
| E.2-15 | Tổng nợ = tổng có | Sau PAYMENT_CAPTURED và EVENT_RELEASE | Tổng ghi nợ toàn sổ 3.300.000 ₫ = tổng ghi có 3.300.000 ₫ | ✅ PASS | |
| E.2-16 | Giao dịch EVENT_RELEASE | Sau kết thúc Mùa Thu | Có giao dịch "Giải phóng ký quỹ · Đêm nhạc Mùa Thu 2027" | ✅ PASS | |
| E.2-17 | Tài khoản sàn | Chủ sở hữu | Tiền tại cổng, Ký quỹ phí sàn, Doanh thu phí sàn ghi "Sàn" | ✅ PASS | |
| E.2-18 | Lọc theo loại | Nhấn chip "Giải phóng ký quỹ" | URL `?type=EVENT_RELEASE`, chỉ còn giao dịch giải phóng | ✅ PASS | |
| E.2-19 | Lọc theo sự kiện | Nhấn chip tên sự kiện | Chỉ giao dịch của sự kiện | 🔄 PENDING | |
| E.2-20 | Sắp xếp | Giao dịch 22:31 và 22:27 | Mới nhất trước | ✅ PASS | |
| E.2-21 | Không tự cộng | Số trên bảng tài khoản | Khớp số `GET /v1/ledger` | ✅ PASS | |
