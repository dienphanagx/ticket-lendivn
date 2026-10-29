import { Skeleton } from '@/components/ui/skeleton';
import { UI_MESSAGES } from '@/constants/messages';

const PLACEHOLDER_ROWS = 5;

/** Khung chờ đúng vị trí ô tổng + bảng tài khoản + danh sách giao dịch của trang Sổ cái */
export function LedgerSkeleton() {
  return (
    <div aria-busy="true" aria-label={UI_MESSAGES.LOADING} className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
