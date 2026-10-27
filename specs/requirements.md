# Yêu Cầu Dự Án: Ticket Checkout with Escrow

## TÓM TẮT
- **Tổng quan**: Lát cắt mỏng của sàn bán lại vé sự kiện — người mua chọn vé, thanh toán qua cổng thanh toán thật (môi trường thử nghiệm), tiền được giữ ký quỹ và ghi sổ kép cho đến khi sự kiện kết thúc rồi mới chuyển sang số dư khả dụng của người bán.
- **Tính năng chính**:
  - Trang sự kiện hiển thị các tin bán vé, giá và số lượng còn lại, dùng tốt trên điện thoại
  - Chọn tin bán + số lượng, xem tổng tiền gồm phí dịch vụ, chuyển sang cổng thanh toán
  - Trang kết quả hiển thị trạng thái thật của đơn hàng sau khi quay về từ cổng thanh toán
  - Nhận và xử lý thông báo thanh toán từ cổng (IPN / webhook) đúng một lần, có kiểm tra chữ ký
  - Sổ cái kép ghi mọi dòng tiền; mọi số dư đều tính ra từ sổ cái
  - Hiển thị số dư đang chờ (ký quỹ) và số dư khả dụng của từng người dùng
  - Đánh dấu sự kiện đã kết thúc → giải phóng tiền ký quỹ sang số dư khả dụng của người bán
- **Tính năng phụ**:
  - Dữ liệu mẫu: 1–2 sự kiện, nhiều tin bán từ ít nhất 2 người bán
  - Chọn người dùng hiện tại qua dropdown (không đăng nhập)
- **Ứng dụng**: Website Marketplace, Khu Quản Trị

## Chi Tiết

### Bối Cảnh
Bên tuyển dụng đang xây một sàn bán lại vé sự kiện. Bài test này là lát cắt mỏng của sàn: bán được một vé và hạch toán tiền chính xác. Rủi ro lớn nhất của sàn bán lại là tiền: người mua cần được bảo vệ cho đến khi sự kiện diễn ra, người bán chỉ được nhận tiền sau khi sự kiện kết thúc, sàn phải giữ đúng phần phí và mọi con số phải truy vết được. Thời gian làm khoảng 1–2 ngày với AI hỗ trợ, hạn nộp 1 tuần; cách ra quyết định ở những chỗ brief không nói rõ là một phần được đánh giá.

### Đối Tượng Sử Dụng
- **Người mua**: xem vé của sự kiện, chọn số lượng, thanh toán, biết chắc đơn đã thành công hay chưa
- **Người bán**: có tin bán vé trên sàn, theo dõi tiền đang bị giữ ký quỹ và tiền đã khả dụng; một tài khoản có thể vừa bán vừa mua
- **Người chấm bài**: chạy dự án trên máy cá nhân bằng một lệnh, thanh toán thử bằng thông tin test, đọc README để hiểu các quyết định

### Các Tính Năng

#### Website Marketplace
- Chọn người dùng: người dùng chọn một tài khoản mẫu trong dropdown → toàn bộ trang hiển thị theo góc nhìn tài khoản đó (đơn hàng, số dư)
- Xem trang sự kiện: người mua mở trang một sự kiện → thấy thông tin sự kiện và danh sách tin bán, mỗi tin có người bán, giá mỗi vé (VND) và số lượng còn lại; trang được dựng sẵn từ máy chủ, hiển thị gọn trên màn hình điện thoại
- Chọn vé: người mua chọn một tin bán và số lượng (không vượt số còn lại) → thấy tổng tiền vé, phí dịch vụ 10% và tổng phải trả
- Thanh toán: người mua xác nhận → đơn hàng được tạo ở trạng thái chờ thanh toán, số vé được giữ chỗ tạm, người mua được chuyển sang trang của cổng thanh toán và trả bằng thông tin test
- Xem kết quả: người mua quay về từ cổng → trang kết quả hiển thị trạng thái thật của đơn do hệ thống ghi nhận (đã thanh toán / đang chờ xác nhận / thất bại / hết hạn); kết quả cổng trả về khi quay lại chỉ được dùng để ghi nhận thanh toán khi có chữ ký hợp lệ, còn trạng thái hiển thị luôn lấy từ hệ thống; nếu đang chờ xác nhận thì trang tự cập nhật khi có kết quả
- Nhận thông báo thanh toán: cổng thanh toán gửi thông báo kết quả → hệ thống xác thực chữ ký, đối chiếu số tiền và mã đơn, cập nhật trạng thái đơn và ghi sổ cái đúng một lần, kể cả khi thông báo đến nhiều lần hoặc cùng giao dịch đã được xác nhận qua kết quả quay về hay tra cứu trực tiếp từ cổng
- Xem số dư: người dùng mở trang tài khoản → thấy số dư đang chờ (tiền bán vé đang ký quỹ) và số dư khả dụng, kèm lịch sử các bút toán tạo nên các số dư đó
- Xem đơn hàng: người dùng đang chọn (kể cả tài khoản có tin bán) xem danh sách đơn do chính mình mua → thấy trạng thái, số vé, số tiền đã trả

#### Khu Quản Trị
- Đánh dấu sự kiện kết thúc: người dùng chọn một sự kiện và xác nhận kết thúc → toàn bộ tiền ký quỹ của sự kiện chuyển sang số dư khả dụng của từng người bán tương ứng, sự kiện không còn bán vé
- Xem sổ cái và số dư sàn: người dùng xem các tài khoản sổ cái (tiền ký quỹ, phí sàn, tiền phải trả người bán…) → tổng nợ luôn bằng tổng có, số dư từng tài khoản khớp với bút toán

### Quy Tắc Nghiệp Vụ Quan Trọng

**Tài khoản và quyền truy cập**:
- Không có đăng nhập: người dùng chọn tài khoản mẫu bằng dropdown, hệ thống không kiểm tra quyền; Khu Quản Trị mở cho mọi người dùng
- Một tài khoản có thể vừa mua vừa bán, nhưng không mua được tin bán của chính mình

**Phí và giá**:
- Người mua trả = giá vé × số lượng + 10% phí dịch vụ; người bán nhận = giá vé × số lượng − 5%; sàn giữ phần chênh lệch (15% giá trị vé)
- Mọi số tiền là VND số nguyên, không có phần lẻ; quy tắc làm tròn phí xem § Điểm Cần Làm Rõ

**Ký quỹ và sổ cái**:
- Mọi dòng tiền được ghi theo bút toán kép: mỗi giao dịch có tổng ghi nợ bằng tổng ghi có; bút toán đã ghi không sửa, không xoá — sai thì ghi bút toán điều chỉnh
- Mọi số dư (của người dùng và của sàn) đều tính ra từ sổ cái, không lưu số dư riêng có thể lệch
- Tiền chỉ vào sổ cái khi cổng thanh toán xác nhận thành công qua một trong ba nguồn: thông báo thanh toán từ cổng (IPN) có chữ ký hợp lệ, kết quả cổng trả về khi người mua quay lại trang kết quả (return URL) có chữ ký hợp lệ, hoặc kết quả tra cứu trực tiếp từ cổng; kết quả quay về không có chữ ký hợp lệ thì không được ghi nhận
- Cả ba nguồn dùng chung một cách ghi nhận thanh toán và mỗi giao dịch chỉ được ghi sổ đúng một lần, dù xác nhận đến từ nhiều nguồn hoặc đến nhiều lần
- Tiền bán vé của người bán nằm ở số dư đang chờ cho đến khi sự kiện được đánh dấu kết thúc; không có chi trả thật ra ngoài

**Đơn hàng và tồn kho**:
- Không bán quá số vé của tin bán: vé được giữ chỗ khi tạo đơn và trả lại nếu đơn thất bại hoặc hết hạn
- Một đơn chỉ được ghi nhận thanh toán một lần, dù cổng gửi thông báo nhiều lần

**Sự kiện**:
- Đánh dấu sự kiện kết thúc là thao tác một chiều, không đảo ngược; sau đó sự kiện ngừng bán

### Yêu Cầu Phi Chức Năng
- **Quy mô**: dữ liệu mẫu 1–2 sự kiện, ≥ 2 người bán, vài tin bán, vài người mua; không yêu cầu chịu tải
- **Hiệu năng**: thông báo thanh toán từ cổng được phản hồi trong thời hạn cổng yêu cầu (thường vài giây) để cổng không gửi lại vô hạn
- **Bảo mật & tuân thủ**: thông tin bí mật của cổng thanh toán không nằm trong repository, chỉ có file mẫu cấu hình môi trường; thông báo thanh toán phải xác thực chữ ký và đối chiếu số tiền trước khi ghi nhận
- **Nền tảng hỗ trợ**: trình duyệt trên điện thoại (màn hình rộng từ 360px) và máy tính bản mới nhất

### Phạm Vi Dự Án

**Sẽ bao gồm:**
- Dữ liệu mẫu sự kiện, người bán, tin bán, người mua
- Trang sự kiện dựng từ máy chủ, chọn vé, tạo đơn
- Tích hợp môi trường thử nghiệm của một cổng thanh toán thật: chuyển hướng, trang kết quả, xử lý thông báo thanh toán
- Sổ cái kép, ký quỹ, số dư đang chờ / khả dụng
- Đánh dấu sự kiện kết thúc và giải phóng ký quỹ
- Bàn giao: repository Git chia sẻ cho tài khoản GitHub `syn-mcj`; file mẫu cấu hình môi trường; thông tin sandbox gửi riêng, không commit
- README gồm: cách chạy (kể cả cách thông báo thanh toán từ cổng tới được máy local); cổng thanh toán đã chọn và lý do; các quyết định ở chỗ brief không nói; phần chưa sẵn sàng cho production và bước tiếp theo (trong đó có việc bảo vệ Khu Quản Trị bằng đăng nhập và phân quyền); cách dùng AI và tổng thời gian làm

**Sẽ không bao gồm:**
- Đăng nhập / xác thực người dùng
- Chi trả tiền thật cho người bán, rút tiền
- Người bán tự tạo / sửa tin bán qua giao diện (dùng dữ liệu mẫu)
- Phát hành / chuyển giao vé điện tử, xác minh vé thật
- Tranh chấp, khiếu nại, huỷ đơn sau thanh toán do người dùng chủ động
- Hoá đơn, thuế, email / thông báo

**Ràng buộc**: TypeScript; framework React có dựng trang từ máy chủ (Next.js hoặc tương đương); backend Node.js; PostgreSQL; toàn bộ hệ thống khởi động bằng `docker compose up`, cộng thêm thành phần cần thiết để nhận thông báo thanh toán từ cổng về máy local; dùng môi trường sandbox của một cổng thanh toán thật do ứng viên tự chọn và giải thích; tiền tệ VND.

### Phase Sau
- Đăng nhập và phân quyền thật
- Chi trả cho người bán qua ngân hàng / ví
- Hoàn tiền tự động qua cổng thanh toán
- Người bán tự đăng tin bán, quản lý tin
- Chuyển giao vé điện tử và xác nhận người mua đã nhận vé

### Đề Xuất Thêm
- Đối soát định kỳ đơn đang chờ: hệ thống tự tra cứu trạng thái các đơn chờ quá lâu từ cổng thanh toán — bù cho trường hợp thông báo thanh toán bị mất, nhất là khi chạy local qua tunnel
- Trang kiểm tra cân đối sổ cái trong Khu Quản Trị: hiển thị tổng nợ = tổng có và đối chiếu tổng tiền nhận từ cổng với tổng số dư các tài khoản — giúp người chấm thấy ngay tính đúng của sổ cái
- Kiểm thử tự động cho phần tiền: cộng phí, ghi nhận trùng thông báo, thanh toán đến sau khi hết hạn, giải phóng ký quỹ — đây là phần được đánh giá kỹ nhất
- Nhật ký thông báo thanh toán thô nhận từ cổng (kể cả bị từ chối) để truy vết khi có sai lệch

### Điểm Cần Làm Rõ
- Chọn cổng thanh toán nào? Ứng viên phù hợp với người dùng Việt Nam và VND: VNPay sandbox, MoMo test, PayOS. Đề xuất mặc định: VNPay sandbox — có thẻ test công khai, hỗ trợ cả đường quay về và thông báo IPN có chữ ký, có API tra cứu giao dịch, phổ biến tại Việt Nam; lựa chọn và lý do cuối cùng ghi trong README.
- Thông báo thanh toán từ cổng tới máy local bằng cách nào? Đề xuất mặc định: thêm một dịch vụ tunnel công khai chạy cùng lúc với `docker compose up`, địa chỉ công khai cấu hình qua file môi trường; README hướng dẫn từng bước.
- Giữ chỗ vé khi chờ thanh toán bao lâu? Đề xuất mặc định: giữ 15 phút, khớp thời hạn phiên thanh toán của cổng; quá hạn thì đơn chuyển "hết hạn" và trả vé lại tin bán.
- Thanh toán thành công nhưng đến sau khi đơn đã hết hạn và vé đã bán cho người khác thì xử lý thế nào? Đề xuất mặc định: vẫn ghi nhận tiền vào sổ cái, đánh dấu đơn "cần hoàn tiền" và ghi khoản phải trả lại người mua (hiện ở số dư khả dụng của người mua); nếu còn đủ vé thì xác nhận đơn bình thường. Hoàn tiền thật qua cổng để phase sau.
- Trường hợp người mua quay về trang kết quả trước khi thông báo thanh toán tới (hoặc thông báo không bao giờ tới)? Đề xuất mặc định: nếu kết quả cổng trả về khi quay lại có chữ ký hợp lệ thì hệ thống ghi nhận ngay và trang hiển thị kết quả đó; nếu không có hoặc chữ ký không hợp lệ thì trang hiển thị "đang chờ xác nhận" và tự cập nhật, quá vài giây vẫn chưa có thông báo thì hệ thống chủ động tra cứu trạng thái từ cổng. Trường hợp thông báo tới trước khi người mua quay về thì trang hiển thị ngay kết quả đã ghi nhận.
- Thông báo thanh toán hoặc kết quả quay về trùng lặp, sai chữ ký hoặc sai số tiền? Đề xuất mặc định: trùng (kể cả giao dịch đã được ghi nhận qua nguồn khác) → trả lời thành công cho cổng nhưng không ghi sổ lại; thông báo thanh toán hoặc kết quả quay về sai chữ ký hay số tiền không khớp → từ chối, không ghi sổ, không đổi trạng thái đơn, ghi nhật ký.
- Làm tròn phí VND thế nào? Đề xuất mặc định: tính phí trên tổng giá trị dòng (giá vé × số lượng), làm tròn xuống tới đồng; phần lẻ do làm tròn thuộc về sàn để tổng luôn cân.
- Phí sàn được ghi nhận là doanh thu lúc nào? Đề xuất mặc định: tại thời điểm thanh toán chỉ ghi vào tài khoản ký quỹ; khi sự kiện kết thúc mới tách thành doanh thu sàn và số dư khả dụng người bán (để nếu sự kiện bị huỷ thì hoàn được toàn bộ cho người mua).
- "Số dư đang chờ và khả dụng của người dùng" áp dụng cho ai? Đề xuất mặc định: hiển thị cho mọi người dùng; với người bán là tiền bán vé, với người mua chủ yếu bằng 0 trừ khoản cần hoàn tiền.
- Đánh dấu sự kiện kết thúc khi còn đơn đang chờ thanh toán thì xử lý thế nào? Đề xuất mặc định: thao tác không đảo ngược; đơn chờ thanh toán của sự kiện đó bị chuyển hết hạn; nếu tiền về muộn thì xử lý như trường hợp thanh toán đến sau khi đơn hết hạn ở trên (đánh dấu "cần hoàn tiền").
- Sự kiện bị huỷ (không diễn ra) có cần hỗ trợ hoàn tiền từ ký quỹ không? Đề xuất mặc định: không làm trong bài test, ghi vào README là bước tiếp theo.
