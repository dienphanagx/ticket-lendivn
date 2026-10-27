import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/site-url';

export default async function robots(): Promise<MetadataRoute.Robots> {
  // getSiteUrl() gọi connection() → APP_ENV + SITE_URL đọc tại request time, không chốt lúc build
  const baseUrl = (await getSiteUrl()).origin;
  if (process.env.APP_ENV !== 'production') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/bff/', '/quan-tri/'] }],
    host: baseUrl,
  };
}
