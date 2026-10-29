import { QueryClient } from '@tanstack/react-query';

// Không có phiên đăng nhập → không có nhánh "phiên chết" của skill; lỗi hiển thị tại chỗ + nút "Thử lại"
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Số vé / tạm tính đổi liên tục: không giữ lâu, không tự thử lại (người dùng bấm "Thử lại")
      queries: { staleTime: 0, gcTime: 60_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
