// Định dạng theo specs/functional-spec/web.md § Quy Tắc Chung; chạy giống nhau ở server và trình duyệt

const VND_SUFFIX = '₫';
const MINUS_SIGN = '−'; // "−", không dùng gạch nối "-"
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** VND số nguyên: `1250000` → `1.250.000 ₫`, `-5000` → `−5.000 ₫` */
export function formatVnd(amount: number): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError(`Invalid VND amount: ${amount}`);
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? MINUS_SIGN : ''}${digits} ${VND_SUFFIX}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dateParts(iso: string): Record<string, string> {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${iso}`);
  return Object.fromEntries(
    dateTimeFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

/** ISO 8601 → `dd/MM/yyyy HH:mm` giờ Asia/Ho_Chi_Minh */
export function formatDateTime(iso: string): string {
  const parts = dateParts(iso);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** ISO 8601 → `HH:mm` giờ Asia/Ho_Chi_Minh ("Giữ vé đến {HH:mm}") */
export function formatTime(iso: string): string {
  const parts = dateParts(iso);
  return `${parts.hour}:${parts.minute}`;
}
