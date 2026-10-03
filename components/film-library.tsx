'use client';
import { useState } from 'react';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';
import Image from 'next/image';
import { Film as FilmIcon, Search } from 'lucide-react';
import { useContent } from './content-provider';
import './film-library.css';
export function FilmLibrary() {
  const { films } = useContent();
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const matches = films.items.filter((film) =>
    [film.title, film.director, film.genre, film.country, film.language]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const filtered = matches.filter(
    (film) => !category || film.categoryId === category,
  );
  const archive = usePublicCollection('films.items',filtered,page,{q:query,category,onPageChange:setPage});
  const pages = Math.max(1, Math.ceil(archive.total / 20));
  const currentPage = archive.currentPage;
  return (
    <div className="cinema-program">
      <div className="cinema-program-heading">
        <div>
          <span>FRAME BY FRAME / PERSONAL COLLECTION</span>
          <h2>
            光影收藏架<span className="cinema-heading-dot">.</span>
          </h2>
        </div>
        <p>
          <strong>{String(archive.remote ? archive.allCount : films.items.length).padStart(2, '0')}</strong>
          <span>部电影 · 留给散场之后</span>
        </p>
      </div>
      <div className="cinema-toolbar">
        <div className="cinema-categories" aria-label="电影分类">
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => {
              setCategory('');
              setPage(1);
            }}
          >
            全部 <small>{archive.remote ? archive.searchTotal : matches.length}</small>
          </button>
          {films.categories.map((item) => (
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
              <small>
                {archive.remote ? archive.categoryCounts[item.id] ?? 0 : matches.filter((film) => film.categoryId === item.id).length}
              </small>
            </button>
          ))}
        </div>
        <label className="cinema-search">
          <Search size={16} />
          <input
            type="search"
            aria-label="搜索电影"
            placeholder="片名、导演、类型…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <ol className="cinema-program-list" aria-label="电影节目单">
        {archive.items
          .map((film, index) => (
            <li key={film.id}>
              <div className="cinema-program-image">
                {film.cover ? (
                  <Image
                    src={film.cover}
                    alt={`${film.title}封面`}
                    width={180}
                    height={320}
                  />
                ) : (
                  <FilmIcon size={24} />
                )}
              </div>
              <div className="cinema-card-info">
                <div className="cinema-card-top">
                  <span className="cinema-program-category">
                    {films.categories.find(
                      (item) => item.id === film.categoryId,
                    )?.name || '未分类'}
                  </span>
                  <span className="cinema-program-number">
                    {String((currentPage - 1) * 20 + index + 1).padStart(
                      2,
                      '0',
                    )}
                  </span>
                </div>
                <h3>{film.title}</h3>
                <dl className="cinema-card-facts">
                  {[
                    ['导演', film.director],
                    ['类型', film.genre],
                    ['国家', film.country],
                    ['语言', film.language],
                  ]
                    .filter(([, text]) => text.trim())
                    .map(([label, text]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{text}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            </li>
          ))}
      </ol>
      <PublicListError error={archive.error} />
      {!archive.total && (
        <div className="cinema-empty">
          <FilmIcon size={28} />
          <h3>
            {films.items.length
              ? '这一场，暂时没有影片。'
              : '电影档案等待第一部影片。'}
          </h3>
          {(category || query) && (
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
      <nav className="cinema-pagination" aria-label="电影分页">
        <span>
          {archive.total} 部电影 · 第 {currentPage} / {pages} 页
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
    </div>
  );
}
