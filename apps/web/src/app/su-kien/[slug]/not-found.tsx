import Link from 'next/link';

import { EVENT_MESSAGES, UI_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';

// Slug sai dạng hoặc sự kiện không tồn tại (spec web § B Xem Trang Sự Kiện)
export default function EventNotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{EVENT_MESSAGES.NOT_FOUND}</h1>
      <Link
        href={ROUTES.HOME}
        className="flex min-h-11 items-center rounded-md underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {UI_MESSAGES.BACK_HOME}
      </Link>
    </div>
  );
}
