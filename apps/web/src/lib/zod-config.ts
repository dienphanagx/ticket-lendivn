// Cấu hình Zod dùng chung (zod classic + zod/mini chung 1 globalConfig của zod/v4/core).
// jitless: Zod dò JIT bằng `new Function("")` lúc tạo `z.object` đầu tiên; CSP không có 'unsafe-eval'
// (src/lib/csp.ts) nên trình duyệt ghi 1 vi phạm `script-src` dù lỗi đã bị bắt. Bật jitless thì Zod bỏ
// bước dò (zod/v4/core/util.js `allowsEval`). Module schema import file này trước khi gọi `z.object`.
import { config } from 'zod/v4/core';

config({ jitless: true });
