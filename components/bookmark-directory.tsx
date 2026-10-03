'use client';

import { useContent } from '@/components/content-provider';

import Link from 'next/link';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';
import { useState } from 'react';
import { ArrowUpRight, Bookmark, Search, X } from 'lucide-react';


const pageSize = 24;

export function BookmarkDirectory() {
  const { bookmarks: document } = useContent();
  const bookmarks = document.items;
  const categories = document.categories.map((item) => item.name);
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  const search = query.trim().toLocaleLowerCase();
  const matches = bookmarks.filter((item) => [item.name, item.url, item.description, item.category, ...item.tags].join(' ').toLocaleLowerCase().includes(search));
  const filtered = matches.filter((item) => category === '全部' || item.category === category);
  const archive = usePublicCollection('bookmarks.items',filtered,Math.ceil(limit/pageSize),{q:query,category:document.categories.find((item)=>item.name===category)?.id,accumulate:true,onPageChange:(page)=>setLimit(page*pageSize)});
  const visible = archive.remote ? archive.items : filtered.slice(0,limit);
  const total = archive.remote ? archive.total : filtered.length;
  const categoryCount = (name: string) => archive.remote ? archive.categoryCounts[document.categories.find((item)=>item.name===name)?.id ?? ''] ?? 0 : matches.filter((item)=>item.category===name).length;
  function reset() { setQuery(''); setCategory('全部'); setLimit(pageSize); }

  return <div className="directory-page">
    <header className="directory-heading"><div><p className="directory-kicker">{"THE WEB, COLLECTED / 01"}</p><h1>书签<span>{"值得再次打开。"}</span></h1><p>{"工具、灵感与长篇阅读，给好奇心留一份索引。"}</p></div><Link className="directory-crosslink" href="/friends">{"去友链串门"}<ArrowUpRight size={16} /></Link></header>
    <div className="directory-layout">
      <aside className="directory-sidebar" aria-label="书签分类"><div className="directory-side-title"><Bookmark size={16} /><span>{"收藏目录"}</span><small>{archive.remote ? archive.allCount : bookmarks.length}</small></div><div className="directory-categories">{['全部', ...categories].map((name, index) => <button type="button" key={name} aria-pressed={category === name} onClick={() => { setCategory(name); setLimit(pageSize); }}><span><i>{String(index).padStart(2, '0')}</i>{name}</span><small>{name === '全部' ? archive.remote ? archive.searchTotal : matches.length : categoryCount(name)}</small></button>)}</div><p className="directory-side-note">{categories.length}{"个主题 · 慢慢积累"}</p></aside>
      <section className="directory-results" aria-label="书签目录">
        <div className="directory-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="搜索书签" placeholder="搜索名称、网址、关键词…" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(pageSize); }} />{query && <button type="button" aria-label="清空搜索" onClick={() => { setQuery(''); setLimit(pageSize); }}><X size={17} /></button>}</div>
        <div className="directory-result-line"><h2>{category === '全部' ? '全部收藏' : category}</h2><output aria-live="polite">{total}{"个书签"}{search ? '符合搜索' : ''}</output></div>
        {categories.map((name) => { const items = visible.filter((item) => item.category === name); return items.length > 0 && <section className="bookmark-section" key={name} aria-label={name}><h3><span>{name}</span><small>{categoryCount(name).toString().padStart(2, '0')}</small><i /></h3><div className="bookmark-cards">{items.map((item) => <a className="bookmark-card" href={item.url} target="_blank" rel="noopener noreferrer" key={item.id} aria-label={`${item.name}（在新标签页打开）`}><div className="bookmark-card-top"><span className="bookmark-monogram" aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span><div><h4>{item.name}</h4><small>{new URL(item.url).hostname.replace(/^www\./, '')}</small></div><ArrowUpRight size={17} /></div><p>{item.description}</p><div className="directory-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></a>)}</div></section>; })}
        <PublicListError error={archive.error} />
        {total === 0 && <div className="directory-empty"><Search size={26} /><h3>{"没有找到这枚书签"}</h3><p>{"试试其他关键词，或回到全部收藏。"}</p><button type="button" onClick={reset}>{"重置筛选"}</button></div>}
        {visible.length < total && <button className="directory-more" type="button" onClick={() => setLimit(limit + pageSize)}>{"再显示"}{Math.min(pageSize, total - visible.length)}{"个书签"}<span>↓</span></button>}
        <p className="directory-end">{"已显示"}{visible.length} / {total}{"· 外部网站在新标签页打开"}</p>
      </section>
    </div>
  </div>;
}

