# Đặc Tả Chức Năng: Ticket Checkout with Escrow

## TÓM TẮT
- **Surface**: web
- **Actor**: Người mua, Người bán (xác định theo tài khoản mẫu đang chọn trong dropdown, không đăng nhập; một tài khoản có thể vừa mua vừa bán)
- **Tích hợp**: cổng thanh toán VNPay sandbox (chuyển hướng trình duyệt sang trang thanh toán của cổng và quay về); mọi xử lý tiền, sổ cái, thông báo thanh toán do `api` đảm nhiệm

| Chức năng | Actor | Loại |
|-----------|-------|------|
| **A. Chọn Người Dùng** | | |
| &nbsp;&nbsp;↳ Chọn Tài Khoản Hiện Tại | Người mua, Người bán | xác thực |
| **B. Sự Kiện** | | |
| &nbsp;&nbsp;↳ Xem Danh Sách Sự Kiện | Người mua, Người bán | đọc |
| &nbsp;&nbsp;↳ Xem Trang Sự Kiện | Người mua, Người bán | đọc |
| **C. Mua Vé** | | |
| &nbsp;&nbsp;↳ Chọn Vé Và Xem Tổng Tiền | Người mua | đọc |
| &nbsp;&nbsp;↳ Xác Nhận Thanh Toán | Người mua | ghi |
| &nbsp;&nbsp;↳ Xem Kết Quả Thanh Toán | Người mua | đọc |
| **D. Tài Khoản** | | |
| &nbsp;&nbsp;↳ Xem Số Dư Và Lịch Sử Bút Toán | Người mua, Người bán | đọc |
| &nbsp;&nbsp;↳ Xem Danh Sách Đơn Hàng | Người mua, Người bán | đọc |
| **E. Quản Trị** | | |
| &nbsp;&nbsp;↳ Đánh Dấu Sự Kiện Kết Thúc | Người mua, Người bán | ghi |
| &nbsp;&nbsp;↳ Xem Sổ Cái Và Số Dư Sàn | Người mua, Người bán | đọc |

## Quy Tắc Chung
- Thanh đầu trang có mặt ở mọi trang: dropdown chọn tài khoản (§A) và liên kết điều hướng "Sự kiện", "Đơn hàng", "Tài khoản", "Quản trị"; mọi liên kết hiện với mọi tài khoản
- Hành động cần tài khoản (chọn vé, thanh toán, xem đơn hàng, xem tài khoản, quản trị) khi chưa chọn tài khoản: không thực hiện, hiển thị "Vui lòng chọn tài khoản để tiếp tục" và mở dropdown chọn tài khoản
- Mọi yêu cầu gửi tới `api` kèm mã tài khoản đang chọn; không có phân quyền theo vai trò, mọi tài khoản thấy cùng các trang và thao tác
- Mọi số tiền chính thức (tổng đơn, số dư, bút toán) lấy từ `api`; web không tự tính hay cộng dồn số dư. Ngoại lệ duy nhất là số tạm tính ở §C Chọn Vé Và Xem Tổng Tiền
- Định dạng tiền: VND số nguyên, dấu chấm ngăn cách hàng nghìn, hậu tố "₫" (vd `1.250.000 ₫`); số âm có dấu "−" phía trước
- Định dạng thời gian: múi giờ Asia/Ho_Chi_Minh, dạng `dd/MM/yyyy HH:mm`
- Giao diện dùng được từ chiều rộng màn hình 360px, không cuộn ngang; nút thao tác có vùng chạm tối thiểu 44×44px
- Đang tải dữ liệu danh sách / số dư: hiển thị khung chờ (skeleton) đúng vị trí nội dung; đang gửi thao tác ghi: nút chuyển trạng thái đang xử lý, bị vô hiệu hoá cho tới khi có phản hồi để chặn bấm lặp
- Danh sách có phân trang: web gửi `page` và `limit` (kích thước trang của từng danh sách ghi ở hành động); điều khiển phân trang dựng theo `meta { total, page, limit, totalPages }` `api` trả về; `totalPages` ≤ 1 thì ẩn điều khiển phân trang; tham số `page` trên URL lớn hơn `meta.totalPages` (khi `totalPages` ≥ 1) → chuyển về trang 1
- Mất kết nối mạng: hiển thị "Mất kết nối, vui lòng kiểm tra mạng", giữ nguyên trang và lựa chọn đang có
- `api` không phản hồi trong 15 giây hoặc lỗi hệ thống: hiển thị "Có lỗi xảy ra, vui lòng thử lại sau" kèm nút "Thử lại"; lỗi khi dựng trang từ máy chủ → trang lỗi chung, giữ nguyên URL

## Chi Tiết

### A. Chọn Người Dùng

#### Chọn Tài Khoản Hiện Tại

**Actor**: Người mua, Người bán

**Mục đích**: Chọn một tài khoản mẫu để toàn bộ website hiển thị theo góc nhìn tài khoản đó (đơn hàng, số dư, tin bán của mình) mà không cần đăng nhập

**Luồng chính**:
1. Người dùng nhấn dropdown tài khoản trên thanh đầu trang
2. Hệ thống mở danh sách thả xuống (cập nhật tại chỗ) — hiển thị: các tài khoản mẫu, mỗi mục là tên hiển thị của tài khoản; tài khoản đang chọn có dấu chọn; khi chưa chọn, dropdown hiển thị chữ "Chọn tài khoản"
3. Người dùng chọn một tài khoản trong danh sách
4. Hệ thống lưu lựa chọn và tải lại dữ liệu trang hiện tại theo tài khoản mới (cập nhật tại chỗ) — hiển thị: tên tài khoản mới trên dropdown, nội dung trang theo góc nhìn tài khoản đó, thông báo ngắn "Đang xem với tài khoản {tên hiển thị}" tự ẩn sau 3 giây

**Trường hợp ngoại lệ**:
- Không tải được danh sách tài khoản: trong dropdown hiển thị "Không tải được danh sách tài khoản" kèm nút "Thử lại"
- Danh sách tài khoản rỗng: trong dropdown hiển thị "Chưa có tài khoản mẫu, vui lòng nạp dữ liệu mẫu"
- Tài khoản đã lưu không còn tồn tại (dữ liệu mẫu được nạp lại): xoá lựa chọn, về trạng thái chưa chọn, hiển thị "Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại"
- Đổi tài khoản khi đang chọn vé trên trang sự kiện:
  - Tài khoản mới là người bán của tin đang chọn: bỏ lựa chọn vé, hiển thị "Bạn không thể mua tin bán của chính mình"
  - Trường hợp khác: giữ nguyên tin bán và số lượng đang chọn
- Đổi tài khoản khi đang ở trang kết quả của một đơn: xử lý theo §C Xem Kết Quả Thanh Toán (không tìm thấy đơn hàng)

**Kiểm tra dữ liệu**:
- Tài khoản được chọn: bắt buộc là một mã tài khoản có trong danh sách `api` trả về tại thời điểm chọn

**Quy tắc nghiệp vụ**:
- Không có đăng nhập, mật khẩu hay xác minh; tài khoản đang chọn là căn cứ duy nhất để hiển thị
- Lựa chọn lưu trong cookie của trình duyệt hiện tại trong 30 ngày, đọc được khi dựng trang từ máy chủ, giữ nguyên sau khi tải lại trang, mở tab mới và khi quay về từ cổng thanh toán
- Một tài khoản có tin bán vẫn được mua tin bán của người khác
- Chưa chọn tài khoản vẫn xem được danh sách sự kiện và trang sự kiện

---

### B. Sự Kiện

#### Xem Danh Sách Sự Kiện

**Actor**: Người mua, Người bán

**Mục đích**: Thấy các sự kiện đang có trên sàn để vào trang sự kiện chọn vé

**Luồng chính**:
1. Người dùng mở trang chủ hoặc nhấn "Sự kiện" trên thanh đầu trang
2. Hệ thống chuyển đến trang danh sách sự kiện (dựng sẵn từ máy chủ) — hiển thị: danh sách thẻ sự kiện, mỗi thẻ gồm tên sự kiện, thời gian diễn ra, địa điểm, giá vé thấp nhất đang bán ("Từ {giá} ₫"), tổng số vé còn lại, nhãn trạng thái "Đang bán" / "Đã kết thúc"
3. Người dùng nhấn vào một thẻ sự kiện
4. Hệ thống chuyển đến trang sự kiện — hiển thị: nội dung theo §B Xem Trang Sự Kiện

**Trường hợp ngoại lệ**:
- Chưa có sự kiện nào: hiển thị "Chưa có sự kiện nào"
- Sự kiện đang bán nhưng mọi tin bán đã hết vé: thẻ hiển thị "Hết vé" thay cho giá thấp nhất và số vé còn lại
- Sự kiện đã kết thúc: thẻ hiển thị nhãn "Đã kết thúc", không hiển thị giá và số vé còn lại

**Kiểm tra dữ liệu**:
- Không có trường nhập

**Quy tắc nghiệp vụ**:
- Sắp xếp: sự kiện "Đang bán" trước, trong mỗi nhóm theo thời gian diễn ra tăng dần
- Không phân trang (dữ liệu mẫu 1–2 sự kiện)
- Số vé còn lại và trạng thái lấy từ `api` tại thời điểm dựng trang; vé đang được giữ chỗ cho đơn chờ thanh toán không tính vào số còn lại

#### Xem Trang Sự Kiện

**Actor**: Người mua, Người bán

**Mục đích**: Xem thông tin sự kiện và các tin bán vé (người bán, giá, số lượng còn lại) để chọn mua

**Luồng chính**:
1. Người dùng mở URL trang sự kiện hoặc nhấn thẻ sự kiện ở trang danh sách
2. Hệ thống chuyển đến trang sự kiện (dựng sẵn từ máy chủ) — hiển thị: tên sự kiện, thời gian diễn ra, địa điểm, mô tả, nhãn trạng thái; danh sách tin bán, mỗi tin gồm tên người bán, giá mỗi vé, số vé còn lại, nút "Chọn"
3. Người dùng xem danh sách tin bán
4. Hệ thống đánh dấu tin bán theo tài khoản đang chọn (cập nhật tại chỗ) — hiển thị: nhãn "Tin của bạn" và nút "Chọn" bị vô hiệu hoá ở tin bán của chính tài khoản đang chọn

**Trường hợp ngoại lệ**:
- Slug không tồn tại hoặc sai dạng: trả về trang 404 "Không tìm thấy sự kiện"
- Sự kiện không có tin bán nào: hiển thị "Sự kiện chưa có tin bán vé"
- Tin bán còn 0 vé: hiển thị nhãn "Hết vé", nút "Chọn" bị vô hiệu hoá
- Sự kiện đã kết thúc: hiển thị băng thông báo "Sự kiện đã kết thúc, ngừng bán vé"; mọi nút "Chọn" bị vô hiệu hoá; ẩn số vé còn lại
- Chưa chọn tài khoản và nhấn "Chọn": xử lý theo Quy tắc chung (yêu cầu chọn tài khoản), sau khi chọn thì mở khu chọn số lượng của tin vừa nhấn nếu tin đó không phải của tài khoản mới

**Kiểm tra dữ liệu**:
- Slug trên URL: bắt buộc, 1–100 ký tự, regex `^[a-z0-9]+(-[a-z0-9]+)*$`; sai dạng → 404, không gọi `api`

**Quy tắc nghiệp vụ**:
- Sắp xếp tin bán theo giá mỗi vé tăng dần; cùng giá thì tin còn nhiều vé hơn đứng trước
- Số vé còn lại = số vé của tin trừ vé đã bán và vé đang giữ chỗ, do `api` trả về; số hiển thị có thể cũ so với thực tế, số chính thức được `api` kiểm tra lại khi tạo đơn (§C Xác Nhận Thanh Toán)
- Nội dung chính (sự kiện, tin bán, giá, số còn lại) dựng từ máy chủ không phụ thuộc tài khoản; nhãn "Tin của bạn" và trạng thái nút theo tài khoản đang chọn
- Người dùng không mua được tin bán của chính mình
- URL trang sự kiện: `/su-kien/[slug]` — slug do `api` cấp, không dấu, duy nhất

---

### C. Mua Vé

#### Chọn Vé Và Xem Tổng Tiền

**Actor**: Người mua

**Mục đích**: Chọn một tin bán và số lượng vé, xem tổng tiền vé, phí dịch vụ và tổng phải trả trước khi thanh toán

**Luồng chính**:
1. Người mua nhấn "Chọn" ở một tin bán trên trang sự kiện
2. Hệ thống mở khu chọn số lượng của tin đó (cập nhật tại chỗ; trên màn hình dưới 768px là bottom sheet) — hiển thị: tên người bán, giá mỗi vé, số vé còn lại, ô số lượng có nút "−" / "+" (mặc định 1), bảng tạm tính gồm "Tiền vé", "Phí dịch vụ (10%)", "Tổng thanh toán", nút "Thanh toán"
3. Người mua tăng / giảm hoặc nhập số lượng
4. Hệ thống tính lại bảng tạm tính (cập nhật tại chỗ) — hiển thị: tiền vé, phí dịch vụ, tổng thanh toán theo số lượng mới

**Trường hợp ngoại lệ**:
- Validation số lượng thất bại: hiện câu lỗi dưới ô số lượng, vô hiệu hoá nút "Thanh toán", bảng tạm tính hiển thị "—"
  - Để trống: "Vui lòng nhập số lượng"
  - Không phải số nguyên hoặc nhỏ hơn 1: "Số lượng tối thiểu là 1"
  - Lớn hơn số vé còn lại: "Chỉ còn {N} vé"
- Nút "−" bị vô hiệu hoá khi số lượng là 1; nút "+" bị vô hiệu hoá khi số lượng bằng số vé còn lại
- Người mua nhấn "Chọn" ở tin bán khác: khu chọn chuyển sang tin mới, số lượng đặt lại 1
- Người mua đóng khu chọn (nút đóng, vuốt xuống bottom sheet, phím Esc): huỷ lựa chọn, không tạo đơn

**Kiểm tra dữ liệu**:
- Số lượng: bắt buộc, số nguyên, 1 ≤ số lượng ≤ số vé còn lại của tin bán; chỉ nhận ký tự `0-9`

**Quy tắc nghiệp vụ**:
- Chỉ chọn 1 tin bán cho mỗi lần thanh toán
- Bảng tạm tính dùng đúng quy tắc phí của spec `api` (tham chiếu, đã chốt trong requirements): Tiền vé = giá mỗi vé × số lượng; Phí dịch vụ = 10% tiền vé, làm tròn xuống tới đồng; Tổng thanh toán = Tiền vé + Phí dịch vụ
- Số tạm tính chỉ để hiển thị; số tiền chính thức của đơn do `api` tính khi tạo đơn
- Phần 5% khấu trừ của người bán không hiển thị cho người mua

#### Xác Nhận Thanh Toán

**Actor**: Người mua

**Mục đích**: Tạo đơn hàng chờ thanh toán, giữ chỗ vé và chuyển người mua sang trang thanh toán của cổng

**Luồng chính**:
1. Người mua nhấn "Thanh toán" trong khu chọn số lượng
2. Hệ thống gửi yêu cầu tạo đơn và chuyển nút sang trạng thái đang xử lý (cập nhật tại chỗ) — hiển thị: nút "Đang tạo đơn…" bị vô hiệu hoá, ô số lượng bị khoá
3. Người mua chờ phản hồi
4. Hệ thống chuyển trình duyệt sang trang thanh toán của cổng VNPay sandbox — hiển thị: trang của cổng với số tiền bằng tổng thanh toán của đơn
5. Người mua nhập thông tin thẻ test và xác nhận trên trang của cổng
6. Hệ thống (cổng) chuyển người mua về trang kết quả của đơn — hiển thị: nội dung theo §C Xem Kết Quả Thanh Toán

**Trường hợp ngoại lệ**:
- Số vé còn lại không đủ tại thời điểm tạo đơn: không tạo đơn, cập nhật số vé còn lại của tin bán, hiển thị "Chỉ còn {N} vé, vui lòng chọn lại số lượng"; còn 0 vé → đóng khu chọn, tin hiển thị "Hết vé" và thông báo "Tin bán này vừa hết vé"
- Sự kiện đã kết thúc trong lúc đang chọn: không tạo đơn, đóng khu chọn, hiển thị băng thông báo "Sự kiện đã kết thúc, ngừng bán vé"
- Tin bán của chính tài khoản đang chọn: hiển thị "Bạn không thể mua tin bán của chính mình"
- Tin bán không còn tồn tại: đóng khu chọn, tải lại danh sách tin bán, hiển thị "Tin bán không còn tồn tại"
- Mất mạng hoặc hết 15 giây chưa có phản hồi khi tạo đơn: mở lại nút "Thanh toán", hiển thị "Chưa tạo được đơn, vui lòng thử lại"; lần bấm lại dùng cùng khoá chống trùng của lần trước nên không tạo đơn thứ hai nếu đơn đầu thực ra đã được tạo
- Không mở được trang của cổng thanh toán (cổng lỗi): hiển thị "Không kết nối được cổng thanh toán, vui lòng thử lại sau"; đơn đã tạo giữ trạng thái chờ thanh toán và tự hết hạn theo thời hạn giữ chỗ
- Người mua quay lại trang sự kiện bằng nút Back của trình duyệt mà không thanh toán: trang sự kiện tải lại số vé còn lại (đã trừ phần đang giữ chỗ); đơn vừa tạo vẫn chờ thanh toán và tự hết hạn sau thời hạn giữ chỗ
- Người mua huỷ hoặc thanh toán thất bại trên trang của cổng: cổng chuyển về trang kết quả, trạng thái hiển thị theo `api`

**Kiểm tra dữ liệu**:
- Số lượng: kiểm tra lại như §C Chọn Vé Và Xem Tổng Tiền trước khi gửi; không hợp lệ → không gửi
- Khoá chống trùng: mỗi lần mở khu chọn cho một tin bán + số lượng sinh 1 khoá ngẫu nhiên (UUID v4); đổi tin bán hoặc số lượng → sinh khoá mới

**Quy tắc nghiệp vụ**:
- Tạo đơn, giữ chỗ vé, thời hạn giữ chỗ 15 phút và tạo liên kết thanh toán do `api` thực hiện (tham chiếu spec `api`); web chỉ chuyển hướng tới liên kết `api` trả về
- Địa chỉ quay về sau thanh toán là trang kết quả của chính đơn đó (`/don-hang/{mã đơn}`)
- Không có thao tác "tiếp tục thanh toán" cho đơn đang chờ; muốn mua lại thì tạo đơn mới
- Mỗi lần bấm "Thanh toán" chỉ gửi 1 yêu cầu; nút bị vô hiệu hoá cho tới khi có phản hồi

#### Xem Kết Quả Thanh Toán

**Actor**: Người mua

**Mục đích**: Người mua biết chắc trạng thái thật của đơn sau khi quay về từ cổng thanh toán, trang tự cập nhật khi đơn còn chờ xác nhận

**Luồng chính**:
1. Người mua được cổng chuyển về trang kết quả, hoặc nhấn một đơn ở trang Đơn hàng
2. Hệ thống (khi được cổng chuyển về kèm tham số `vnp_*`: chuyển tiếp các tham số đó cho `api` ghi nhận rồi chuyển hướng về `/don-hang/{mã đơn}` không còn query) chuyển đến trang kết quả của đơn — hiển thị: mã đơn, tên sự kiện, người bán, số lượng, giá mỗi vé, tiền vé, phí dịch vụ, tổng thanh toán, thời điểm tạo đơn, khối trạng thái theo trạng thái `api` ghi nhận:
   - Đã thanh toán: "Thanh toán thành công", thời điểm thanh toán, nút "Xem đơn hàng"
   - Đang chờ xác nhận: biểu tượng đang xử lý, "Đang chờ xác nhận thanh toán từ cổng…", hạn giữ chỗ "Giữ vé đến {HH:mm}"
   - Thất bại: "Thanh toán không thành công. Vé đã được trả lại cho tin bán.", nút "Quay lại sự kiện"
   - Hết hạn: "Đơn đã hết hạn giữ chỗ. Vé đã được trả lại cho tin bán.", nút "Quay lại sự kiện"
   - Cần hoàn tiền: "Đã nhận thanh toán nhưng vé không còn đủ. {Tổng thanh toán} ₫ sẽ được hoàn lại và đang hiển thị ở số dư khả dụng của bạn.", nút "Xem tài khoản"
3. Người mua ở lại trang khi đơn đang chờ xác nhận
4. Hệ thống hỏi lại trạng thái đơn từ `api` sau số giây `retryAfterSeconds` của lần phản hồi gần nhất và thay khối trạng thái khi trạng thái đổi (cập nhật tại chỗ) — hiển thị: khối trạng thái mới, dừng hỏi lại khi đơn ra khỏi trạng thái đang chờ

**Trường hợp ngoại lệ**:
- Không tìm thấy đơn hàng (mã đơn sai dạng, đơn không tồn tại, hoặc đơn không do tài khoản đang chọn mua — kể cả do đổi tài khoản hay mở liên kết của người khác): mọi trường hợp chỉ hiển thị một thông báo duy nhất "Không tìm thấy đơn hàng", không hiển thị chi tiết đơn, không phân biệt nguyên nhân; khi dựng trang từ máy chủ → trang 404 với thông báo này, khi đang ở trang (đổi tài khoản, lần hỏi lại) → thay nội dung trang tại chỗ và dừng hỏi lại
- Chưa chọn tài khoản: xử lý theo Quy tắc chung (yêu cầu chọn tài khoản); nếu URL có tham số `vnp_*` thì vẫn chuyển tiếp cho `api` ghi nhận và chuyển hướng về URL không còn query trước khi yêu cầu chọn tài khoản
- `api` từ chối ghi nhận từ đường quay về (chữ ký không hợp lệ, số tiền không khớp, không tìm thấy đơn) hoặc lỗi mạng / lỗi hệ thống / quá 15 giây khi chuyển tiếp: không hiển thị lỗi kỹ thuật, vẫn chuyển hướng về URL không còn query và hiển thị trạng thái thật của đơn theo `api` như mọi lần tải trang (đơn không tồn tại hoặc không do tài khoản đang chọn mua → "Không tìm thấy đơn hàng")
- Tải lại trang hoặc nhấn Back sau khi đã chuyển hướng: URL không còn tham số `vnp_*` nên không chuyển tiếp lại, chỉ đọc trạng thái từ `api`
- Sau 120 giây hỏi lại đơn vẫn đang chờ: dừng hỏi lại, hiển thị "Chưa nhận được xác nhận từ cổng thanh toán. Kết quả sẽ được cập nhật tại trang Đơn hàng." kèm nút "Kiểm tra lại" (bấm → hỏi lại ngay và chạy lại chu kỳ 120 giây)
- Một lần hỏi lại bị lỗi mạng hoặc lỗi hệ thống: không đổi khối trạng thái, lần hỏi kế tiếp theo `retryAfterSeconds` của lần phản hồi thành công gần nhất, vẫn tính trong 120 giây
- Đơn chuyển từ đang chờ sang đã thanh toán / cần hoàn tiền / thất bại / hết hạn khi người mua đang xem: thay khối trạng thái, đọc thông báo cho trình đọc màn hình

**Kiểm tra dữ liệu**:
- Mã đơn trên URL: bắt buộc, 12–20 ký tự, regex `^[A-Za-z0-9]+$` (theo spec `api`); sai dạng → "Không tìm thấy đơn hàng" (trang 404), không gọi `api` (kể cả khi URL có tham số `vnp_*`)
- Tham số đường quay về: chỉ chuyển tiếp khi query có `vnp_SecureHash`; chuyển tiếp mọi tham số có tiền tố `vnp_` với nguyên tên và giá trị nhận được, không thêm, bớt, sửa hay tự kiểm tra; tham số không có tiền tố `vnp_` không chuyển tiếp. Query có tham số `vnp_*` nhưng thiếu `vnp_SecureHash` → không chuyển tiếp, vẫn chuyển hướng về URL không còn query

**Quy tắc nghiệp vụ**:
- Trạng thái hiển thị chỉ lấy từ `api`; web không dùng tham số kết quả mà cổng gắn vào đường dẫn quay về (mã phản hồi, số tiền, chữ ký) để hiển thị, chỉ chuyển tiếp nguyên cho `api`; xác thực chữ ký, số tiền và ghi nhận do `api` thực hiện (tham chiếu spec `api`)
- Chuyển tiếp hoàn tất (thành công hoặc bị từ chối) trước khi đọc trạng thái đơn, nên trang hiển thị ngay kết quả `api` vừa ghi nhận từ đường quay về; chuyển hướng về URL không còn query thay thế mục lịch sử trình duyệt, URL có tham số `vnp_*` không còn trong lịch sử
- Chuyển tiếp không phụ thuộc tài khoản đang chọn: ghi nhận dựa trên chữ ký của cổng, kể cả khi tài khoản đang chọn không phải người mua của đơn (trang sau đó vẫn hiển thị "Không tìm thấy đơn hàng" theo phạm vi xem)
- Chuyển tiếp lặp lại cùng tham số (vd gửi lại thủ công) không gây ghi nhận trùng; chống trùng do `api` đảm nhiệm
- Thông báo thanh toán đã tới trước khi người mua quay về → trang hiển thị ngay trạng thái đã ghi nhận, không qua trạng thái đang chờ
- Nhịp hỏi lại theo `retryAfterSeconds` `api` trả về (chỉ có khi đơn đang chờ); phản hồi không còn `retryAfterSeconds` → dừng hỏi lại. Mốc 120 giây tính từ lần tải trang hoặc lần bấm "Kiểm tra lại"
- Việc chủ động tra cứu cổng khi đơn chờ quá lâu do `api` thực hiện (tham chiếu spec `api`); web chỉ hỏi lại `api`
- Các số tiền trên trang là số `api` đã ghi cho đơn, không dùng số tạm tính ở trang sự kiện
- Phạm vi xem: tài khoản đang chọn (kể cả tài khoản có tin bán) chỉ xem được đơn mình là người mua; không xem được đơn người khác mua tin của mình

---

### D. Tài Khoản

#### Xem Số Dư Và Lịch Sử Bút Toán

**Actor**: Người mua, Người bán

**Mục đích**: Xem số dư đang chờ (ký quỹ) và số dư khả dụng của tài khoản đang chọn cùng các bút toán tạo nên các số dư đó

**Luồng chính**:
1. Người dùng nhấn "Tài khoản" trên thanh đầu trang
2. Hệ thống chuyển đến trang Tài khoản — hiển thị: tên tài khoản, hai ô số dư "Số dư đang chờ" (chú thích "Tiền bán vé đang được giữ ký quỹ đến khi sự kiện kết thúc") và "Số dư khả dụng"; bảng lịch sử bút toán, mỗi dòng gồm thời điểm, diễn giải (vd "Bán 2 vé · {Tên sự kiện} · Đơn {mã đơn}", "Giải phóng ký quỹ · {Tên sự kiện}", "Khoản hoàn tiền · Đơn {mã đơn}"), loại số dư bị ảnh hưởng ("Đang chờ" / "Khả dụng"), số tiền có dấu (+ tăng, − giảm); phân trang `limit` 20
3. Người dùng nhấn sang trang khác của lịch sử
4. Hệ thống tải trang lịch sử tương ứng (cập nhật tại chỗ) — hiển thị: các dòng bút toán của trang đó, điều khiển phân trang theo `meta`, hai ô số dư giữ nguyên

**Trường hợp ngoại lệ**:
- Chưa chọn tài khoản: xử lý theo Quy tắc chung (yêu cầu chọn tài khoản)
- Chưa có bút toán nào: hai ô số dư hiển thị `0 ₫`, bảng hiển thị "Chưa có giao dịch nào"
- Tham số `page` vượt quá `meta.totalPages`: chuyển về trang 1
- Tải lịch sử lỗi nhưng số dư tải được: vẫn hiển thị số dư, bảng hiển thị "Không tải được lịch sử giao dịch" kèm nút "Thử lại"

**Kiểm tra dữ liệu**:
- Tham số `page`: tuỳ chọn, số nguyên ≥ 1, mặc định 1 nếu không có hoặc không hợp lệ

**Quy tắc nghiệp vụ**:
- Hai số dư và lịch sử bút toán do `api` tính từ sổ cái (tham chiếu spec `api`); web không tự cộng các dòng lịch sử để ra số dư
- Áp dụng cho mọi tài khoản: người bán thường có số dư đang chờ từ tiền bán vé; người mua thường là 0, trừ khoản cần hoàn tiền nằm ở số dư khả dụng
- Lịch sử sắp xếp mới nhất trước
- Không có thao tác rút tiền hay chi trả

#### Xem Danh Sách Đơn Hàng

**Actor**: Người mua, Người bán

**Mục đích**: Xem các đơn do chính tài khoản đang chọn mua cùng trạng thái, số vé, số tiền đã trả

**Luồng chính**:
1. Người dùng nhấn "Đơn hàng" trên thanh đầu trang
2. Hệ thống chuyển đến trang Đơn hàng — hiển thị: danh sách đơn, mỗi đơn gồm mã đơn, tên sự kiện, người bán, số vé, tổng thanh toán, nhãn trạng thái ("Đã thanh toán" / "Đang chờ xác nhận" / "Thất bại" / "Hết hạn" / "Cần hoàn tiền"), thời điểm tạo; đơn đang chờ có thêm "Giữ vé đến {HH:mm}"; phân trang `limit` 20
3. Người dùng nhấn vào một đơn
4. Hệ thống chuyển đến trang kết quả của đơn — hiển thị: nội dung theo §C Xem Kết Quả Thanh Toán

**Trường hợp ngoại lệ**:
- Chưa chọn tài khoản: xử lý theo Quy tắc chung (yêu cầu chọn tài khoản)
- Chưa có đơn nào: hiển thị "Bạn chưa có đơn hàng nào" kèm nút "Xem sự kiện"
- Đổi tài khoản khi đang ở trang Đơn hàng: tải lại danh sách theo tài khoản mới, về trang 1
- Tham số `page` vượt quá `meta.totalPages`: chuyển về trang 1

**Kiểm tra dữ liệu**:
- Tham số `page`: tuỳ chọn, số nguyên ≥ 1, mặc định 1 nếu không có hoặc không hợp lệ

**Quy tắc nghiệp vụ**:
- Chỉ hiển thị đơn có người mua là tài khoản đang chọn; tài khoản có tin bán vẫn thấy đơn do chính mình mua, không thấy đơn người khác mua tin của mình
- Trang chỉ đọc: không có thao tác huỷ, sửa, hoàn tiền hay đổi trạng thái đơn
- Sắp xếp theo thời điểm tạo mới nhất trước
- "Số tiền đã trả" là tổng thanh toán của đơn; đơn thất bại / hết hạn vẫn hiển thị tổng của đơn kèm nhãn trạng thái, không coi là đã trả
- Trạng thái lấy từ `api` tại thời điểm tải trang; trang không tự hỏi lại định kỳ

---

### E. Quản Trị

#### Đánh Dấu Sự Kiện Kết Thúc

**Actor**: Người mua, Người bán

**Mục đích**: Xác nhận sự kiện đã kết thúc để ngừng bán vé và giải phóng tiền ký quỹ sang số dư khả dụng của từng người bán

**Luồng chính**:
1. Người dùng nhấn "Quản trị" trên thanh đầu trang
2. Hệ thống chuyển đến trang Quản trị — hiển thị: danh sách sự kiện, mỗi sự kiện gồm tên, thời gian diễn ra, trạng thái, số tiền đang ký quỹ, số đơn đang chờ thanh toán, nút "Đánh dấu kết thúc" (chỉ ở sự kiện đang bán); liên kết "Xem sổ cái"
3. Người dùng nhấn "Đánh dấu kết thúc" ở một sự kiện
4. Hệ thống mở modal xác nhận — hiển thị: "Kết thúc sự kiện {Tên sự kiện}? Thao tác không thể hoàn tác.", số tiền ký quỹ sẽ giải phóng, số người bán nhận tiền, số đơn đang chờ thanh toán sẽ chuyển hết hạn, nút "Huỷ" và "Xác nhận kết thúc"
5. Người dùng nhấn "Xác nhận kết thúc"
6. Hệ thống gửi yêu cầu, đóng modal khi thành công và cập nhật dòng sự kiện (cập nhật tại chỗ) — hiển thị: thông báo "Đã kết thúc sự kiện {Tên sự kiện}, giải phóng {số tiền} ₫ cho {N} người bán", trạng thái "Đã kết thúc", số tiền ký quỹ `0 ₫`, nút "Đánh dấu kết thúc" biến mất

**Trường hợp ngoại lệ**:
- Chưa chọn tài khoản: xử lý theo Quy tắc chung (yêu cầu chọn tài khoản)
- Nhấn "Huỷ", nút đóng hoặc phím Esc trên modal: đóng modal, không thay đổi gì
- Sự kiện đã được kết thúc trước đó (tab khác hoặc người khác): đóng modal, cập nhật dòng sự kiện, hiển thị "Sự kiện đã được đánh dấu kết thúc trước đó"
- Lỗi mạng hoặc lỗi hệ thống khi xác nhận: giữ modal, mở lại nút "Xác nhận kết thúc", hiển thị "Chưa kết thúc được sự kiện, vui lòng thử lại"; lần bấm lại an toàn vì thao tác kết thúc một sự kiện chỉ có hiệu lực một lần
- Không có sự kiện nào: hiển thị "Chưa có sự kiện nào"
- Sự kiện không có tiền ký quỹ: modal vẫn cho xác nhận, số tiền giải phóng hiển thị `0 ₫`

**Kiểm tra dữ liệu**:
- Không có trường nhập; sự kiện được chọn phải đang ở trạng thái "Đang bán"

**Quy tắc nghiệp vụ**:
- Mọi tài khoản đang chọn đều thực hiện được (Khu Quản Trị không phân quyền); thao tác một chiều, không có nút hoàn tác
- Giải phóng ký quỹ, tách phí sàn, chuyển đơn chờ thanh toán sang hết hạn và xử lý thanh toán đến muộn do `api` thực hiện (tham chiếu spec `api`); số liệu trong modal và thông báo lấy từ `api`
- Sau khi kết thúc, trang sự kiện và trang danh sách sự kiện hiển thị trạng thái "Đã kết thúc" ở lần tải kế tiếp

#### Xem Sổ Cái Và Số Dư Sàn

**Actor**: Người mua, Người bán

**Mục đích**: Xem các tài khoản sổ cái (ký quỹ, phí sàn, phải trả người bán…) cùng tổng ghi nợ, tổng ghi có, số dư và các bút toán của từng tài khoản

**Luồng chính**:
1. Người dùng nhấn "Xem sổ cái" trên trang Quản trị
2. Hệ thống chuyển đến trang Sổ cái — hiển thị: bảng tài khoản sổ cái, mỗi dòng gồm tên tài khoản (vd Ký quỹ, Doanh thu phí sàn, Phải trả người bán · {tên}, Phải hoàn người mua · {tên}), tổng ghi nợ, tổng ghi có, số dư
3. Người dùng nhấn vào một tài khoản sổ cái
4. Hệ thống chuyển đến trang chi tiết tài khoản sổ cái — hiển thị: tên tài khoản, số dư; danh sách dòng bút toán gồm thời điểm, mã giao dịch, diễn giải, tham chiếu (đơn / sự kiện), ghi nợ, ghi có; phân trang `limit` 50

**Trường hợp ngoại lệ**:
- Chưa chọn tài khoản: xử lý theo Quy tắc chung (yêu cầu chọn tài khoản)
- Chưa có bút toán nào: bảng hiển thị "Chưa có bút toán nào"
- Mã tài khoản sổ cái trên URL không tồn tại: trả về trang 404 "Không tìm thấy tài khoản sổ cái"
- Tham số `page` vượt quá `meta.totalPages`: chuyển về trang 1

**Kiểm tra dữ liệu**:
- Mã tài khoản sổ cái trên URL: bắt buộc, 1–64 ký tự, regex `^[A-Za-z0-9_-]+$`; sai dạng → 404, không gọi `api`
- Tham số `page`: tuỳ chọn, số nguyên ≥ 1, mặc định 1 nếu không có hoặc không hợp lệ

**Quy tắc nghiệp vụ**:
- Chỉ đọc: trang không có thao tác thêm, sửa, xoá bút toán
- Danh sách tài khoản sổ cái, tổng nợ / có và số dư do `api` tính từ sổ cái (tham chiếu spec `api`); web không tự cộng
- Bảng tài khoản sắp xếp theo thứ tự `api` trả về; dòng bút toán sắp xếp mới nhất trước
