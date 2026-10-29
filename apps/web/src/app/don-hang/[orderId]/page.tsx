import type { Metadata } from 'next';
import { notFound, redirect, RedirectType } from 'next/navigation';

import { AccountRequired } from '@/components/common/account-required';
import { ORDER_MESSAGES } from '@/constants/messages';
import { ROUTES } from '@/constants/routes';
import { OrderResult } from '@/features/orders/components/order-result';
import { forwardVnpayReturnIfAny, loadOrderResult } from '@/features/orders/loaders';
import { isOrderId } from '@/features/orders/types';
import { getCurrentUserId } from '@/lib/current-user';

export const metadata: Metadata = { title: ORDER_MESSAGES.RESULT_TITLE };

// Trang kết quả, cũng là `vnp_ReturnUrl` (specs/architecture.md § Routes › apps/web).
// Không có loading.tsx: nạp + notFound() trước khi stream để 404 giữ đúng status
export default async function OrderResultPage({
  params,
  searchParams,
}: PageProps<'/don-hang/[orderId]'>) {
  const { orderId } = await params;
  // Sai dạng → 404, không gọi api (kể cả khi có tham số vnp_*)
  if (!isOrderId(orderId)) notFound();
  // Chuyển tiếp xong (thành công hay bị từ chối) mới redirect, nên lần dựng sau thấy ngay kết quả
  if (await forwardVnpayReturnIfAny(orderId, await searchParams)) {
    redirect(ROUTES.ORDER(orderId), RedirectType.replace);
  }
  const currentUserId = await getCurrentUserId();
  if (!currentUserId) return <AccountRequired />;
  const result = await loadOrderResult(orderId, currentUserId);
  if (!result) notFound();
  return (
    <OrderResult
      initialOrder={result.order}
      currentUserId={currentUserId}
      eventHref={result.eventHref}
    />
  );
}
