'use client';
import { contentPageSizes } from '@/lib/content-page-sizes';
import { ContentPagination } from '@/components/content-pagination';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Search } from 'lucide-react';
import type { BookList } from '@/lib/book-content';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './ui/dialog';
import './booklist-gallery.css';

function ListCover({ list }: { list: BookList }) {
  return (
    <div className={`booklist-art${list.cover ? '' : ' booklist-art-type'}`}>
      {list.cover ? (
        <Image
          src={list.cover}
          alt={`${list.title}封面`}
          width={900}
          height={600}
        />
      ) : (
        <>
          <span>READING COLLECTION</span>
          <strong>{list.title}</strong>
          <span>把阅读，连成一条线。</span>
        </>
      )}
    </div>
  );
}

export function BooklistGallery({ lists }: { lists: BookList[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<BookList | null>(null);
  const filtered = lists.filter((list) =>
    `${list.title} ${list.description} ${list.entries.map((entry) => `${entry.title} ${entry.author}`).join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const paginated = usePublicCollection('books.lists',filtered,page,{q:query,onPageChange:setPage});
  return (
    <section className="booklist-gallery" aria-label="主题书单">
      <div className="booklist-toolbar">
        <div>
          <span className="booklist-eyebrow">
            READING COLLECTIONS / 主题阅读
          </span>
          <h2>从一个主题，走进几本书。</h2>
          <p>{paginated.remote ? paginated.allCount : lists.length} 份书单，把相近的思考放在一起。</p>
        </div>
        <label className="booklist-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="搜索主题书单"
            placeholder="书单、书名、作者"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          />
        </label>
      </div>
      <div className="booklist-card-grid">
        <PublicListError error={paginated.error} />
        {paginated.items.map((list, index) => (
          <button
            type="button"
            className="booklist-card"
            key={list.id}
            onClick={() => setOpened(list)}
            aria-label={`打开书单：${list.title}`}
          >
            <ListCover list={list} />
            <div className="booklist-card-copy">
              <div className="booklist-card-meta">
                <span>书单 / {String((paginated.currentPage - 1) * contentPageSizes.booklists + index + 1).padStart(2, '0')}</span>
                <span>{list.entries.length} 本书</span>
              </div>
              <h3>{list.title}</h3>
              <p>{list.description || '一份等待展开的阅读清单。'}</p>
              <span className="booklist-open">
                翻开书单 <ArrowUpRight size={18} />
              </span>
            </div>
          </button>
        ))}
      </div>
      {!paginated.total && (
        <div className="booklist-empty">
          <p>
            {paginated.allCount ? '没有找到匹配的书单。' : '暂无发布的主题书单。'}
          </p>
          {query && (
            <button type="button" onClick={() => { setQuery(''); setPage(1); }}>
              清空搜索
            </button>
          )}
        </div>
      )}
      <ContentPagination ariaLabel="主题书单分页" itemCount={paginated.total} itemLabel="份书单" page={paginated.currentPage} pageSize={contentPageSizes.booklists} onPageChange={setPage} />
      <Dialog
        open={!!opened}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
      >
        <DialogContent className="booklist-dialog" showCloseButton={false}>
          {opened && (
            <>
              <div className="booklist-dialog-top">
                <span className="booklist-eyebrow">
                  主题书单 · {opened.entries.length} 本
                </span>
                <DialogClose>关闭</DialogClose>
              </div>
              <ListCover list={opened} />
              <div className="booklist-dialog-intro">
                <DialogTitle>{opened.title}</DialogTitle>
                <DialogDescription>
                  {opened.description || '书目清单'}
                </DialogDescription>
              </div>
              <ol className="booklist-reading-order">
                {opened.entries.map((entry, index) => (
                  <li key={index}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{entry.title}</h3>
                      {entry.author && <p>{entry.author}</p>}
                    </div>
                  </li>
                ))}
              </ol>
              {!opened.entries.length && (
                <p className="booklist-empty">书目整理中。</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
