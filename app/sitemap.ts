import type { MetadataRoute } from 'next';
import { seoEnvironment } from '@/lib/seo-environment.mjs';
import { publicPages } from '@/lib/seo';
import { defaults } from '@/lib/cms-defaults';
import { withReadDatabase } from '@/lib/postgres';
import { contentPageSizes } from '@/lib/content-page-sizes';
import { listUrl } from '@/lib/seo-text';

export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { siteUrl, indexable } = seoEnvironment();
  if (!indexable) return [];
  const { articles, projects } = await withReadDatabase(async (db) => {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const saved = new Set((await db.query<{ section: string }>("SELECT section FROM cms_sections WHERE section IN ('writing','projects')")).rows.map((row) => row.section));
      const articles = saved.has('writing')
        ? (await db.query<{ slug: string; updatedAt: Date }>('SELECT slug,updated_at AS "updatedAt" FROM articles WHERE published ORDER BY slug')).rows
        : defaults.writing.filter((item) => item._published).map((item) => ({ slug: item.slug, updatedAt: undefined }));
      const projects = saved.has('projects')
        ? (await db.query<{ id: string; updatedAt: Date }>("SELECT id,updated_at AS \"updatedAt\" FROM cms_entries WHERE section='projects' AND collection='items' AND published ORDER BY id")).rows
        : defaults.projects.items.filter((item) => item._published).map((item) => ({ id: item.id, updatedAt: undefined }));
      await db.query('COMMIT');
      return { articles, projects };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  });
  const urls: MetadataRoute.Sitemap = Object.keys(publicPages).map((path) => ({ url: new URL(path, siteUrl).href }));
  for (const [path, count, size] of [['/writing', articles.length, contentPageSizes.writing], ['/projects', projects.length, contentPageSizes.projects]] as const)
    for (let page = 2; page <= Math.ceil(count / size); page++) urls.push({ url: new URL(listUrl(path, { page }), siteUrl).href });
  for (const article of articles) urls.push({ url: new URL(`/writing/${article.slug}`, siteUrl).href,
    ...(article.updatedAt ? { lastModified: article.updatedAt.toISOString() } : {}) });
  for (const project of projects) urls.push({ url: new URL(listUrl('/projects', { project: project.id }), siteUrl).href,
    ...(project.updatedAt ? { lastModified: project.updatedAt.toISOString() } : {}) });
  return urls;
}
