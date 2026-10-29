import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { connection } from 'next/server';

import { SiteHeader } from '@/components/layout/site-header';
import { AccountMenuProvider } from '@/components/providers/account-menu-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { StyleNonce } from '@/components/providers/style-nonce';
import { APP_NAME } from '@/constants/messages';
import { getRequestNonce } from '@/lib/request-nonce';

import './globals.css';

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Ép mọi trang render mỗi request: CSP nonce sinh mỗi request (src/proxy.ts), HTML static không mang nonce
  // → script bị CSP chặn; dữ liệu (số vé, số dư) cũng không được cache (specs/architecture.md § Routes)
  await connection();
  const nonce = await getRequestNonce();
  return (
    <html lang="vi" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <StyleNonce nonce={nonce} />
        <QueryProvider>
          <AccountMenuProvider>
            <SiteHeader />
            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6">
              {children}
            </main>
          </AccountMenuProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
