import type { MetadataRoute } from 'next';
import { seoEnvironment } from '@/lib/seo-environment.mjs';

export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  const { siteUrl, indexable } = seoEnvironment();
  return { rules: { userAgent: '*', allow: ['/', '/api/media/'], disallow: ['/api/'] },
    ...(indexable ? { sitemap: `${siteUrl}/sitemap.xml` } : {}) };
}
