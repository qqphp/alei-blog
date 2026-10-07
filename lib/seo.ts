import type { Metadata } from 'next';
import { getPublicContent } from './cms-server';
import type { PublicContent } from './cms-defaults';
import { seoEnvironment } from './seo-environment.mjs';
import { brandedTitle } from './seo-text';

export const publicPages = {
  '/': ['首页', ''],
  '/writing': ['写作', '分享实践中的经验、方法与观察，记录值得继续探讨的问题。'],
  '/projects': ['项目', '产品原型、设计探索与个人工具，记录构思、实现与迭代。'],
  '/notes': ['说说', '记录日常见闻、片刻想法与生活中的小事。'],
  '/ai': ['AI 资源', '整理智能体、技能与模型服务，记录人工智能工具的使用实践。'],
  '/investing': ['投资', '记录投资研究、阅读笔记与长期观察。'],
  '/about': ['关于', '个人介绍、正在关注的方向与联系入口。'],
  '/bookmarks': ['书签', '整理值得反复访问的网站与实用资源。'],
  '/friends': ['友链', '发现朋友的网站和独立创作者的记录。'],
  '/books': ['阅读', '阅读记录、主题书单与书籍笔记。'],
  '/music': ['音乐', '收藏喜欢的音乐与主题歌单。'],
  '/films': ['观影', '记录看过的电影与观影感受。'],
  '/podcasts': ['播客', '收藏值得收听的播客节目与专辑。'],
  '/travel': ['旅行', '记录旅行目的地、沿途见闻与风景。'],
  '/hobbies': ['爱好', '记录日常爱好、活动与持续探索。'],
} as const;

export function absoluteUrl(path: string) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const { siteUrl } = seoEnvironment();
  return siteUrl ? new URL(path, `${siteUrl}/`).href : undefined;
}

export function pageMetadata(site: PublicContent['site'], input: {
  title: string; description: string; path: string; fullTitle?: boolean;
  noindex?: boolean; image?: string; imageAlt?: string; article?: boolean;
}): Metadata {
  const title = input.fullTitle ? input.title : brandedTitle(input.title, site.name);
  const url = absoluteUrl(input.path);
  const image = absoluteUrl(input.image || site.defaultShareImage);
  const alt = input.image ? input.imageAlt : site.defaultShareImageAlt;
  const images = image ? [{ url: image, ...(alt ? { alt } : {}) }] : [];
  return {
    title: { absolute: title }, description: input.description,
    alternates: url ? { canonical: url } : undefined,
    robots: { index: seoEnvironment().indexable && !input.noindex, follow: true },
    openGraph: { title, description: input.description, url, siteName: site.name,
      locale: 'zh_CN', type: input.article ? 'article' : 'website', images },
    twitter: { card: image ? 'summary_large_image' : 'summary', title,
      description: input.description, images: image ? [{ url: image, ...(alt ? { alt } : {}) }] : [] },
  };
}

export async function columnMetadata(path: keyof typeof publicPages, options: { path?: string; noindex?: boolean; page?: number } = {}) {
  const { site } = await getPublicContent(['site']);
  const [label, description] = publicPages[path];
  return pageMetadata(site, { title: path === '/' ? site.title : `${label}${options.page && options.page > 1 ? ` · 第 ${options.page} 页` : ''}`,
    description: path === '/' ? site.description : description, path: options.path ?? path,
    fullTitle: path === '/', noindex: options.noindex });
}

export function breadcrumbData(items: { name: string; path: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement:
    items.map((item, index) => ({ '@type': 'ListItem', position: index + 1,
      name: item.name, ...(absoluteUrl(item.path) ? { item: absoluteUrl(item.path) } : {}) })) };
}
