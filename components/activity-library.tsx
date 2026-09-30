'use client';
import { useState } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Compass, Sparkles } from 'lucide-react';
import { useContent } from './content-provider';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './ui/dialog';
import './activity-library.css';
export function ActivityLibrary({
  section,
}: {
  section: 'travel' | 'hobbies';
}) {
  const doc = useContent()[section];
  const label = section === 'travel' ? '旅行' : '爱好';
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const filtered = doc.items.filter(
    (item) =>
      (!category || item.categoryId === category) &&
      `${item.title} ${item.description} ${item.body}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, pages);
  return (
    <section className="activity-library" aria-label={`${label}内容`}>
      <div className="activity-toolbar">
        <div className="activity-filters" aria-label={`${label}分类`}>
          {[{ id: '', name: '全部' }, ...doc.categories].map((item) => (
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
        <input
          type="search"
          aria-label={`搜索${label}`}
          placeholder="搜索标题或内容"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="activity-grid">
        {filtered.slice((current - 1) * 12, current * 12).map((item) => (
          <article className="activity-card" key={item.id}>
            <div className="activity-cover">
              {item.cover ? (
                <Image
                  src={item.cover}
                  alt={`${item.title}封面`}
                  width={600}
                  height={400}
                />
              ) : section === 'travel' ? (
                <Compass size={36} />
              ) : (
                <Sparkles size={36} />
              )}
            </div>
            <div className="activity-card-body">
              <span>
                {doc.categories.find(
                  (category) => category.id === item.categoryId,
                )?.name ?? '未分类'}
              </span>
              <h2 title={item.title}>{item.title}</h2>
              <p>{item.description || '暂无简介'}</p>
              <Dialog>
                <DialogTrigger
                  className="activity-open"
                  aria-label={`阅读${item.title}`}
                >
                  {section === 'travel' ? '阅读旅行记录' : '查看内容与步骤'} ↗
                </DialogTrigger>
                <DialogContent
                  className="activity-dialog"
                  showCloseButton={false}
                >
                  <div className="activity-dialog-heading">
                    <DialogTitle>{item.title}</DialogTitle>
                    <DialogClose aria-label="关闭内容">关闭</DialogClose>
                  </div>
                  <DialogDescription>{item.description}</DialogDescription>
                  <div className="activity-full-text">
                    <div className="activity-markdown">
                      {item.body
                        ? <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{item.body}</ReactMarkdown>
                        : <p>暂无详细内容。</p>}
                    </div>
                    {section === 'travel' && item.album.length > 0 && (
                      <section
                        className="activity-album"
                        aria-label={`${item.title}相册集`}
                      >
                        <h3>沿途风景 · {item.album.length} 张</h3>
                        {item.album.map((url, index) => (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            key={`${url}-${index}`}
                            aria-label={`查看${item.title}风景图 ${index + 1}`}
                          >
                            <Image
                              src={url}
                              alt={`${item.title} · 风景 ${index + 1}`}
                              width={900}
                              height={600}
                            />
                          </a>
                        ))}
                      </section>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="activity-empty">
          <p>
            {doc.items.length
              ? '没有找到匹配内容。'
              : `暂无发布的${label}记录。`}
          </p>
          {(query || category) && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('');
                setPage(1);
              }}
            >
              清空筛选
            </button>
          )}
        </div>
      )}
      <nav className="activity-pagination" aria-label={`${label}分页`}>
        <span>
          {filtered.length} 项 · 第 {current} / {pages} 页
        </span>
        <div>
          <button
            type="button"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            下一页
          </button>
        </div>
      </nav>
    </section>
  );
}
