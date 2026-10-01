'use client';
import { contentPageSizes } from '@/lib/content-page-sizes';

import {
  ContentPagination,
} from '@/components/content-pagination';

import { useContent } from '@/components/content-provider';

import { StoryGallery } from '@/components/story-gallery';
import { StoryCover } from '@/components/story-cover';
import { useEffect, useRef, useState } from 'react';

import { normalizeStoryTopics } from '@/lib/story-content';
import type { StoryArchive } from '@/lib/cms-server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export default function StoriesPage({ initial }: { initial: StoryArchive }) {
  const { site } = useContent();
  const [period, setPeriod] = useState(initial.latestPeriod);
  const [page, setPage] = useState(1);
  const [archive, setArchive] = useState(initial);
  const [error, setError] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const controller = new AbortController();
    const run = async () => {
      try {
        const params = new URLSearchParams({ page: String(page), period: String(period) });
        const response = await fetch(`/api/stories?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('读取说说失败，请稍后重试。');
        setArchive(await response.json() as StoryArchive);
        setError('');
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取说说失败');
      }
    };
    void run();
    return () => controller.abort();
  }, [page, period]);
  const year = Math.floor(period / 12);
  const month = (period % 12) + 1;
  const calendar = archive.calendar;

  return (
    <main className="site-shell">
      <SiteHeader />
      <section className="story-top">
        <StoryCover />
        <div className="story-profile">
          <div className="story-avatar">A</div>
          <div>
            <h1>{site.name}</h1>
            <p>
              {"记录正在发生的事，也保留还没有答案的问题。"}
            </p>
          </div>
        </div>
      </section>
      <section className="story-layout">
        <aside className="story-sidebar calendar-side">
          <p>
            {year}
            {"年发布汇总"}
          </p>
          <strong>{archive.yearlyCount}</strong>
          <span>
            {"条说说"}
          </span>
          <div className="calendar-head">
            <button
              type="button"
              onClick={() => setPeriod((value) => value - 1)}
              aria-label="上一个月"
            >
              ←
            </button>
            <b>
              {year} 年 {month} 月
            </b>
            <button
              type="button"
              onClick={() => setPeriod((value) => value + 1)}
              aria-label="下一个月"
            >
              →
            </button>
          </div>
          <div className="calendar-grid">
            {weekdays.map((day) => (
              <i key={day}>{day}</i>
            ))}
            {Array.from({ length: calendar.offset }, (_, index) => (
              <span aria-hidden="true" key={`blank-${index}`} />
            ))}
            {calendar.days.map(({ day, count }) => (
              <span
                className={count ? 'has-post' : ''}
                title={`${year} 年 ${month} 月 ${day} 日：${count} 条说说`}
                key={day}
              >
                {day}
              </span>
            ))}
          </div>
          <div className="today-card">
            <b>
              {"阅读间隙"}
            </b>
            <p>
              {"“每一个当下，都是通向未来的入口。”"}
            </p>
          </div>
        </aside>
        <div className="story-feed">
          {error && <p role="alert">{error}</p>}
          {!error && archive.items.length === 0 && (
            <section className="content-empty-state" aria-labelledby="story-empty-title">
              <span className="content-empty-mark" aria-hidden="true">“</span>
              <h2 id="story-empty-title">暂无说说</h2>
              <p>{year} 年 {month} 月还没有发布说说。</p>
            </section>
          )}
          {archive.items.map((story) => (
            <article className="story-post" key={story.id}>
              <div className="post-avatar">A</div>
              <div className="post-body">
                <header>
                  <b>
                    {"开发阿雷"}
                  </b>
                  <time dateTime={story.date}>
                    {story.date.slice(0, 10).replaceAll('-', '.')}{' '}
                    {story.date.slice(11, 19)}
                  </time>
                </header>
                <p>{story.text}</p>
                <StoryGallery images={story.images} />
                <div className="story-post-topics">
                  {normalizeStoryTopics(story.topics).map((topic) => (
                    <span className="story-topic" key={topic}>
                      #{topic}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
          <ContentPagination
            ariaLabel="说说分页"
            itemCount={archive.total}
            itemLabel="条说说"
            page={page}
            pageSize={contentPageSizes.stories}
            onPageChange={setPage}
          />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
