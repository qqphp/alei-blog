'use client';

import { InvestmentPond } from '@/components/investment-pond';
import { useContent } from '@/components/content-provider';
import { newestCreatedFirst } from '@/lib/content-times';
import { Activity, BookOpen, ChartNoAxesCombined, FlaskConical, MessageCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './research-hub.css';

const investmentIcons: Record<string, LucideIcon> = {
  trends: ChartNoAxesCombined, indicators: Activity, quant: FlaskConical,
  review: MessageCircle, sharing: MessageCircle,
};

export function ResearchHub() {
  const { investing } = useContent();
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sectionsForDisplay = investing.sections;
  const investmentEntries = newestCreatedFirst(investing.sections
    .filter((section) => category === 'all' || section.id === category)
    .flatMap((section) => section.entries.map((entry) => ({
      id: `${section.id}:${entry.id}`,
      createdAt: entry.createdAt,
      entry,
    }))));
  const activeEntry = investmentEntries.find((item) => item.id === selectedId) ?? investmentEntries[0];

  return (
    <div className="research-hub research-investing">
          <header className="investment-heading">
            <h1 className="investment-pond-sr-only">投资研究</h1>
            <InvestmentPond />
          </header>
          <nav className="research-topic-grid investment-topic-grid" aria-label="投资研究栏目">
            {sectionsForDisplay.map((item, index) => {
              const Icon = investmentIcons[item.id] ?? BookOpen;
              const entryCount = item.entries.length;
              return (
                <button className={`investment-topic investment-topic-${item.id}`} type="button" key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(category === item.id ? 'all' : item.id); setSelectedId(null); }}>
                  <span className="investment-topic-index">{String(index + 1).padStart(2, '0')}</span>
                  <Icon className="investment-topic-icon" size={19} strokeWidth={1.6} aria-hidden="true" />
                  <span className="investment-topic-copy"><strong>{item.title}</strong><small>{entryCount ? `${entryCount} 篇笔记` : '持续整理中'}</small></span>
                </button>
              );
            })}
          </nav>

      <section id="research-library" className="research-library investment-library" aria-label="研究目录">
          <div className="investment-reader">
            <nav className="investment-article-list" aria-label="投资文章列表">
              {investmentEntries.map(({ id, entry }) => (
                <button type="button" key={id} aria-pressed={activeEntry?.id === id} aria-controls="investment-article" onClick={() => setSelectedId(id)}>
                  {entry.title}
                </button>
              ))}
              {!investmentEntries.length && <p className="investment-empty">暂无文章</p>}
            </nav>
            <article id="investment-article" className="investment-article" aria-labelledby={activeEntry ? 'investment-article-title' : undefined}>
              {activeEntry ? (
                <>
                  <header className="investment-article-heading">
                    <h2 id="investment-article-title">{activeEntry.entry.title}</h2>
                    <p>{activeEntry.entry.description}</p>
                  </header>
                  <div className="investment-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{activeEntry.entry.paragraphs.join('\n\n')}</ReactMarkdown>
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
