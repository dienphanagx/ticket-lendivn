'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Icon } from '@/components/custom/icon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TICKET_MESSAGES, UI_MESSAGES } from '@/constants/messages';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query';

const TITLE_ID = 'ticket-sheet-title';

interface TicketSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Khu chọn vé: bottom sheet dưới 768px, khối cố định bên cạnh trên desktop (spec web § C) */
export function TicketSheet({ open, onClose, children }: TicketSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Nút "Chọn" đã mở sheet: sheet mở bằng state (không qua SheetTrigger) nên Radix không tự trả focus
  const opener = useRef<HTMLElement | null>(null);

  // Esc đóng khối desktop; Sheet (Radix Dialog) tự xử lý Esc / chạm nền
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Lớp khác (DropdownMenu của Radix) đã xử lý Esc → preventDefault; không đóng khu chọn theo
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isDesktop, onClose]);

  return (
    <>
      {/* Luôn có khung ở desktop (CSS) để không nhảy bố cục sau hydrate; nội dung chỉ khi đã biết là desktop */}
      <aside
        aria-labelledby={TITLE_ID}
        className="hidden self-start rounded-xl border p-4 md:sticky md:top-4 md:flex md:flex-col md:gap-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id={TITLE_ID} className="font-semibold">
            {TICKET_MESSAGES.PANEL_TITLE}
          </h2>
          {open && isDesktop && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={UI_MESSAGES.CLOSE}
              onClick={onClose}
            >
              <Icon name="x" />
            </Button>
          )}
        </div>
        {open && isDesktop ? (
          children
        ) : (
          <p className="text-sm text-muted-foreground">{TICKET_MESSAGES.PANEL_HINT}</p>
        )}
      </aside>
      {!isDesktop && (
        // Radix Dialog thay vaul: vaul tự chèn <style> không nonce, bị CSP chặn (src/lib/csp.ts)
        <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            className="max-h-[85dvh] gap-0 rounded-t-xl"
            onOpenAutoFocus={() => {
              opener.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
            }}
            onCloseAutoFocus={(e) => {
              if (!opener.current?.isConnected) return;
              e.preventDefault();
              opener.current.focus();
            }}
          >
            <SheetHeader className="flex-row items-center justify-between">
              <SheetTitle>{TICKET_MESSAGES.PANEL_TITLE}</SheetTitle>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={UI_MESSAGES.CLOSE}>
                  <Icon name="x" />
                </Button>
              </SheetClose>
            </SheetHeader>
            <div className="overflow-y-auto px-4 pb-6">{children}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
