import { Skeleton } from '@/components/ui/skeleton';
import { UI_MESSAGES } from '@/constants/messages';

const PLACEHOLDER_ROWS = 3;

/** Khung chờ đúng vị trí danh sách đơn (spec web § Quy Tắc Chung) */
export function OrderListSkeleton() {
  return (
    <ul aria-busy="true" aria-label={UI_MESSAGES.LOADING} className="flex flex-col gap-3">
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
        <li key={i} className="flex flex-col gap-2 rounded-xl border p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-16 w-full" />
        </li>
      ))}
    </ul>
  );
}
