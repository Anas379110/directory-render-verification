import type { MetadataRoute } from 'next';
import { readSiteConfig } from '../lib/site-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const site = readSiteConfig();
  if (!site.canIndex || !site.origin) return [];
  return ['/', '/about', '/contact', '/privacy', '/terms', '/register'].map((path) => ({
    url: new URL(path, site.origin).toString(),
    lastModified: new Date(),
  }));
}
