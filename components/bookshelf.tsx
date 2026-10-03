'use client';
import { contentPageSizes } from '@/lib/content-page-sizes';
import { ContentPagination } from '@/components/content-pagination';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';


import { useContent, usePublicArchives } from '@/components/content-provider';

import { useState } from 'react';
import Image from 'next/image';
import { Search, ArrowUpRight, BookOpen, X } from 'lucide-react';
import { LifeNavigation, SiteHeader, SiteFooter } from '@/components/site-chrome';
import { LifePageHeader } from '@/components/life-page-header';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Book as StoredBook } from '@/lib/book-content';
import './bookshelf.css';
import { BooklistGallery } from './booklist-gallery';

type Book = StoredBook & { category: string };
function Cover({ book }: { book: Book }) {
  return book.cover ? <div className="reading-cover reading-uploaded-cover"><Image src={book.cover} alt={`${book.title}封面`} width={160} height={240} /></div> : <div className="reading-cover"><span>{book.category}</span><strong>{book.title}</strong><small>{book.author}</small></div>;
}

export function Bookshelf() {
  const { books: document } = useContent();
  const archives = usePublicArchives();
  const books = document.items.map(book => ({ ...book, category: document.categories.find(category => category.id === book.categoryId)?.name ?? '未分类' }));
  const booklists = document.lists;
  const [tab, setTab] = useState('全部书籍');
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<Book | null>(null);
  const filtered = books.filter(book => (category === '全部' || book.category === category) && `${book.title} ${book.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const paginated = usePublicCollection('books.items',filtered,page,{ q:query,
    category:document.categories.find((item)=>item.name===category)?.id, onPageChange:setPage });
  const changeTab = (value: string) => { setTab(value); setCategory('全部'); setQuery(''); setPage(1); };
  return <main className="site-shell"><SiteHeader /><div className="reading-room">
    <LifePageHeader kind="books" title="书籍" intro={<>{"读过的留在书架，想读的记在清单。"} {"把相近的思考，整理成下一次阅读的起点。"}</>} />
    <LifeNavigation />
    <nav className="reading-tabs" aria-label="书架视图">{['全部书籍', '主题书单'].map(value => <button type="button" aria-pressed={tab === value} onClick={() => changeTab(value)} key={value}>{value}<span>{value === '主题书单' ? archives['books.lists']?.allCount ?? booklists.length : paginated.remote ? paginated.allCount : books.length}</span></button>)}</nav>
    {tab === '主题书单' && <BooklistGallery lists={booklists} />}
    {tab !== '主题书单' && <section className="reading-library" aria-label="书籍列表">
      <div className="reading-tools"><div className="reading-categories" aria-label="书籍分类">{['全部', ...document.categories.map(category => category.name)].map(value => <button type="button" aria-pressed={category === value} key={value} onClick={() => { setCategory(value); setPage(1); }}>{value}</button>)}</div><label className="reading-search"><Search size={17} /><input aria-label="搜索书名或作者" placeholder="搜索书名、作者" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />{query && <button type="button" aria-label="清空搜索" onClick={() => { setQuery(''); setPage(1); }}><X size={15} /></button>}</label></div>
      <PublicListError error={paginated.error} />
      <div className="reading-result" aria-live="polite"><span>每本书，都是一个入口。</span><span>{paginated.total} 本</span></div>
      <div className="reading-grid">{paginated.items.map(book => <button type="button" className="reading-book" onClick={() => setOpened(book)} key={book.id} aria-label={`查看《${book.title}》的阅读卡片`}><div className="reading-book-stage"><Cover book={book} /></div><div className="reading-book-meta"><span>{book.category}</span></div><h2>{book.title}</h2><p>{book.author}</p><span className="reading-book-link">阅读笔记 <ArrowUpRight size={15} /></span></button>)}</div>
      {paginated.total === 0 && <div className="reading-empty"><BookOpen size={30} /><h2>{"这次没有找到匹配的书"}</h2><p>{"试试其他书名、作者或分类。"}</p><button type="button" onClick={() => { setQuery(''); setCategory('全部'); setPage(1); }}>{"清除筛选"}</button></div>}
      <ContentPagination ariaLabel="书籍分页" itemCount={paginated.total} itemLabel="本书" page={paginated.currentPage} pageSize={contentPageSizes.books} onPageChange={setPage} />
    </section>}
    <footer className="reading-end"><span>{"READ · THINK · REVISIT"}</span><p>{"合上书以后，阅读还在继续。"}</p></footer>
  </div><SiteFooter />
  <Dialog open={!!opened} onOpenChange={value => { if (!value) setOpened(null); }}><DialogContent className="reading-dialog">{opened && <><Cover book={opened} /><div><DialogTitle className="reading-dialog-title">{opened.title}</DialogTitle><p className="reading-dialog-author">{opened.author} / {opened.category}</p><h3>阅读笔记</h3><p className="reading-note">{opened.note || '暂无阅读笔记。'}</p></div></>}</DialogContent></Dialog>
  </main>;
}
