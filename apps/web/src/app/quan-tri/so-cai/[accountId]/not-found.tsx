import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { LEDGER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';

// Mã sai dạng hoặc api 404 LEDGER_ACCOUNT_NOT_FOUND (spec web § E Xem Sổ Cái → Trường hợp ngoại lệ)
export default function LedgerAccountNotFound() {
  return (
    <div role="status" className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{LEDGER_MESSAGES.NOT_FOUND}</h1>
      <Button asChild variant="outline">
        <Link href={ROUTES.LEDGER}>{LEDGER_MESSAGES.BACK_TO_LEDGER}</Link>
      </Button>
    </div>
  );
}
