import Link from 'next/link';

import { UI_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{UI_MESSAGES.NOT_FOUND_TITLE}</h1>
      <Link href={ROUTES.HOME} className="flex min-h-11 items-center underline">
        {UI_MESSAGES.BACK_HOME}
      </Link>
    </div>
  );
}
