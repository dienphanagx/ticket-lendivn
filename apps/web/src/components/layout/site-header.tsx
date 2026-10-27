import Link from 'next/link';

import { APP_NAME, NAV_LABELS, UI_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';

const NAV_ITEMS = [
  { href: ROUTES.HOME, label: NAV_LABELS.EVENTS },
  { href: ROUTES.ORDERS, label: NAV_LABELS.ORDERS },
  { href: ROUTES.ACCOUNT, label: NAV_LABELS.ACCOUNT },
  { href: ROUTES.ADMIN, label: NAV_LABELS.ADMIN },
] as const;

// Khung thanh đầu trang (specs/functional-spec/web.md § Quy Tắc Chung); dropdown chọn tài khoản thêm ở feature §A
export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4">
        <Link href={ROUTES.HOME} className="flex min-h-11 items-center font-semibold">
          {APP_NAME}
        </Link>
        <nav aria-label={UI_MESSAGES.MAIN_NAV} className="-mx-2 w-full overflow-x-auto sm:w-auto">
          <ul className="flex">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
