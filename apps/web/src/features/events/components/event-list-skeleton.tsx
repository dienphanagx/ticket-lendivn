import { Skeleton } from '@/components/ui/skeleton';
import { UI_MESSAGES } from '@/constants/messages';

const PLACEHOLDER_CARDS = 3;

/** Khung chờ đúng vị trí lưới thẻ sự kiện */
export function EventListSkeleton() {
  return (
    <ul
      aria-busy="true"
      aria-label={UI_MESSAGES.LOADING}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: PLACEHOLDER_CARDS }, (_, i) => (
        <li key={i} className="flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-5 w-full" />
        </li>
      ))}
    </ul>
  );
}
