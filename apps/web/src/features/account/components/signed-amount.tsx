import { cn } from 'cn';

import { BALANCE_MESSAGES } from '@/constants/messages';
import { formatSignedVnd } from '@/lib/format';

interface SignedAmountProps {
  amount: number;
  className?: string;
}

/** Số tiền bút toán có dấu (+ tăng, − giảm); màu chỉ bổ trợ — dấu + nhãn cho trình đọc màn hình mang nghĩa */
export function SignedAmount({ amount, className }: SignedAmountProps) {
  const increase = amount >= 0;
  return (
    <span
      className={cn(
        'font-semibold whitespace-nowrap tabular-nums',
        increase ? 'text-foreground' : 'text-destructive',
        className,
      )}
    >
      <span className="sr-only">
        {increase ? BALANCE_MESSAGES.INCREASE : BALANCE_MESSAGES.DECREASE}{' '}
      </span>
      {formatSignedVnd(amount)}
    </span>
  );
}
