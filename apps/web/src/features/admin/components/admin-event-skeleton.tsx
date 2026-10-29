import { Skeleton } from '@/components/ui/skeleton';
import { UI_MESSAGES } from '@/constants/messages';

const PLACEHOLDER_ROWS = 2;

/** Khung chờ đúng vị trí danh sách sự kiện ở trang Quản trị */
export function AdminEventSkeleton() {
  return (
    <ul aria-busy="true" aria-label={UI_MESSAGES.LOADING} className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
        <li key={i} className="flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-11 w-40" />
        </li>
      ))}
    </ul>
  );
}
