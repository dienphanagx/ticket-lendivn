import type { ConsoleMessage, Page } from '@playwright/test';

// Lỗi tài nguyên 404 / 503 được chủ ý (vd đơn của tài khoản khác → 404) không tính là lỗi JS
const INTENDED_RESOURCE_ERROR =
  /Failed to load resource: the server responded with a status of (404|503)\b/;
const CSP_VIOLATION = /Content Security Policy|Refused to (?:apply|execute|load|connect|evaluate)/i;

export interface BrowserErrors {
  /** Lỗi JS: `pageerror` + `console.error` không thuộc nhóm được phép */
  js: string[];
  /** Mọi thông điệp console mang dấu hiệu vi phạm CSP (không có ngoại lệ) */
  csp: string[];
  /** Lỗi tài nguyên 404 / 503 đã bỏ qua, giữ lại để báo cáo */
  ignored: string[];
}

/** Thu lỗi console + pageerror của `page` từ lúc gọi; đọc kết quả qua object trả về */
export function collectBrowserErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { js: [], csp: [], ignored: [] };
  page.on('pageerror', (error) => errors.js.push(`pageerror: ${error.message}`));
  page.on('console', (message: ConsoleMessage) => {
    const text = message.text();
    if (CSP_VIOLATION.test(text)) errors.csp.push(text);
    if (message.type() !== 'error') return;
    if (INTENDED_RESOURCE_ERROR.test(text)) errors.ignored.push(text);
    else errors.js.push(`console.error: ${text}`);
  });
  return errors;
}
