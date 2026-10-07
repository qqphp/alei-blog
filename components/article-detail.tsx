import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarkdownContent } from './markdown-content';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import { unified } from 'unified';
import { getPublicArticle, getPublicContent } from '@/lib/cms-server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { pageMetadata, absoluteUrl, breadcrumbData } from '@/lib/seo';
import { articleDescription } from '@/lib/seo-text';
import { JsonLd } from './json-ld';
import { Breadcrumbs } from './breadcrumbs';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ site }, article] = await Promise.all([getPublicContent(['site']), getPublicArticle(slug)]);
  if (!article) notFound();
  return pageMetadata(site, { title: article.seoTitle.trim() ? article.seoTitle : article.title,
    description: articleDescription(article), path: `/writing/${article.slug}`, article: true,
    image: article.cover, imageAlt: article.coverDescription });
}

export function articleHeadings(body: string) {
  const headings: { id: string; text: string }[] = [];
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body);
  visit(tree, 'heading', (node) => {
    if (node.depth === 2 && node.position)
      headings.push({ id: `heading-${node.position.start.line}`, text: toString(node) });
  });
  return headings;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ profile }, article] = await Promise.all([
    getPublicContent(['profile']), getPublicArticle(slug),
  ]);
  if (!article) notFound();
  const headings = articleHeadings(article.body);
  const path = `/writing/${article.slug}`;
  const crumbs = [{ name: '首页', path: '/' }, { name: '写作', path: '/writing' }, { name: article.title, path }];
  return (
    <main className="site-shell">
      <SiteHeader />
      <JsonLd value={breadcrumbData(crumbs)} />
      <JsonLd value={{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title,
        description: articleDescription(article), url: absoluteUrl(path), mainEntityOfPage: absoluteUrl(path),
        author: { '@type': 'Person', name: profile.name, url: absoluteUrl('/about') },
        ...(article.createdAt ? { dateCreated: article.createdAt } : {}),
        ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
        ...(absoluteUrl(article.cover) ? { image: absoluteUrl(article.cover) } : {}),
      }} />
      <article className="article-layout">
        <section>
          <Breadcrumbs items={crumbs} />
          <Link className="article-category" href="/writing">
            <span>← 返回写作</span>
            <b>{article.category}</b>
          </Link>
          <h1>{article.title}</h1>
          <p className="article-lead">{article.excerpt}</p>
          <div className="article-meta">
            <Link href="/about">{profile.name}</Link> · {article.date}
          </div>
          <MarkdownContent source={article.body} />
        </section>
        <aside className="article-toc">
          <p>文章目录</p>
          <span>CONTENTS / {String(headings.length).padStart(2, '0')}</span>
          {headings.map((heading, i) => (
            <a key={heading.id} href={`#${heading.id}`}>
              <b>{String(i + 1).padStart(2, '0')}</b>
              {heading.text}
            </a>
          ))}
        </aside>
      </article>
      <SiteFooter />
    </main>
  );
}
