'use client';
import { useState } from 'react';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';
import Image from 'next/image';
import { Headphones, Mic2, Search, X } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './ui/dialog';
import { useContent } from './content-provider';
import type { Podcast } from '@/lib/podcast-content';
import './podcast-library.css';

function PodcastExcerpt({ item }: { item: Podcast }) {
  const [error, setError] = useState(false);
  return (
    <div className="podcast-excerpt">
      <span>
        <Headphones size={14} /> 节选试听
      </span>
      {item.audio ? (
        <>
          {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Excerpts are audio uploads; no caption file is supplied by this content model. */}
          <audio
            controls
            preload="none"
            src={item.audio}
            aria-label={`${item.title}节选音频`}
            onError={() => setError(true)}
            onCanPlay={() => setError(false)}
          />
          <output aria-live="polite">
            {error ? '音频暂时无法播放，请稍后重试。' : ''}
          </output>
        </>
      ) : (
        <p>暂无节选音频</p>
      )}
    </div>
  );
}
export function PodcastLibrary() {
  const { podcasts } = useContent();
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = podcasts.items.filter(
    (item) =>
      (!category || item.categoryId === category) &&
      [item.title, item.description, item.host]
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const archive = usePublicCollection('podcasts.items',filtered,page,{q:query,category,onPageChange:setPage});
  const pages = Math.max(1, Math.ceil(archive.total / 12));
  const currentPage = archive.currentPage;
  return (
    <section
      className="podcast-library"
      aria-label="播客节目"
      onPlayCapture={(event) => {
        // Keep only one excerpt playing within this collection.
        event.currentTarget.querySelectorAll('audio').forEach((audio) => {
          if (audio !== event.target) audio.pause();
        });
      }}
    >
      <header className="podcast-heading">
        <div>
          <span>
            <Mic2 size={16} /> THE LISTENING ROOM
          </span>
          <h2>留一点时间，听听看。</h2>
        </div>
        <p>{podcasts.items.length} 档节目</p>
      </header>
      <div className="podcast-toolbar">
        <div className="podcast-categories" aria-label="播客分类">
          {[{ id: '', name: '全部' }, ...podcasts.categories].map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={category === item.id}
              onClick={() => {
                setCategory(item.id);
                setPage(1);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <label className="podcast-search">
          <Search size={16} />
          <input
            type="search"
            aria-label="搜索播客"
            placeholder="搜索节目、主播…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <div className="podcast-grid">
        {archive.items
          .map((item) => (
            <article className="podcast-card" key={item.id}>
              <div className="podcast-cover">
                {item.cover ? (
                  <Image
                    src={item.cover}
                    alt={`${item.title}封面`}
                    width={600}
                    height={400}
                  />
                ) : (
                  <div className="podcast-cover-empty">
                    <Mic2 size={36} />
                  </div>
                )}
              </div>
              <div className="podcast-card-body">
                <span className="podcast-category">
                  {podcasts.categories.find(
                    (category) => category.id === item.categoryId,
                  )?.name ?? '未分类'}
                </span>
                <h3>{item.title}</h3>
                <p className="podcast-host">
                  <Mic2 size={14} />
                  <span title={item.host}>{item.host || '主播未填写'}</span>
                </p>
                <p className="podcast-summary">
                  {item.description || '暂无节目简介。'}
                </p>
              </div>
              <div className="podcast-card-footer">
                <Dialog>
                  <DialogTrigger
                    className="podcast-description-button"
                    aria-label={`查看${item.title}简介`}
                  >
                    查看简介
                  </DialogTrigger>
                  <DialogContent
                    className="podcast-description-dialog"
                    showCloseButton={false}
                  >
                    <div className="podcast-dialog-heading">
                      <div>
                        <span>节目简介</span>
                        <DialogTitle>{item.title}</DialogTitle>
                        <p>{item.host || '主播未填写'}</p>
                      </div>
                      <DialogClose aria-label="关闭简介">
                        <X size={20} />
                      </DialogClose>
                    </div>
                    <DialogDescription className="podcast-description">
                      {item.description || '暂无节目简介。'}
                    </DialogDescription>
                  </DialogContent>
                </Dialog>
                <PodcastExcerpt key={item.audio} item={item} />
              </div>
            </article>
          ))}
      </div>
      <PublicListError error={archive.error} />
      {!archive.total && (
        <div className="podcast-empty">
          <Headphones size={28} />
          <p>
            {podcasts.items.length
              ? '没有找到匹配的节目。'
              : '暂无发布的播客。'}
          </p>
          {(query || category) && (
            <button
              type="button"
              onClick={() => {
                setCategory('');
                setQuery('');
                setPage(1);
              }}
            >
              清空筛选
            </button>
          )}
        </div>
      )}
      <nav className="podcast-pagination" aria-label="播客分页">
        <span>
          {archive.total} 档节目 · 第 {currentPage} / {pages} 页
        </span>
        <div>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页
          </button>
        </div>
      </nav>
    </section>
  );
}
