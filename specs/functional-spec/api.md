# Đặc Tả Chức Năng: Ticket Checkout with Escrow

## TÓM TẮT
- **Surface**: api
- **Actor**: Người dùng (client gọi thay mặt người dùng đang chọn trong dropdown, vừa mua vừa bán được, dùng được cả Khu Quản Trị), Cổng thanh toán (VNPay sandbox, gửi thông báo IPN), Hệ thống (tác vụ nội bộ: hết hạn đơn, tra cứu cổng, ghi sổ cái)
- **Tích hợp**: cổng thanh toán VNPay sandbox — tạo URL thanh toán, nhận thông báo IPN có chữ ký, nhận tham số có chữ ký từ đường quay về, tra cứu trạng thái giao dịch

| Chức năng | Actor | Loại |
|-----------|-------|------|
| **A. Người Dùng** | | |
| &nbsp;&nbsp;↳ Xem Danh Sách Người Dùng | Người dùng | đọc |
| **B. Sự Kiện Và Tin Bán** | | |
| &nbsp;&nbsp;↳ Xem Danh Sách Sự Kiện | Người dùng | đọc |
| &nbsp;&nbsp;↳ Xem Chi Tiết Sự Kiện | Người dùng | đọc |
| &nbsp;&nbsp;↳ Tính Tổng Tiền | Người dùng | đọc |
| **C. Đơn Hàng** | | |
| &nbsp;&nbsp;↳ Tạo Đơn Hàng | Người dùng | ghi |
| &nbsp;&nbsp;↳ Xem Trạng Thái Đơn Hàng | Người dùng | đọc |
| &nbsp;&nbsp;↳ Xem Danh Sách Đơn Hàng | Người dùng | đọc |
| &nbsp;&nbsp;↳ Hết Hạn Đơn Hàng | Hệ thống | ghi |
| **D. Thanh Toán** | | |
| &nbsp;&nbsp;↳ Tạo URL Thanh Toán | Người dùng | ghi |
| &nbsp;&nbsp;↳ Nhận Thông Báo Thanh Toán | Cổng thanh toán | xác thực |
| &nbsp;&nbsp;↳ Tra Cứu Trạng Thái Từ Cổng | Hệ thống | xác thực |
| &nbsp;&nbsp;↳ Ghi Nhận Kết Quả Thanh Toán | Hệ thống | ghi |
| &nbsp;&nbsp;↳ Ghi Nhận Từ Đường Quay Về | Người dùng | xác thực |
| **E. Sổ Cái** | | |
| &nbsp;&nbsp;↳ Ghi Bút Toán | Hệ thống | ghi |
| &nbsp;&nbsp;↳ Xem Số Dư Người Dùng | Người dùng | đọc |
| &nbsp;&nbsp;↳ Xem Sổ Cái Toàn Sàn | Người dùng | đọc |
| &nbsp;&nbsp;↳ Xem Bút Toán Theo Tài Khoản | Người dùng | đọc |
| **F. Vận Hành Sự Kiện** | | |
| &nbsp;&nbsp;↳ Đánh Dấu Sự Kiện Kết Thúc | Người dùng | ghi |

## Quy Tắc Chung
- Không có đăng nhập, không có token, không phân quyền: mọi hành động (kể cả Khu Quản Trị) mở cho mọi người dùng
- Người dùng đang thao tác: client gửi header `X-User-Id` là mã người dùng đang chọn trong dropdown; header chỉ dùng để biết ai đang thao tác ở các hành động ghi rõ cần nó (Tạo Đơn Hàng, Tính Tổng Tiền, Xem Số Dư Người Dùng; Xem Chi Tiết Sự Kiện dùng nếu có), các hành động khác bỏ qua header
  - Hành động cần header mà thiếu header hoặc sai dạng (1–64 ký tự, regex `^[A-Za-z0-9_-]+$`): trả 400 + `VALIDATION_FAILED`, `details` gồm field `X-User-Id`
  - Mã đúng dạng nhưng không có trong danh sách người dùng mẫu: trả 404 + `USER_NOT_FOUND`
- Lỗi trả về theo một dạng thống nhất: `code` (mã máy đọc, dạng `UPPER_SNAKE_CASE`), `message` (tiếng Anh, cho dev), `details` (tuỳ chọn)
  - `VALIDATION_FAILED` (400): `details` là map `{ "<field>": "<câu tiếng Anh>" }`, mỗi field sai một câu (lỗi đầu tiên theo thứ tự kiểm)
  - Mã khác chỉ có `details` khi hành động khai rõ shape
- Tiền: mọi số tiền là VND số nguyên không âm, không có phần thập phân, tính hoàn toàn bằng số nguyên (không dùng số thực); trả về dạng số nguyên
- Thời gian: trả về dạng ISO 8601 UTC; thời gian gửi cổng thanh toán theo múi giờ GMT+7, định dạng `yyyyMMddHHmmss` như cổng quy định
- Danh sách có phân trang: tham số `page` (số nguyên ≥ 1, mặc định 1) và `limit` (số nguyên 1–100, mặc định 20); trả kèm `meta { total, page, limit, totalPages }` với `totalPages` = làm tròn lên (`total` / `limit`), bằng 0 khi `total` = 0; `page` vượt `totalPages` trả danh sách rỗng
- Mọi thao tác ghi (tạo đơn, đổi trạng thái đơn, ghi sổ cái, đánh dấu sự kiện kết thúc) chạy nguyên tử: lỗi giữa chừng thì không thay đổi dữ liệu nào
- Lỗi hệ thống không lường trước: trả 500 + `INTERNAL_ERROR`, không lộ chi tiết nội bộ trong `message`
- Thông tin bí mật của cổng (mã merchant, khoá bí mật ký) chỉ đọc từ cấu hình môi trường, không trả ra trong bất kỳ phản hồi nào và không ghi vào log

## Chi Tiết

### A. Người Dùng

#### Xem Danh Sách Người Dùng

**Actor**: Người dùng

**Mục đích**: Client lấy danh sách tài khoản mẫu để hiển thị dropdown chọn người dùng hiện tại

**Luồng chính**:
1. Client gửi yêu cầu lấy danh sách người dùng mẫu
2. Hệ thống đọc danh sách người dùng mẫu — trả 200 + danh sách người dùng, mỗi người gồm mã, tên hiển thị, cờ có tin bán hay không

**Trường hợp ngoại lệ**:
- Chưa có dữ liệu mẫu: trả 200 + danh sách rỗng

**Kiểm tra dữ liệu**:
- Không có tham số đầu vào

**Quy tắc nghiệp vụ**:
- Sắp xếp theo tên hiển thị A–Z
- Không phân trang (dữ liệu mẫu nhỏ)

---

### B. Sự Kiện Và Tin Bán

#### Xem Danh Sách Sự Kiện

**Actor**: Người dùng

**Mục đích**: Client lấy danh sách sự kiện để hiển thị trang chủ hoặc Khu Quản Trị

**Luồng chính**:
1. Client gửi yêu cầu lấy danh sách sự kiện kèm trạng thái cần lọc (tuỳ chọn)
2. Hệ thống đọc danh sách sự kiện và tính số liệu ký quỹ từ sổ cái — trả 200 + danh sách sự kiện, mỗi sự kiện gồm mã, slug, tên, địa điểm, thời gian bắt đầu, trạng thái (`ON_SALE` / `COMPLETED`), thời điểm kết thúc (nếu đã kết thúc), số tin bán, tổng số vé còn lại, giá thấp nhất mỗi vé, tổng tiền đang ký quỹ (`escrowTotal`), số đơn đang chờ thanh toán (`pendingOrderCount`), số người bán sẽ nhận tiền (`sellerCount`)

**Trường hợp ngoại lệ**:
- Không có sự kiện nào khớp bộ lọc: trả 200 + danh sách rỗng
- Giá trị trạng thái lọc không thuộc tập cho phép: trả 400 + `VALIDATION_FAILED`, `details` gồm field `status`

**Kiểm tra dữ liệu**:
- `status`: tuỳ chọn, một trong `ON_SALE`, `COMPLETED`; không có thì trả mọi trạng thái

**Quy tắc nghiệp vụ**:
- Sắp xếp theo thời gian bắt đầu tăng dần
- Số vé còn lại tính theo quy tắc ở § C Tạo Đơn Hàng (đã trừ vé đã bán và vé đang giữ chỗ còn hiệu lực); sự kiện `COMPLETED` luôn trả 0 vé còn lại
- `escrowTotal` = Σ số dư các tài khoản `ESCROW_SELLER` của sự kiện + số dư `ESCROW_FEE` của sự kiện (§ E Ghi Bút Toán), đúng bằng số tiền sẽ được giải phóng khi đánh dấu kết thúc
- `pendingOrderCount` = số đơn `PENDING_PAYMENT` của sự kiện chưa quá thời điểm hết hạn giữ chỗ
- `sellerCount` = số tài khoản `ESCROW_SELLER` của sự kiện có số dư > 0
- Sự kiện `COMPLETED`: `escrowTotal`, `pendingOrderCount`, `sellerCount` đều bằng 0
- Mọi số liệu tính tại thời điểm đọc, không cache
- Không phân trang (dữ liệu mẫu 1–2 sự kiện)

#### Xem Chi Tiết Sự Kiện

**Actor**: Người dùng

**Mục đích**: Client lấy thông tin sự kiện và các tin bán để dựng trang sự kiện từ máy chủ

**Luồng chính**:
1. Client gửi yêu cầu xem chi tiết sự kiện kèm slug sự kiện
2. Hệ thống đọc sự kiện và các tin bán — trả 200 + thông tin sự kiện (mã, slug, tên, mô tả, địa điểm, thời gian bắt đầu, trạng thái, thời điểm kết thúc) và danh sách tin bán, mỗi tin gồm mã tin, mã và tên người bán, giá mỗi vé, tổng số vé của tin, số vé còn lại, cờ `isOwnListing` (tin của người dùng đang thao tác)

**Trường hợp ngoại lệ**:
- Slug không tồn tại: trả 404 + `EVENT_NOT_FOUND`
- Sự kiện có nhưng chưa có tin bán: trả 200 + danh sách tin bán rỗng
- Không gửi `X-User-Id`: trả 200, mọi tin có `isOwnListing` = false

**Kiểm tra dữ liệu**:
- Slug sự kiện: bắt buộc, 1–100 ký tự, regex `^[a-z0-9]+(-[a-z0-9]+)*$`
- `X-User-Id`: tuỳ chọn; có gửi thì kiểm theo § Quy Tắc Chung

**Quy tắc nghiệp vụ**:
- Tin bán hết vé (còn lại 0) vẫn trả về, không ẩn
- Sắp xếp tin bán theo giá mỗi vé tăng dần, cùng giá thì tin nào có số vé còn lại nhiều hơn trước
- Sự kiện `COMPLETED`: vẫn trả chi tiết, mọi tin bán trả số vé còn lại 0
- Số vé còn lại tính tại thời điểm đọc, không cache; đơn quá hạn giữ chỗ nhưng tác vụ hết hạn chưa chạy vẫn không bị tính là giữ chỗ (§ C Hết Hạn Đơn Hàng)

#### Tính Tổng Tiền

**Actor**: Người dùng

**Mục đích**: Client lấy bảng tiền chính xác (tiền vé, phí dịch vụ, tổng phải trả) cho tin bán và số lượng người mua đang chọn, trước khi tạo đơn

**Luồng chính**:
1. Client gửi yêu cầu tính tổng tiền kèm `X-User-Id`, mã tin bán và số lượng
2. Hệ thống kiểm tra tin bán, số lượng và tính phí — trả 200 + giá mỗi vé, số lượng, tiền vé (`subtotal`), phí dịch vụ người mua (`buyerFee`), tổng phải trả (`buyerTotal`), số vé còn lại hiện tại

**Trường hợp ngoại lệ**:
- Thiếu hoặc sai kiểu dữ liệu: trả 400 + `VALIDATION_FAILED`, `details` gồm field `listingId`, `quantity`
- Tin bán không tồn tại: trả 404 + `LISTING_NOT_FOUND`
- Tin bán thuộc chính người dùng đang thao tác: trả 422 + `CANNOT_BUY_OWN_LISTING`
- Sự kiện của tin bán đã kết thúc: trả 409 + `EVENT_NOT_ON_SALE`
- Số lượng vượt số vé còn lại: trả 409 + `INSUFFICIENT_QUANTITY`, `details`: `{ available: <số nguyên> }`

**Kiểm tra dữ liệu**:
- `X-User-Id`: bắt buộc, theo § Quy Tắc Chung
- `listingId`: bắt buộc, mã tin bán tồn tại
- `quantity`: bắt buộc, số nguyên ≥ 1 và ≤ số vé còn lại của tin bán

**Quy tắc nghiệp vụ**:
- Công thức phí (mọi phép tính số nguyên, làm tròn xuống tới đồng):
  - `subtotal` = giá mỗi vé × số lượng
  - `buyerFee` = làm tròn xuống (`subtotal` × 10 / 100)
  - `buyerTotal` = `subtotal` + `buyerFee`
  - `sellerFee` = làm tròn xuống (`subtotal` × 5 / 100)
  - `sellerNet` = `subtotal` − `sellerFee`
  - `platformFee` = `buyerTotal` − `sellerNet` (phần chênh lệch, phần lẻ do làm tròn thuộc về sàn, đảm bảo `sellerNet` + `platformFee` = `buyerTotal` tuyệt đối)
- Ví dụ: giá 500.000 × 2 vé → `subtotal` 1.000.000, `buyerFee` 100.000, `buyerTotal` 1.100.000, `sellerFee` 50.000, `sellerNet` 950.000, `platformFee` 150.000
- Ví dụ làm tròn: giá 333.333 × 1 vé → `buyerFee` 33.333, `buyerTotal` 366.666, `sellerFee` 16.666, `sellerNet` 316.667, `platformFee` 49.999
- Phí tính trên tổng giá trị dòng (giá × số lượng), không tính từng vé rồi cộng
- Phản hồi không trả `sellerFee`, `sellerNet`, `platformFee` cho người mua
- Không giữ chỗ, không tạo dữ liệu; kết quả chỉ để hiển thị, số tiền chuẩn được chốt lại khi tạo đơn
- Áp cùng luật không mua tin của chính mình như § C Tạo Đơn Hàng

---

### C. Đơn Hàng

#### Tạo Đơn Hàng

**Actor**: Người dùng

**Mục đích**: Tạo đơn ở trạng thái chờ thanh toán và giữ chỗ số vé trong 15 phút, chốt số tiền phải trả

**Luồng chính**:
1. Client gửi yêu cầu tạo đơn hàng kèm `X-User-Id`, header `Idempotency-Key`, mã tin bán, số lượng
2. Hệ thống khoá tin bán, kiểm tra số vé còn lại, tính phí, tạo đơn trạng thái `PENDING_PAYMENT` và giữ chỗ số vé — trả 201 + mã đơn, trạng thái, mã tin bán, mã sự kiện, số lượng, giá mỗi vé, `subtotal`, `buyerFee`, `buyerTotal`, thời điểm tạo, thời điểm hết hạn giữ chỗ

**Trường hợp ngoại lệ**:
- Thiếu hoặc sai kiểu dữ liệu: trả 400 + `VALIDATION_FAILED`, `details` gồm field `listingId`, `quantity`, `Idempotency-Key`
- Tin bán không tồn tại: trả 404 + `LISTING_NOT_FOUND`
- Tin bán thuộc chính người dùng đang thao tác: trả 422 + `CANNOT_BUY_OWN_LISTING`
- Sự kiện đã kết thúc: trả 409 + `EVENT_NOT_ON_SALE`
- Số lượng vượt số vé còn lại (kể cả do người mua khác vừa giữ chỗ trước): trả 409 + `INSUFFICIENT_QUANTITY`, `details`: `{ available: <số nguyên> }`
- `Idempotency-Key` đã dùng với cùng người mua và cùng nội dung (mã tin bán, số lượng): trả 200 + đơn đã tạo trước đó (ở trạng thái hiện tại), không tạo đơn mới, không giữ chỗ thêm
- `Idempotency-Key` đã dùng với cùng người mua nhưng khác nội dung: trả 409 + `IDEMPOTENCY_KEY_REUSED`

**Kiểm tra dữ liệu**:
- `X-User-Id`: bắt buộc, theo § Quy Tắc Chung
- `Idempotency-Key`: bắt buộc, chuỗi 8–64 ký tự, regex `^[A-Za-z0-9_-]+$` (client sinh mới cho mỗi lần người mua xác nhận)
- `listingId`: bắt buộc, mã tin bán tồn tại
- `quantity`: bắt buộc, số nguyên ≥ 1 và ≤ số vé còn lại của tin bán

**Quy tắc nghiệp vụ**:
- Số vé còn lại của tin bán = tổng số vé của tin − số vé của đơn `PAID` − số vé của đơn `PENDING_PAYMENT` chưa quá thời điểm hết hạn giữ chỗ
- Đồng thời: kiểm tra số vé còn lại và tạo đơn giữ chỗ là một thao tác nguyên tử, tuần tự hoá theo từng tin bán; hai người mua cùng tin bán gửi đồng thời thì yêu cầu được xử lý sau thấy số vé đã bị trừ — không bao giờ tổng vé `PAID` + vé đang giữ chỗ vượt tổng số vé của tin
- Thời hạn giữ chỗ: 15 phút kể từ thời điểm tạo đơn; thời điểm hết hạn lưu trên đơn, không gia hạn
- Snapshot trên đơn tại thời điểm tạo, không đổi về sau: mã người mua (= `X-User-Id`), mã người bán, mã tin bán, mã sự kiện, giá mỗi vé, số lượng, `subtotal`, `buyerFee`, `buyerTotal`, `sellerFee`, `sellerNet`, `platformFee` (công thức § B Tính Tổng Tiền)
- Mã đơn do hệ thống sinh, duy nhất toàn hệ thống, 12–20 ký tự chữ và số, dùng làm mã tham chiếu giao dịch gửi cổng
- Idempotency: cặp (mã người mua, `Idempotency-Key`) là UNIQUE vĩnh viễn, lưu trên đơn; hai yêu cầu đồng thời cùng khoá chỉ tạo đúng một đơn, yêu cầu còn lại xử lý như khoá đã dùng
- Một người dùng được có nhiều đơn `PENDING_PAYMENT` cùng lúc
- Tạo đơn không ghi sổ cái (chưa có tiền)
- Trạng thái đơn: `PENDING_PAYMENT` (chờ thanh toán), `PAID` (đã thanh toán), `FAILED` (thất bại), `EXPIRED` (hết hạn), `REFUND_REQUIRED` (cần hoàn tiền); chuyển trạng thái chỉ theo § C Hết Hạn Đơn Hàng, § D Ghi Nhận Kết Quả Thanh Toán và § F Đánh Dấu Sự Kiện Kết Thúc

#### Xem Trạng Thái Đơn Hàng

**Actor**: Người dùng

**Mục đích**: Client lấy trạng thái thật của đơn do hệ thống ghi nhận để hiển thị trang kết quả sau khi quay về từ cổng, kể cả khi đang chờ xác nhận

**Luồng chính**:
1. Client gửi yêu cầu xem trạng thái đơn kèm mã đơn
2. Hệ thống đọc đơn, áp hết hạn tại chỗ nếu đã quá hạn và gọi § D Tra Cứu Trạng Thái Từ Cổng nếu đủ điều kiện — trả 200 + mã đơn, trạng thái, thông tin sự kiện và tin bán (tên sự kiện, tên người bán), người mua (mã, tên hiển thị), số lượng, giá mỗi vé, `subtotal`, `buyerFee`, `buyerTotal`, thời điểm tạo, thời điểm hết hạn giữ chỗ (`holdExpiresAt`), thời điểm thanh toán (nếu có), số tiền cần hoàn (nếu `REFUND_REQUIRED`), URL thanh toán (chỉ khi `PENDING_PAYMENT` còn hạn và đã tạo URL), `retryAfterSeconds` (chỉ khi `PENDING_PAYMENT`)

**Trường hợp ngoại lệ**:
- Mã đơn sai dạng: trả 400 + `VALIDATION_FAILED`, `details` gồm field `orderId`
- Mã đơn không tồn tại: trả 404 + `ORDER_NOT_FOUND`
- Tra cứu cổng lỗi hoặc quá 5 giây: vẫn trả 200 + trạng thái hiện tại `PENDING_PAYMENT`, không báo lỗi cho client
- Ghi nhận kết quả tra cứu lỗi (số tiền lệch, lỗi ghi dữ liệu): ghi log, không thay đổi dữ liệu, vẫn trả 200 + trạng thái hiện tại của đơn

**Kiểm tra dữ liệu**:
- `orderId`: bắt buộc, 12–20 ký tự, regex `^[A-Za-z0-9]+$`

**Quy tắc nghiệp vụ**:
- Trạng thái chỉ lấy từ dữ liệu đơn đã ghi nhận trong hệ thống (qua § D Ghi Nhận Kết Quả Thanh Toán)
- Đơn `PENDING_PAYMENT` đã quá thời điểm hết hạn giữ chỗ: chuyển `EXPIRED` ngay trong yêu cầu này theo § C Hết Hạn Đơn Hàng rồi mới trả kết quả
- Điều kiện tra cứu cổng: đơn `PENDING_PAYMENT` còn hạn giữ chỗ (sau khi áp hết hạn tại chỗ) và đã tạo URL thanh toán; mỗi lần xem đơn thoả điều kiện gọi tra cứu đúng một lần, chạy đồng bộ, tối đa 5 giây, không giữ khoá dữ liệu nào trong lúc chờ cổng; có kết quả thanh toán cuối cùng thì xử lý theo § D Ghi Nhận Kết Quả Thanh Toán rồi đọc lại đơn trước khi trả trạng thái
- `retryAfterSeconds` cố định = 3 khi đơn `PENDING_PAYMENT` (rỗng với trạng thái khác): gợi ý client gọi lại sau 3 giây để tự cập nhật khi đơn đang chờ xác nhận
- Đọc nhiều lần không đổi kết quả nếu không có sự kiện thanh toán mới
- Mọi người dùng xem được mọi đơn theo mã đơn, không cần `X-User-Id`
- Người mua (mã, tên hiển thị) lấy từ mã người mua snapshot trên đơn và tên hiển thị hiện tại của người dùng đó
- `holdExpiresAt` luôn trả với mọi trạng thái (giá trị đã lưu khi tạo đơn, không đổi)

#### Xem Danh Sách Đơn Hàng

**Actor**: Người dùng

**Mục đích**: Người dùng xem danh sách đơn do mình mua (lọc theo người mua) hoặc mọi đơn trong Khu Quản Trị

**Luồng chính**:
1. Client gửi yêu cầu lấy danh sách đơn hàng kèm `page`, `limit`, mã người mua cần lọc (tuỳ chọn), trạng thái cần lọc (tuỳ chọn)
2. Hệ thống áp hết hạn tại chỗ và đọc đơn theo bộ lọc — trả 200 + danh sách đơn, mỗi đơn gồm mã đơn, trạng thái, tên sự kiện, tên người bán, người mua (mã, tên hiển thị), số lượng, `buyerTotal`, thời điểm tạo, thời điểm hết hạn giữ chỗ (`holdExpiresAt`), thời điểm thanh toán (nếu có); kèm `meta`

**Trường hợp ngoại lệ**:
- Không có đơn nào khớp bộ lọc: trả 200 + danh sách rỗng, `meta.total` 0
- Tham số sai: trả 400 + `VALIDATION_FAILED`, `details` gồm field `page`, `limit`, `status`, `buyerId`
- `buyerId` đúng dạng nhưng không có trong danh sách người dùng mẫu: trả 404 + `USER_NOT_FOUND`

**Kiểm tra dữ liệu**:
- `buyerId`: tuỳ chọn, 1–64 ký tự, regex `^[A-Za-z0-9_-]+$`; không có thì trả đơn của mọi người mua
- `status`: tuỳ chọn, một trong `PENDING_PAYMENT`, `PAID`, `FAILED`, `EXPIRED`, `REFUND_REQUIRED`
- `page`, `limit`: theo § Quy Tắc Chung

**Quy tắc nghiệp vụ**:
- Lọc theo mã người mua snapshot trên đơn: tài khoản có tin bán chỉ thấy đơn mình là người mua, không thấy đơn người khác mua tin của mình
- Bộ lọc `buyerId` và `status` áp đồng thời (khớp mọi bộ lọc có giá trị); `meta.total` tính sau khi lọc
- Đơn `PENDING_PAYMENT` đã quá hạn giữ chỗ chuyển `EXPIRED` (áp hết hạn tại chỗ như § C Xem Trạng Thái Đơn Hàng) trước khi lọc, không kích hoạt tra cứu cổng; lọc `EXPIRED` gồm cả các đơn này, lọc `PENDING_PAYMENT` không trả chúng
- Người mua (mã, tên hiển thị) lấy từ mã người mua snapshot trên đơn và tên hiển thị hiện tại của người dùng đó
- `holdExpiresAt` trả với mọi trạng thái (giá trị đã lưu khi tạo đơn)
- Sắp xếp theo thời điểm tạo mới nhất trước
- Số tiền hiển thị là `buyerTotal` đã chốt trên đơn

#### Hết Hạn Đơn Hàng

**Actor**: Hệ thống

**Mục đích**: Chuyển đơn chờ thanh toán quá 15 phút sang hết hạn và trả số vé đã giữ chỗ về tin bán

**Luồng chính**:
1. Tác vụ định kỳ của hệ thống kích hoạt, hoặc một yêu cầu đọc đơn gặp đơn `PENDING_PAYMENT` đã quá thời điểm hết hạn giữ chỗ
2. Hệ thống chuyển các đơn quá hạn sang `EXPIRED` theo lô (tác vụ định kỳ) hoặc chuyển đơn đang được đọc (yêu cầu đọc), ghi thời điểm hết hạn thực tế — trả số đơn đã chuyển (tác vụ nội bộ, không có phản hồi HTTP)

**Trường hợp ngoại lệ**:
- Đơn đã được ghi nhận thanh toán / thất bại ngay trước khi khoá (đã rời `PENDING_PAYMENT`): bỏ qua đơn đó, không đổi trạng thái
- Đơn đang bị khoá bởi ghi nhận thanh toán hoặc đánh dấu sự kiện kết thúc: tác vụ định kỳ bỏ qua đơn đó trong lượt này, luồng đang giữ khoá tự quyết trạng thái
- Lỗi khi xử lý một lô: cả lô không thay đổi, ghi log, lượt chạy sau xử lý lại các đơn còn quá hạn

**Kiểm tra dữ liệu**:
- Điều kiện chọn đơn: trạng thái `PENDING_PAYMENT` và thời điểm hết hạn giữ chỗ ≤ thời điểm hiện tại

**Quy tắc nghiệp vụ**:
- Tác vụ định kỳ xử lý theo lô, mỗi lô tối đa 500 đơn chuyển trong một thao tác nguyên tử; lô đầy 500 thì chạy tiếp lô sau trong cùng lượt tới khi hết đơn quá hạn
- Tác vụ chạy mỗi 60 giây, lượt trước chưa xong thì bỏ lượt mới; vì số vé còn lại đã không tính đơn quá hạn (§ C Tạo Đơn Hàng), độ trễ của tác vụ không làm giữ chỗ quá 15 phút
- Hết hạn không ghi sổ cái (chưa có tiền vào)
- Chuyển hết hạn là idempotent: đơn đã `EXPIRED` không bị xử lý lại
- Đơn `EXPIRED` vẫn có thể nhận thanh toán đến muộn, xử lý theo § D Ghi Nhận Kết Quả Thanh Toán
- Đánh dấu sự kiện kết thúc cũng chuyển mọi đơn `PENDING_PAYMENT` của sự kiện sang `EXPIRED` dù chưa quá 15 phút (§ F Đánh Dấu Sự Kiện Kết Thúc)

---

### D. Thanh Toán

#### Tạo URL Thanh Toán

**Actor**: Người dùng

**Mục đích**: Lấy URL chuyển hướng sang trang thanh toán của cổng cho một đơn đang chờ thanh toán

**Luồng chính**:
1. Client gửi yêu cầu tạo URL thanh toán kèm mã đơn, địa chỉ IP người mua, ngôn ngữ trang cổng (tuỳ chọn)
2. Hệ thống kiểm tra đơn, dựng và ký URL thanh toán với số tiền `buyerTotal` và hạn phiên trùng thời điểm hết hạn giữ chỗ — trả 200 + URL thanh toán, thời điểm hết hạn phiên

**Trường hợp ngoại lệ**:
- Thiếu hoặc sai dữ liệu: trả 400 + `VALIDATION_FAILED`, `details` gồm field `orderId`, `clientIp`, `locale`
- Đơn không tồn tại: trả 404 + `ORDER_NOT_FOUND`
- Đơn đã rời trạng thái `PENDING_PAYMENT` (đã thanh toán, thất bại, hết hạn, cần hoàn tiền): trả 409 + `ORDER_NOT_PAYABLE`, `details`: `{ status: <trạng thái hiện tại> }`
- Đơn `PENDING_PAYMENT` đã quá hạn giữ chỗ: chuyển `EXPIRED` theo § C Hết Hạn Đơn Hàng, trả 409 + `ORDER_NOT_PAYABLE`, `details`: `{ status: "EXPIRED" }`
- Thiếu cấu hình cổng (mã merchant, khoá bí mật, URL quay về, URL cổng): trả 503 + `PAYMENT_GATEWAY_UNAVAILABLE`

**Kiểm tra dữ liệu**:
- `orderId`: bắt buộc, 12–20 ký tự, regex `^[A-Za-z0-9]+$`
- `clientIp`: bắt buộc, địa chỉ IPv4 hoặc IPv6 dạng chuỗi, ≤ 45 ký tự
- `locale`: tuỳ chọn, một trong `vn`, `en`, mặc định `vn`

**Quy tắc nghiệp vụ**:
- Tham số gửi cổng: mã tham chiếu (`vnp_TxnRef`) = mã đơn; số tiền (`vnp_Amount`) = `buyerTotal` × 100 theo đơn vị cổng quy định; tiền tệ VND; thời điểm tạo (`vnp_CreateDate`) và hạn phiên (`vnp_ExpireDate`) theo GMT+7, định dạng `yyyyMMddHHmmss`; URL quay về là trang kết quả của web kèm mã đơn
- Mô tả đơn (`vnp_OrderInfo`) chỉ gồm chữ cái Latin không dấu, chữ số và dấu cách (regex `^[A-Za-z0-9 ]+$`), ≤ 255 ký tự, có mã đơn: `Thanh toan don <mã đơn>`
- Hạn phiên thanh toán ở cổng = thời điểm hết hạn giữ chỗ của đơn, để cổng không nhận thanh toán sau khi giữ chỗ hết hạn
- Lần tạo URL đầu tiên: lưu lên đơn URL thanh toán, `vnp_CreateDate` đúng chuỗi `yyyyMMddHHmmss` đã gửi cổng, thời điểm tạo URL; § D Tra Cứu Trạng Thái Từ Cổng dùng lại đúng giá trị `vnp_CreateDate` này
- Gọi nhiều lần cho cùng đơn còn hạn: trả lại cùng URL đã lưu, không tạo phiên mới, không đổi `vnp_CreateDate`
- Chữ ký URL: tham số `vnp_` gửi đi sắp xếp theo tên tăng dần, ký HMAC-SHA512 bằng khoá bí mật theo giao thức cổng
- Không đổi trạng thái đơn, không ghi sổ cái

#### Nhận Thông Báo Thanh Toán

**Actor**: Cổng thanh toán

**Mục đích**: Nhận thông báo kết quả thanh toán (IPN) từ cổng, xác thực chữ ký và số tiền, ghi nhận kết quả đúng một lần dù cổng gửi nhiều lần

**Luồng chính**:
1. Cổng thanh toán gửi yêu cầu thông báo kết quả thanh toán kèm mã tham chiếu (mã đơn), số tiền, mã phản hồi, trạng thái giao dịch, mã giao dịch tại cổng, mã ngân hàng, thời điểm thanh toán, chữ ký
2. Hệ thống xác thực chữ ký, đối chiếu mã đơn và số tiền rồi ghi nhận theo § D Ghi Nhận Kết Quả Thanh Toán — trả 200 + mã phản hồi cổng `00` (đã xác nhận)

**Trường hợp ngoại lệ**:
- Chữ ký sai hoặc thiếu chữ ký, một tham số `vnp_*` xuất hiện nhiều lần, hoặc thiếu cấu hình khoá bí mật của cổng: trả 200 + mã phản hồi cổng `97`, không đổi trạng thái đơn, không ghi sổ cái, ghi log cảnh báo
- Mã đơn không tồn tại: trả 200 + mã phản hồi cổng `01`, không ghi sổ cái
- Số tiền khác `buyerTotal` của đơn (sau khi chia 100): trả 200 + mã phản hồi cổng `04`, không đổi trạng thái đơn, không ghi sổ cái, ghi log cảnh báo
- § D Ghi Nhận Kết Quả Thanh Toán trả `DUPLICATE` (giao dịch thành công có mã giao dịch tại cổng đã ghi nhận, hoặc kết quả thất bại tới đơn đã rời `PENDING_PAYMENT`): trả 200 + mã phản hồi cổng `02` (đơn đã xác nhận), không ghi sổ cái lại, không đổi trạng thái
- Lỗi hệ thống khi xử lý (không ghi được dữ liệu): trả 200 + mã phản hồi cổng `99`, không thay đổi dữ liệu nào, để cổng gửi lại
- Thanh toán thành công đến muộn sau khi đơn hết hạn / thất bại, hoặc thanh toán thừa: trả 200 + `00` sau khi xử lý theo § D Ghi Nhận Kết Quả Thanh Toán

**Kiểm tra dữ liệu**:
- Mã tham chiếu (`vnp_TxnRef`): bắt buộc, 12–20 ký tự chữ và số
- Số tiền (`vnp_Amount`): bắt buộc, số nguyên dương
- Mã phản hồi (`vnp_ResponseCode`), trạng thái giao dịch (`vnp_TransactionStatus`): bắt buộc, chuỗi 2 chữ số
- Mã giao dịch tại cổng (`vnp_TransactionNo`): bắt buộc, chuỗi số, 1–20 ký tự
- Chữ ký (`vnp_SecureHash`): bắt buộc, chuỗi hex 128 ký tự
- Mã ngân hàng (`vnp_BankCode`): tuỳ chọn, ≤ 20 ký tự; giá trị rỗng coi như không gửi
- Thời điểm thanh toán (`vnp_PayDate`): tuỳ chọn, `yyyyMMddHHmmss` theo GMT+7 và là ngày giờ có thật; giá trị rỗng coi như không gửi (không trả `99`)
- Thiếu hoặc sai dạng trường sau khi chữ ký hợp lệ: trả 200 + mã phản hồi cổng `99`, không thay đổi dữ liệu

**Quy tắc nghiệp vụ**:
- Xác thực chữ ký: lấy mọi tham số nhận được có tiền tố `vnp_` trừ `vnp_SecureHash` và `vnp_SecureHashType`, bỏ qua mọi tham số không có tiền tố `vnp_`; sắp xếp theo tên tăng dần, ký HMAC-SHA512 bằng khoá bí mật theo giao thức cổng; so sánh với `vnp_SecureHash` không phân biệt hoa thường, bằng phép so sánh thời gian hằng
- Chuỗi ký chấp nhận hai kiểu, thử theo thứ tự: (1) gồm mọi tham số `vnp_*` kể cả tham số có giá trị rỗng; (2) nếu (1) không khớp và có tham số `vnp_*` giá trị rỗng, thử lại với các tham số rỗng bị bỏ khỏi chuỗi ký; một trong hai khớp là chữ ký hợp lệ
- Thứ tự kiểm tra cố định: chữ ký → mã đơn → số tiền → ghi nhận (gồm chống trùng); dừng ở bước đầu tiên thất bại
- Không tin bất kỳ dữ liệu nào trước khi chữ ký hợp lệ
- Thanh toán thành công khi đồng thời mã phản hồi = `00` và trạng thái giao dịch = `00`; mọi tổ hợp khác là thất bại
- Phản hồi cho cổng luôn là HTTP 200 với mã phản hồi (`RspCode`) và thông điệp (`Message`) theo giao thức cổng; phản hồi trong ≤ 5 giây (xử lý đồng bộ, không gọi dịch vụ ngoài trong luồng này)
- Hành động này không dùng `X-User-Id` (gọi từ cổng)

#### Tra Cứu Trạng Thái Từ Cổng

**Actor**: Hệ thống

**Mục đích**: Chủ động hỏi cổng trạng thái giao dịch của đơn đang chờ khi chưa nhận được IPN, bù cho trường hợp thông báo đến chậm hoặc mất

**Luồng chính**:
1. Hệ thống kích hoạt tra cứu cho một đơn `PENDING_PAYMENT` theo điều kiện ở § C Xem Trạng Thái Đơn Hàng
2. Hệ thống gửi yêu cầu tra cứu có ký tới cổng kèm mã đơn và `vnp_CreateDate` đã lưu trên đơn làm thời điểm tạo giao dịch
3. Cổng trả kết quả tra cứu
4. Hệ thống xác thực chữ ký và số tiền của kết quả, chuyển sang § D Ghi Nhận Kết Quả Thanh Toán nếu giao dịch đã có kết quả cuối cùng — trả kết quả cho hành động gọi (tác vụ nội bộ, không có phản hồi HTTP riêng)

**Trường hợp ngoại lệ**:
- Cổng báo giao dịch chưa tồn tại, hoặc trạng thái giao dịch (`vnp_TransactionStatus`) khác `00` và `02` (vd `01` chưa hoàn tất): không đổi trạng thái đơn
- Cổng không phản hồi trong 5 giây hoặc lỗi kết nối: không đổi trạng thái đơn, ghi log
- Chữ ký kết quả tra cứu sai: không đổi trạng thái đơn, ghi log cảnh báo
- Số tiền trong kết quả khác `buyerTotal`: không đổi trạng thái đơn, ghi log cảnh báo

**Kiểm tra dữ liệu**:
- Mã yêu cầu tra cứu: hệ thống sinh, duy nhất mỗi lần tra cứu, ≤ 32 ký tự chữ và số
- Thời điểm tạo giao dịch gửi cổng: đúng chuỗi `vnp_CreateDate` (`yyyyMMddHHmmss`, GMT+7) đã lưu trên đơn khi tạo URL thanh toán, không tính lại
- Trường kết quả tra cứu kiểm cùng dạng với § D Nhận Thông Báo Thanh Toán; `vnp_BankCode` và `vnp_PayDate` rỗng coi như không gửi

**Quy tắc nghiệp vụ**:
- Kết quả cuối cùng xác định theo trạng thái giao dịch (`vnp_TransactionStatus`) trong kết quả tra cứu: `00` → thành công, `02` → thất bại; mã khác không phải kết quả cuối cùng, không đổi trạng thái đơn
- Kết quả tra cứu hợp lệ có hiệu lực ngang IPN: cùng khoá chống trùng là mã giao dịch tại cổng; IPN hoặc đường quay về thành công đến sau một tra cứu đã ghi nhận được coi là trùng
- Không throttle riêng: mỗi lần xem trạng thái đơn đủ điều kiện gọi tra cứu một lần

#### Ghi Nhận Kết Quả Thanh Toán

**Actor**: Hệ thống

**Mục đích**: Áp kết quả thanh toán đã xác thực (từ IPN, đường quay về hoặc tra cứu cổng) vào đơn hàng, tồn kho và sổ cái đúng một lần, kể cả khi thanh toán đến muộn

**Luồng chính**:
1. Hệ thống nhận kết quả thanh toán đã xác thực chữ ký và số tiền từ § D Nhận Thông Báo Thanh Toán, § D Ghi Nhận Từ Đường Quay Về hoặc § D Tra Cứu Trạng Thái Từ Cổng kèm nguồn (`IPN` / `RETURN_URL` / `QUERYDR`), mã đơn, mã giao dịch tại cổng, thành công / thất bại, mã ngân hàng, thời điểm thanh toán
2. Hệ thống khoá đơn và sự kiện của đơn, kiểm tra chống trùng, áp kết quả theo trạng thái hiện tại của đơn (quy tắc bên dưới) và ghi bút toán theo § E Ghi Bút Toán trong cùng một thao tác nguyên tử — trả kết quả `RECORDED` hoặc `DUPLICATE` cho hành động gọi (tác vụ nội bộ)

**Trường hợp ngoại lệ**:
- Kết quả thành công có mã giao dịch tại cổng đã được ghi nhận thành công trước đó: không làm gì, trả `DUPLICATE`
- Kết quả thất bại tới đơn đã rời `PENDING_PAYMENT` (`EXPIRED`, `FAILED`, `PAID`, `REFUND_REQUIRED`): giữ nguyên trạng thái, không ghi sổ cái, trả `DUPLICATE`
- Lỗi khi ghi đơn hoặc sổ cái: huỷ toàn bộ thao tác, không có trạng thái hay bút toán nửa chừng, báo lỗi cho hành động gọi

**Kiểm tra dữ liệu**:
- Số tiền đã được đối chiếu bằng `buyerTotal` trước khi vào hành động này

**Quy tắc nghiệp vụ**:
- Kết quả thành công:
  - Đơn chưa `PAID` / `REFUND_REQUIRED` (`PENDING_PAYMENT` còn hạn hoặc đã quá hạn, `EXPIRED`, `FAILED`): không có nhánh tắt cho đơn còn hạn giữ chỗ, mọi đơn đều kiểm số vé còn lại khi sự kiện `ON_SALE`
    - Số vé còn lại đếm khi đã giữ khoá tin bán, không tính chính đơn này; hạn giữ chỗ của các đơn khác so với thời điểm câu lệnh đếm (sau khi đã có khoá), không so với thời điểm bắt đầu thao tác
    - Sự kiện `ON_SALE` và số vé còn lại ≥ số lượng của đơn: chuyển `PAID`, ghi thời điểm thanh toán, vé của đơn thành vé đã bán; ghi bút toán `PAYMENT_CAPTURED`
    - Sự kiện `COMPLETED` hoặc không đủ vé: chuyển `REFUND_REQUIRED`, không giữ vé, số tiền cần hoàn = số tiền đã nhận; ghi bút toán `PAYMENT_REFUND_REQUIRED`
  - Đơn `PAID` hoặc `REFUND_REQUIRED` nhận thêm một giao dịch thành công khác (mã giao dịch tại cổng khác): giữ nguyên trạng thái đơn, ghi bút toán `PAYMENT_REFUND_REQUIRED` cho khoản thanh toán thừa, cộng vào số tiền cần hoàn của đơn, ghi log cảnh báo
- Kết quả thất bại:
  - Đơn `PENDING_PAYMENT`: chuyển `FAILED`, trả vé đang giữ chỗ về tin bán; không ghi sổ cái; trả `RECORDED`
- Tiền đã được cổng xác nhận luôn được ghi vào sổ cái, không bao giờ bị bỏ qua
- Kiểm tra số vé còn lại khi ghi nhận thanh toán thành công tuần tự hoá theo tin bán cùng cơ chế với § C Tạo Đơn Hàng
- Kiểm tra trạng thái sự kiện tuần tự hoá với § F Đánh Dấu Sự Kiện Kết Thúc: ghi nhận xảy ra trước khi sự kiện kết thúc thì tiền nằm trong ký quỹ và được giải phóng; xảy ra sau thì đơn đã bị chuyển `EXPIRED` và đi nhánh `REFUND_REQUIRED`
- Khoá chống trùng: mã giao dịch tại cổng (`vnp_TransactionNo`) là UNIQUE toàn hệ thống chỉ trên các giao dịch thành công; giao dịch thất bại không chịu ràng buộc này (cổng có thể trả cùng mã, vd `0`, cho nhiều giao dịch thất bại)
- Ba nguồn dùng chung đúng một hành động ghi nhận này với cùng quy tắc và cùng khoá chống trùng; nguồn nào tới trước ghi nhận, nguồn tới sau với cùng mã giao dịch tại cổng nhận `DUPLICATE`; hai nguồn tới đồng thời được tuần tự hoá trên khoá đơn
- Mỗi giao dịch thanh toán được ghi nhận lưu trên bản ghi gắn với đơn: nguồn, mã giao dịch tại cổng, kết quả thành công / thất bại, số tiền, mã ngân hàng, thời điểm thanh toán
- Hoàn tiền thật qua cổng không thuộc phạm vi; đơn `REFUND_REQUIRED` chỉ thể hiện khoản phải hoàn ở số dư khả dụng của người mua

#### Ghi Nhận Từ Đường Quay Về

**Actor**: Người dùng

**Mục đích**: Client chuyển tiếp nguyên các tham số có chữ ký mà cổng gắn lên đường quay về khi người mua trở lại từ trang thanh toán, để hệ thống xác thực và ghi nhận kết quả ngay cả khi IPN chưa tới

**Luồng chính**:
1. Client gửi yêu cầu ghi nhận kết quả từ đường quay về kèm nguyên các tham số `vnp_*` nhận được trên đường quay về (mã tham chiếu, số tiền, mã phản hồi, trạng thái giao dịch, mã giao dịch tại cổng, mã ngân hàng, thời điểm thanh toán, chữ ký)
2. Hệ thống xác thực chữ ký, đối chiếu mã đơn và số tiền rồi ghi nhận theo § D Ghi Nhận Kết Quả Thanh Toán — trả 200 + mã đơn, trạng thái hiện tại của đơn sau khi ghi nhận, kết quả ghi nhận (`RECORDED` / `DUPLICATE`)

**Trường hợp ngoại lệ**:
- Thiếu hoặc sai dạng trường: trả 400 + `VALIDATION_FAILED`, `details` gồm field `vnp_TxnRef`, `vnp_Amount`, `vnp_ResponseCode`, `vnp_TransactionStatus`, `vnp_TransactionNo`, `vnp_SecureHash`; không thay đổi dữ liệu
- Chữ ký sai, hoặc một tham số `vnp_*` xuất hiện nhiều lần, hoặc thiếu cấu hình khoá bí mật của cổng: trả 422 + `PAYMENT_SIGNATURE_INVALID`, không đổi trạng thái đơn, không ghi sổ cái, ghi log cảnh báo
- Mã đơn không tồn tại: trả 404 + `ORDER_NOT_FOUND`, không ghi sổ cái
- Số tiền khác `buyerTotal` của đơn (sau khi chia 100): trả 422 + `PAYMENT_AMOUNT_MISMATCH`, không đổi trạng thái đơn, không ghi sổ cái, ghi log cảnh báo
- § D Ghi Nhận Kết Quả Thanh Toán trả `DUPLICATE` (IPN hoặc tra cứu cổng đã ghi nhận trước, hoặc client gửi lại cùng tham số): trả 200 + trạng thái hiện tại của đơn, kết quả `DUPLICATE`, không ghi sổ cái lại
- Lỗi khi ghi đơn hoặc sổ cái: huỷ toàn bộ thao tác, trả 500 + `INTERNAL_ERROR`

**Kiểm tra dữ liệu**:
- Mã tham chiếu (`vnp_TxnRef`): bắt buộc, 12–20 ký tự, regex `^[A-Za-z0-9]+$`
- Số tiền (`vnp_Amount`): bắt buộc, chuỗi số nguyên dương
- Mã phản hồi (`vnp_ResponseCode`), trạng thái giao dịch (`vnp_TransactionStatus`): bắt buộc, chuỗi 2 chữ số
- Mã giao dịch tại cổng (`vnp_TransactionNo`): bắt buộc, chuỗi số, 1–20 ký tự
- Chữ ký (`vnp_SecureHash`): bắt buộc, chuỗi hex 128 ký tự
- Mã ngân hàng (`vnp_BankCode`): tuỳ chọn, ≤ 20 ký tự; giá trị rỗng coi như không gửi
- Thời điểm thanh toán (`vnp_PayDate`): tuỳ chọn, `yyyyMMddHHmmss` theo GMT+7 và là ngày giờ có thật; giá trị rỗng coi như không gửi

**Quy tắc nghiệp vụ**:
- Xác thực chữ ký cùng thuật toán với § D Nhận Thông Báo Thanh Toán: lấy mọi tham số `vnp_*` trừ `vnp_SecureHash` và `vnp_SecureHashType`, bỏ tham số không có tiền tố `vnp_`, sắp xếp theo tên tăng dần, ký HMAC-SHA512 bằng khoá bí mật; chấp nhận cùng hai kiểu chuỗi ký (kèm tham số rỗng trước, bỏ tham số rỗng sau); ký trên giá trị đã giải mã rồi mã hoá lại theo cùng quy tắc, không dùng chuỗi tham số thô client gửi; so sánh không phân biệt hoa thường, bằng phép so sánh thời gian hằng
- Thứ tự kiểm tra cố định: chữ ký → mã đơn → số tiền → ghi nhận (gồm chống trùng); dừng ở bước đầu tiên thất bại
- Không tin bất kỳ dữ liệu nào trước khi chữ ký hợp lệ; client chỉ chuyển tiếp, không tự quyết kết quả thanh toán
- Thanh toán thành công khi đồng thời mã phản hồi = `00` và trạng thái giao dịch = `00`; mọi tổ hợp khác là thất bại (cùng quy tắc IPN)
- Gửi lại cùng bộ tham số (tải lại trang, gửi lặp) chỉ ra `DUPLICATE`, không ghi thêm bút toán
- Hành động này không dùng `X-User-Id`; mã đơn lấy từ `vnp_TxnRef` đã được chữ ký bảo vệ
- Request log của hành động không ghi các tham số `vnp_*` (chứa mã merchant)

---

### E. Sổ Cái

#### Ghi Bút Toán

**Actor**: Hệ thống

**Mục đích**: Ghi mọi dòng tiền thành giao dịch sổ cái kép bất biến, làm nguồn duy nhất cho mọi số dư

**Luồng chính**:
1. Hệ thống nhận yêu cầu ghi giao dịch sổ cái từ § D Ghi Nhận Kết Quả Thanh Toán hoặc § F Đánh Dấu Sự Kiện Kết Thúc kèm loại giao dịch, mã tham chiếu (đơn / giao dịch cổng / sự kiện), các dòng bút toán
2. Hệ thống kiểm tra tổng ghi nợ bằng tổng ghi có và khoá chống trùng, ghi giao dịch cùng các dòng trong cùng thao tác với thay đổi trạng thái liên quan — trả mã giao dịch sổ cái cho hành động gọi (tác vụ nội bộ)

**Trường hợp ngoại lệ**:
- Tổng ghi nợ khác tổng ghi có, có dòng số tiền ≤ 0, hoặc giao dịch dưới 2 dòng: từ chối ghi, huỷ toàn bộ thao tác gọi, ghi log lỗi `LEDGER_UNBALANCED`
- Trùng khoá chống trùng: không ghi thêm, trả giao dịch đã có
- Tài khoản sổ cái chưa tồn tại (lần đầu người bán / người mua / sự kiện phát sinh tiền): tự tạo tài khoản rồi ghi

**Kiểm tra dữ liệu**:
- Mỗi dòng bút toán: tài khoản bắt buộc, chiều (`DEBIT` / `CREDIT`) bắt buộc, số tiền số nguyên > 0
- Giao dịch: loại bắt buộc, mã tham chiếu bắt buộc, ≥ 2 dòng, Σ `DEBIT` = Σ `CREDIT`

**Quy tắc nghiệp vụ**:
- Tài khoản sổ cái (mỗi tài khoản có mã duy nhất 1–64 ký tự, regex `^[A-Za-z0-9_-]+$`):
  - `GATEWAY_CASH` — Tiền nhận qua cổng thanh toán; tài sản, số dư bên nợ; 1 tài khoản của sàn
  - `ESCROW_SELLER` — Ký quỹ tiền bán vé; nợ phải trả, số dư bên có; 1 tài khoản cho mỗi cặp (người bán, sự kiện); là số dư đang chờ của người bán
  - `ESCROW_FEE` — Ký quỹ phí sàn; nợ phải trả, số dư bên có; 1 tài khoản cho mỗi sự kiện
  - `SELLER_PAYABLE` — Phải trả người bán; nợ phải trả, số dư bên có; 1 tài khoản cho mỗi người bán; là số dư khả dụng từ bán vé
  - `BUYER_REFUND_PAYABLE` — Phải hoàn người mua; nợ phải trả, số dư bên có; 1 tài khoản cho mỗi người mua; là số dư khả dụng từ khoản cần hoàn
  - `PLATFORM_FEE_REVENUE` — Doanh thu phí sàn; doanh thu, số dư bên có; 1 tài khoản của sàn
- Bút toán theo sự kiện nghiệp vụ (số tiền lấy từ snapshot trên đơn):
  - `PAYMENT_CAPTURED` (đơn chuyển `PAID`): Nợ `GATEWAY_CASH` `buyerTotal`; Có `ESCROW_SELLER` của người bán và sự kiện `sellerNet`; Có `ESCROW_FEE` của sự kiện `platformFee`
  - `PAYMENT_REFUND_REQUIRED` (thanh toán đến muộn không giữ được vé, hoặc thanh toán thừa): Nợ `GATEWAY_CASH` số tiền đã nhận; Có `BUYER_REFUND_PAYABLE` của người mua cùng số tiền
  - `EVENT_RELEASE` (sự kiện kết thúc): với mỗi `ESCROW_SELLER` của sự kiện có số dư > 0: Nợ `ESCROW_SELLER` toàn bộ số dư; Có `SELLER_PAYABLE` của người bán cùng số tiền; với `ESCROW_FEE` của sự kiện có số dư > 0: Nợ `ESCROW_FEE` toàn bộ số dư; Có `PLATFORM_FEE_REVENUE` cùng số tiền
  - Đơn hết hạn hoặc thất bại: không có bút toán (không có tiền vào)
- Loại giao dịch chỉ gồm `PAYMENT_CAPTURED`, `PAYMENT_REFUND_REQUIRED`, `EVENT_RELEASE`
- Phí sàn chưa là doanh thu khi thanh toán; chỉ chuyển sang `PLATFORM_FEE_REVENUE` khi sự kiện kết thúc
- Khoá chống trùng: `PAYMENT_CAPTURED` / `PAYMENT_REFUND_REQUIRED` duy nhất theo mã giao dịch tại cổng; `EVENT_RELEASE` duy nhất theo mã sự kiện
- Bất biến: giao dịch và dòng bút toán đã ghi không sửa, không xoá; phạm vi hiện tại không có thao tác điều chỉnh
- Số dư tài khoản luôn tính từ các dòng bút toán: tài khoản tài sản = Σ nợ − Σ có; tài khoản nợ phải trả / doanh thu = Σ có − Σ nợ; không lưu số dư riêng
- Bất biến toàn sổ: Σ nợ = Σ có trên toàn bộ sổ cái; số dư `GATEWAY_CASH` = tổng số dư mọi tài khoản nợ phải trả và doanh thu
- Mỗi giao dịch lưu: mã, loại, mã tham chiếu, mô tả tiếng Việt ngắn (≤ 255 ký tự, gồm mã đơn hoặc tên sự kiện), thời điểm ghi

#### Xem Số Dư Người Dùng

**Actor**: Người dùng

**Mục đích**: Người dùng xem số dư đang chờ (ký quỹ) và số dư khả dụng của mình kèm lịch sử bút toán tạo nên các số dư đó

**Luồng chính**:
1. Client gửi yêu cầu xem số dư kèm `X-User-Id`, `page`, `limit`
2. Hệ thống tính số dư từ sổ cái và đọc lịch sử dòng bút toán — trả 200 + số dư đang chờ, số dư khả dụng (kèm tách: từ bán vé, từ khoản cần hoàn), danh sách dòng bút toán của các tài khoản thuộc người dùng, mỗi dòng gồm thời điểm, loại giao dịch, mô tả, tài khoản, mã đơn / sự kiện tham chiếu, số tiền có dấu (+ tăng số dư, − giảm số dư), loại số dư bị ảnh hưởng (`PENDING` / `AVAILABLE`); kèm `meta`

**Trường hợp ngoại lệ**:
- Người dùng chưa phát sinh bút toán: trả 200 + hai số dư bằng 0, danh sách rỗng
- Tham số sai: trả 400 + `VALIDATION_FAILED`, `details` gồm field `page`, `limit`

**Kiểm tra dữ liệu**:
- `X-User-Id`: bắt buộc, theo § Quy Tắc Chung
- `page`, `limit`: theo § Quy Tắc Chung

**Quy tắc nghiệp vụ**:
- Số dư đang chờ = Σ số dư các tài khoản `ESCROW_SELLER` của người dùng (mọi sự kiện)
- Số dư khả dụng = số dư `SELLER_PAYABLE` + số dư `BUYER_REFUND_PAYABLE` của người dùng
- Áp cho mọi người dùng: người bán chủ yếu có tiền bán vé, người mua chủ yếu bằng 0 trừ khoản cần hoàn; người vừa mua vừa bán thấy cả hai nguồn
- Lịch sử sắp xếp theo thời điểm ghi mới nhất trước; cộng toàn bộ dòng của một loại số dư phải bằng đúng số dư đó
- Số dư tính tại thời điểm đọc, không cache

#### Xem Sổ Cái Toàn Sàn

**Actor**: Người dùng

**Mục đích**: Người dùng trong Khu Quản Trị xem mọi tài khoản sổ cái cùng tổng nợ và tổng có toàn sổ

**Luồng chính**:
1. Client gửi yêu cầu xem sổ cái toàn sàn kèm loại giao dịch cần lọc (tuỳ chọn), mã sự kiện cần lọc (tuỳ chọn), `page`, `limit`
2. Hệ thống tính số dư mọi tài khoản và tổng từ dòng bút toán — trả 200 + danh sách tài khoản (mã, loại tài khoản, chủ sở hữu: sàn / người dùng / sự kiện kèm tên, tổng nợ, tổng có, số dư), Σ nợ toàn sổ, Σ có toàn sổ, danh sách giao dịch theo trang (mã, loại, mô tả, mã tham chiếu, thời điểm, các dòng bút toán); kèm `meta` của danh sách giao dịch

**Trường hợp ngoại lệ**:
- Sổ cái chưa có giao dịch: trả 200 + danh sách rỗng, Σ nợ và Σ có bằng 0
- Tham số sai: trả 400 + `VALIDATION_FAILED`, `details` gồm field `type`, `eventId`, `page`, `limit`
- `eventId` đúng dạng nhưng không tồn tại: trả 404 + `EVENT_NOT_FOUND`

**Kiểm tra dữ liệu**:
- `type`: tuỳ chọn, một trong `PAYMENT_CAPTURED`, `PAYMENT_REFUND_REQUIRED`, `EVENT_RELEASE`
- `eventId`: tuỳ chọn, mã sự kiện
- `page`, `limit`: theo § Quy Tắc Chung

**Quy tắc nghiệp vụ**:
- Danh sách tài khoản, Σ nợ và Σ có luôn tính trên toàn sổ, không chịu ảnh hưởng của bộ lọc; bộ lọc chỉ áp cho danh sách giao dịch
- Danh sách tài khoản không phân trang (dữ liệu mẫu nhỏ)
- Giao dịch sắp xếp theo thời điểm ghi mới nhất trước
- Tài khoản sắp xếp theo loại tài khoản (thứ tự như § E Ghi Bút Toán), cùng loại theo tên chủ sở hữu
- Mọi con số tính trực tiếp từ dòng bút toán tại thời điểm đọc

#### Xem Bút Toán Theo Tài Khoản

**Actor**: Người dùng

**Mục đích**: Người dùng trong Khu Quản Trị xem các dòng bút toán của một tài khoản sổ cái để đối chiếu số dư với bút toán

**Luồng chính**:
1. Client gửi yêu cầu xem bút toán theo tài khoản kèm mã tài khoản sổ cái, `page`, `limit`
2. Hệ thống đọc tài khoản và các dòng bút toán của tài khoản — trả 200 + thông tin tài khoản (mã, loại tài khoản, chủ sở hữu kèm tên, tổng nợ, tổng có, số dư) và danh sách dòng bút toán, mỗi dòng gồm thời điểm, mã giao dịch, loại giao dịch, mô tả, mã tham chiếu (đơn / sự kiện), chiều (`DEBIT` / `CREDIT`), số tiền; kèm `meta`

**Trường hợp ngoại lệ**:
- Tham số sai: trả 400 + `VALIDATION_FAILED`, `details` gồm field `accountId`, `page`, `limit`
- Mã tài khoản không tồn tại: trả 404 + `LEDGER_ACCOUNT_NOT_FOUND`
- Tài khoản chưa có dòng bút toán: trả 200 + thông tin tài khoản với tổng và số dư bằng 0, danh sách rỗng

**Kiểm tra dữ liệu**:
- `accountId`: bắt buộc, 1–64 ký tự, regex `^[A-Za-z0-9_-]+$`
- `page`, `limit`: theo § Quy Tắc Chung

**Quy tắc nghiệp vụ**:
- Chỉ đọc
- Dòng bút toán sắp xếp theo thời điểm ghi mới nhất trước, cùng thời điểm theo mã giao dịch
- Tổng nợ, tổng có, số dư tính trên mọi dòng của tài khoản (không chỉ trang hiện tại), theo công thức số dư ở § E Ghi Bút Toán

---

### F. Vận Hành Sự Kiện

#### Đánh Dấu Sự Kiện Kết Thúc

**Actor**: Người dùng

**Mục đích**: Đánh dấu một sự kiện đã kết thúc (một chiều), ngừng bán vé và giải phóng toàn bộ ký quỹ của sự kiện sang số dư khả dụng của từng người bán và doanh thu sàn

**Luồng chính**:
1. Client gửi yêu cầu đánh dấu sự kiện kết thúc kèm mã sự kiện
2. Hệ thống trong một thao tác nguyên tử khoá sự kiện, chuyển `COMPLETED` (ghi thời điểm kết thúc), chuyển mọi đơn `PENDING_PAYMENT` của sự kiện sang `EXPIRED` và ghi bút toán `EVENT_RELEASE` theo § E Ghi Bút Toán — trả 200 + mã sự kiện, trạng thái `COMPLETED`, thời điểm kết thúc, số đơn chờ thanh toán đã chuyển hết hạn, tổng tiền đã giải phóng (= tổng theo người bán + phí sàn), danh sách số tiền đã giải phóng theo từng người bán (mã, tên, số tiền), tổng phí sàn đã chuyển doanh thu, mã giao dịch sổ cái (rỗng nếu không có tiền ký quỹ)

**Trường hợp ngoại lệ**:
- Thiếu hoặc sai mã sự kiện: trả 400 + `VALIDATION_FAILED`, `details` gồm field `eventId`
- Mã sự kiện không tồn tại: trả 404 + `EVENT_NOT_FOUND`
- Sự kiện đã `COMPLETED` (kể cả gọi lặp hoặc hai yêu cầu đồng thời): trả 409 + `EVENT_ALREADY_COMPLETED`, `details`: `{ completedAt: <thời điểm> }`; không ghi thêm bút toán
- Sự kiện không có đơn `PAID` nào (ký quỹ bằng 0): vẫn chuyển `COMPLETED`, không tạo giao dịch sổ cái, trả 200 với danh sách giải phóng rỗng
- Lỗi khi ghi sổ cái: huỷ toàn bộ thao tác, sự kiện giữ `ON_SALE`, đơn giữ nguyên, trả 500 + `INTERNAL_ERROR`

**Kiểm tra dữ liệu**:
- `eventId`: bắt buộc, mã sự kiện

**Quy tắc nghiệp vụ**:
- Mọi người dùng thực hiện được; thao tác không đảo ngược, không có thao tác mở bán lại
- Số tiền giải phóng lấy từ số dư thực tế các tài khoản `ESCROW_SELLER` và `ESCROW_FEE` của sự kiện trên sổ cái tại thời điểm thực hiện, không cộng lại từ đơn hàng; sau thao tác các tài khoản này có số dư 0
- Không chặn khi còn đơn chờ thanh toán: các đơn này chuyển `EXPIRED`; thanh toán đến muộn cho chúng đi nhánh `REFUND_REQUIRED` của § D Ghi Nhận Kết Quả Thanh Toán (không vào ký quỹ, không được giải phóng)
- Tuần tự hoá với § D Ghi Nhận Kết Quả Thanh Toán và § C Tạo Đơn Hàng trên cùng sự kiện: không có đơn nào được tạo hoặc chuyển `PAID` cho sự kiện sau khi sự kiện đã `COMPLETED`
- Sau khi kết thúc: sự kiện ngừng bán (tạo đơn và tính tổng tiền trả `EVENT_NOT_ON_SALE`), tin bán vẫn hiển thị với số vé còn lại 0
- Đơn `REFUND_REQUIRED` của sự kiện không bị ảnh hưởng (tiền nằm ở `BUYER_REFUND_PAYABLE`, không thuộc ký quỹ)
- Sự kiện bị huỷ và hoàn tiền ký quỹ cho người mua không thuộc phạm vi
