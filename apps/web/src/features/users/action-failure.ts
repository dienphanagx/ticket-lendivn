// Lời gọi action reject (không có kết quả): bắt tại chỗ để lỗi không lên error boundary của
// root layout (sập cả trang, mất header). fetch reject = TypeError → mất mạng; còn lại → lỗi chung
export const actionFailure = (err: unknown) => ({
  success: false as const,
  code: err instanceof TypeError ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
  message: err instanceof Error ? err.message : 'Server Action rejected',
});
