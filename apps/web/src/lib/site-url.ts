import 'server-only';

import { connection } from 'next/server';

export async function getSiteUrl(): Promise<URL> {
  await connection(); // ép đọc env tại request time, không đóng băng lúc build
  const raw = process.env.SITE_URL;
  if (!raw) throw new Error('SITE_URL is not set');
  return new URL(raw);
}
