'use client';
import { contentPageSizes } from '@/lib/content-page-sizes';
import { ContentPagination } from '@/components/content-pagination';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';


import { InvestmentPond } from '@/components/investment-pond';
import { useContent } from '@/components/content-provider';
import { newestCreatedFirst } from '@/lib/content-times';
import { Activity, BookOpen, ChartNoAxesCombined, FlaskConical, MessageCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { MarkdownContent } from './markdown-content';
import './research-hub.css';

const investmentIcons: Record<string, LucideIcon> = {
  trends: ChartNoAxesCombined, indicators: Activity, quant: FlaskConical,
  review: MessageCircle, sharing: MessageCircle,
};

export function ResearchHub() {
  const { investing } = useContent();
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sectionsForDisplay = investing.sections;
  const investmentEntries = newestCreatedFirst(investing.sections
    .filter((section) => category === 'all' || section.id === category)
    .flatMap((section) => section.entries.map((entry) => ({
      id: `${section.id}:${entry.id}`,
      createdAt: entry.createdAt,
      entry,
    }))));
  const archive = usePublicCollection('investing.entries',investmentEntries.map((item)=>({ ...item.entry, sectionId:item.id.slice(0,item.id.indexOf(':')) })),page,
    {category:category==='all'?undefined:category,onPageChange:setPage});
  const paginated = { ...archive, items:archive.items.map((entry)=>({id:`${entry.sectionId}:${entry.id}`,entry})) };
  const activeEntry = paginated.items.find((item) => item.id === selectedId) ?? paginated.items[0];

  return (
    <div className="research-hub research-investing">
          <header className="investment-heading">
            <h1 className="investment-pond-sr-only">投资研究</h1>
            <InvestmentPond />
          </header>
          <nav className="research-topic-grid investment-topic-grid" aria-label="投资研究栏目">
            {sectionsForDisplay.map((item) => {
              const Icon = investmentIcons[item.id] ?? BookOpen;
              const entryCount = archive.remote ? archive.categoryCounts[item.id] ?? 0 : item.entries.length;
              return (
                <button className={`investment-topic investment-topic-${item.id}`} type="button" key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(category === item.id ? 'all' : item.id); setSelectedId(null); setPage(1); }}>
                  <Icon className="investment-topic-icon" size={19} strokeWidth={1.6} aria-hidden="true" />
                  <span className="investment-topic-copy"><strong>{item.title}</strong><small>{entryCount} 篇笔记</small></span>
                </button>
              );
            })}
          </nav>

      <section id="research-library" className="research-library investment-library" aria-label="研究目录">
          <PublicListError error={archive.error} />
          <div className="investment-reader">
            <div className="investment-directory">
            <nav className="investment-article-list" aria-label="投资文章列表">
              {paginated.items.map(({ id, entry }) => (
                <button type="button" key={id} aria-pressed={activeEntry?.id === id} aria-controls="investment-article" onClick={() => setSelectedId(id)}>
                  {entry.title}
                </button>
              ))}
              {!archive.total && <p className="investment-empty">暂无文章</p>}
            </nav>
            <ContentPagination ariaLabel="投资目录分页" itemCount={archive.total} itemLabel="篇笔记" page={paginated.currentPage} pageSize={contentPageSizes.investing} onPageChange={(nextPage) => { setPage(nextPage); setSelectedId(null); }} />
            </div>
            <article id="investment-article" className="investment-article" aria-labelledby={activeEntry ? 'investment-article-title' : undefined}>
              {activeEntry ? (
                <>
                  <header className="investment-article-heading">
                    <h2 id="investment-article-title">{activeEntry.entry.title}</h2>
                    <p>{activeEntry.entry.description}</p>
                  </header>
                  <div className="investment-markdown">
                    <MarkdownContent source={activeEntry.entry.paragraphs.join('\n\n')} />
                  </div>
                </>
              ) : <p className="investment-empty">暂无文章</p>}
            </article>
          </div>
      </section>
      <p className="research-disclosure">本页为投资研究框架示例，仅用于学习与交流，不构成投资建议。未接入行情、账户或交易系统。</p>
    </div>
  );
}
