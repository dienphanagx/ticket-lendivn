// Điều hướng top-level sang site khác (trang thanh toán VNPay); tách module để test thay được
export function assignLocation(url: string): void {
  window.location.assign(url);
}
