import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import { unified } from 'unified';
import { getPublicArticle, getPublicContent } from '@/lib/cms-server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

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
  const [{ site }, article] = await Promise.all([
    getPublicContent(['site']), getPublicArticle(slug),
  ]);
  if (!article) notFound();
  const headings = articleHeadings(article.body);
  return (
    <main className="site-shell">
      <SiteHeader />
      <article className="article-layout">
        <section>
          <Link className="article-category" href="/writing">
            <span>← 返回写作</span>
            <b>{article.category}</b>
          </Link>
          <h1>{article.title}</h1>
          <p className="article-lead">{article.excerpt}</p>
          <div className="article-meta">
            {site.name} · {article.date}
          </div>
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ node, children }) => (
                  <h2 id={`heading-${node?.position?.start.line}`}>
                    {children}
                  </h2>
                ),
              }}
            >
              {article.body}
            </ReactMarkdown>
          </div>
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
