import 'server-only';

import { headers } from 'next/headers';

import { NONCE_HEADER } from '@/lib/csp';

/** Nonce CSP của request hiện tại, do src/proxy.ts sinh và gắn vào header request */
export async function getRequestNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_HEADER) ?? undefined;
}
