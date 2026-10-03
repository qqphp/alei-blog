'use client';
import { contentPageSizes } from '@/lib/content-page-sizes';

import { WritingCategoryTree } from '@/components/writing-category-tree';
import {
  ContentPagination,
} from '@/components/content-pagination';

import Image from 'next/image';
import Link from 'next/link';
import { categoryRows } from '@/lib/article-categories';
import type { WritingArchive } from '@/lib/cms-server';
import type { Content } from '@/lib/cms-defaults';
import { useEffect, useRef, useState } from 'react';

import { PageIntro, SiteFooter, SiteHeader } from '@/components/site-chrome';
import { Input } from '@/components/ui/input';
import '@/components/writing-archive.css';

export default function WritingPage({ initial }: { initial: WritingArchive & { categories: Content['categories'] } }) {
  const { categories } = initial;
  const rows = categoryRows(categories);
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [archive, setArchive] = useState<WritingArchive>(initial);
  const [error, setError] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, group, page: String(page) });
        const response = await fetch(`/api/writing?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('查询失败，请稍后重试。');
        const result = await response.json() as WritingArchive;
        const currentPage = result.page ?? Math.min(page, Math.max(1, Math.ceil(result.total / contentPageSizes.writing)));
        setArchive(result);
        if (currentPage !== page) setPage(currentPage);
        setError('');
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '查询失败');
      }
    }, query ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, group, page]);
  return (
    <main className="site-shell">
      <SiteHeader />
      <PageIntro
        title="记录思考，分享实践。"
        text="分享实践中的经验、方法与观察，也记录那些值得继续探讨的问题。"
      />
      <section className="writing-tools">
        <div className="writing-search">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="输入即搜索文章、主题或关键词"
            aria-label="搜索文章"
          />
        </div>
        <span>
          共 {archive.total}
          {" 篇结果"}
        </span>
      </section>
      <section className="archive-layout writing-archive">
        <aside className="archive-side">
          <p>
            {"文章分类"}
          </p>
          <button
            className={group === '' ? 'active' : ''}
            type="button"
            onClick={() => {
              setGroup('');
              setPage(1);
            }}
          >
            {"全部文章"}
            <b>{archive.allCount}</b>
          </button>
          <WritingCategoryTree
            categories={categories}
            counts={archive.categoryCounts}
            selected={group}
            onSelect={(categoryId) => {
              setGroup(categoryId);
              setPage(1);
            }}
          />
        </aside>
        <div className="archive-main" id="all">
          <div className="archive-toolbar">
            <span>
              {rows.find((row) => row.category.id === group)?.path ||
                '全部文章'}
            </span>
            <span>
              {"按创建时间"}
            </span>
          </div>
          {archive.items.map((entry) => (
            <article className="writing-list-item" key={entry.slug}>
              <Link
                className="writing-list-cover"
                href={`/writing/${entry.slug}`}
                aria-label={`阅读：${entry.title}`}
              >
                {entry.cover && (
                  <Image
                    src={entry.cover}
                    width={600}
                    height={400}
                    sizes="(max-width: 600px) calc(100vw - 50px), 240px"
                    alt=""
                  />
                )}
              </Link>
              <div className="writing-list-content">
                <div className="writing-list-meta">
                  <span>{entry.category}</span>
                  <time dateTime={entry.date.replaceAll('.', '-')}>
                    {entry.date}
                  </time>
                </div>
                <h2>
                  <Link href={`/writing/${entry.slug}`}>{entry.title}</Link>
                </h2>
                <p className="writing-list-excerpt">{entry.excerpt}</p>
              </div>
            </article>
          ))}
          {error && <div className="archive-end" role="alert">{error}</div>}
          {archive.total === 0 && !error && (
            <div className="archive-end">
              {"没有找到匹配的文章，换个关键词试试。"}
            </div>
          )}
          <ContentPagination
            ariaLabel="文章分页"
            itemCount={archive.total}
            itemLabel="篇文章"
            page={page}
            pageSize={contentPageSizes.writing}
            onPageChange={setPage}
          />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
