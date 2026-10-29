import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { NAV_LABELS, ORDER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';

/** 1 câu duy nhất cho mọi nguyên nhân (sai dạng, không tồn tại, không do tài khoản đang chọn mua) */
export function OrderNotFound() {
  return (
    <div role="status" className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{ORDER_MESSAGES.NOT_FOUND}</h1>
      <Button asChild variant="outline">
        <Link href={ROUTES.ORDERS}>{NAV_LABELS.ORDERS}</Link>
      </Button>
    </div>
  );
}
