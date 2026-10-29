import { Skeleton } from '@/components/ui/skeleton';
import { UI_MESSAGES } from '@/constants/messages';

const PLACEHOLDER_ROWS = 4;

/** Khung chờ đúng vị trí hai ô số dư + lịch sử bút toán (spec web § Quy Tắc Chung) */
export function BalanceSkeleton() {
  return (
    <div aria-busy="true" aria-label={UI_MESSAGES.LOADING} className="flex flex-col gap-6">
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
