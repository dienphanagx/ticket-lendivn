import { Button } from '@/components/ui/button';
import { TICKET_MESSAGES } from '@/constants/messages';

const ERROR_ID = 'checkout-error';

interface CheckoutActionProps {
  /** Chưa có tổng của đúng số lượng đang nhập (đang tính, lỗi, số lượng sai) */
  disabled: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
}

/**
 * Nút "Thanh toán" (spec web § C Xác Nhận Thanh Toán): đang gửi → "Đang tạo đơn…" + khoá.
 * Spec ghi rõ nhãn lúc bận nên không dùng mẫu giữ nhãn của Button loading.
 */
export function CheckoutAction({ disabled, pending, error, onSubmit }: CheckoutActionProps) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="w-full"
        disabled={disabled || pending}
        aria-busy={pending}
        aria-describedby={error ? ERROR_ID : undefined}
        onClick={onSubmit}
      >
        {pending ? TICKET_MESSAGES.CHECKOUT_PENDING : TICKET_MESSAGES.CHECKOUT}
      </Button>
      {error && (
        <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
