import type { MetadataRoute } from 'next';
import { readSiteConfig } from '../lib/site-config';

export default function robots(): MetadataRoute.Robots {
  const site = readSiteConfig();
  if (!site.canIndex || !site.origin) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin/', '/api/'] },
    sitemap: new URL('/sitemap.xml', site.origin).toString(),
  };
}
