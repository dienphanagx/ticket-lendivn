'use client';

import { Button } from '@/components/ui/button';
import { UI_MESSAGES } from '@/constants/messages';

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// Lỗi khi dựng trang: trang lỗi chung, giữ nguyên URL, nút "Thử lại" fetch lại segment
export default function ErrorPage({ retry }: ErrorPageProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p>{UI_MESSAGES.ERROR_DESCRIPTION}</p>
      <Button type="button" variant="outline" onClick={retry}>
        {UI_MESSAGES.RETRY}
      </Button>
    </div>
  );
}
