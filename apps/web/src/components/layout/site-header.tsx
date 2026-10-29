import { Suspense } from 'react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { APP_NAME, NAV_LABELS, UI_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { AccountSwitcherLoader } from '@/features/users/components/account-switcher-loader';

const NAV_ITEMS = [
  { href: ROUTES.HOME, label: NAV_LABELS.EVENTS },
  { href: ROUTES.ORDERS, label: NAV_LABELS.ORDERS },
  { href: ROUTES.ACCOUNT, label: NAV_LABELS.ACCOUNT },
  { href: ROUTES.ADMIN, label: NAV_LABELS.ADMIN },
] as const;

const LINK_FOCUS = 'rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

// Thanh đầu trang (specs/functional-spec/web.md § Quy Tắc Chung): dropdown tài khoản (§A) + điều hướng
export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1">
        <Link
          href={ROUTES.HOME}
          className={`flex min-h-11 items-center font-semibold ${LINK_FOCUS}`}
        >
          {APP_NAME}
        </Link>
        <div className="flex min-w-0 items-center sm:order-last">
          <Suspense fallback={<Skeleton className="h-11 w-36" />}>
            <AccountSwitcherLoader />
          </Suspense>
        </div>
        <nav
          aria-label={UI_MESSAGES.MAIN_NAV}
          className="-mx-2 w-full overflow-x-auto sm:mx-0 sm:mr-auto sm:w-auto"
        >
          <ul className="flex">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-11 items-center px-2 text-sm text-muted-foreground hover:text-foreground ${LINK_FOCUS}`}
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
