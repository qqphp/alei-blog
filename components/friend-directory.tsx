'use client';

import { useContent } from '@/components/content-provider';

import Link from 'next/link';
import { usePublicCollection } from './use-public-collection';
import { PublicListError } from './public-list-error';
import { useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';



export function FriendDirectory() {
  const { friends: document } = useContent();
  const friends = document.items;
  const categories = ['全部', ...document.categories.map((item) => item.name)];
  const [category, setCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(24);
  const search = query.trim().toLocaleLowerCase();
  const matches = friends.filter((item) => [item.name, item.category, item.description, item.url ?? ''].join(' ').toLocaleLowerCase().includes(search));
  const filtered = matches.filter((item) => category === '全部' || item.category === category);
  const archive = usePublicCollection('friends.items',filtered,Math.ceil(limit/24),{q:query,category:document.categories.find((item)=>item.name===category)?.id,accumulate:true,onPageChange:(page)=>setLimit(page*24)});
  const visible = archive.remote ? archive.items : filtered.slice(0,limit);
  const total = archive.remote ? archive.total : filtered.length;
  const categoryCount = (name: string) => archive.remote ? archive.categoryCounts[document.categories.find((item)=>item.name===name)?.id ?? ''] ?? 0 : matches.filter((item)=>item.category===name).length;

  return <div className="directory-page friends-page">
    <header className="directory-heading"><div><p className="directory-kicker">{"NEIGHBORS ON THE WEB / 02"}</p><h1>友链<span>{"去别人的世界坐坐。"}</span></h1><p>{"独立的小站，不同的视角，在互联网里互相看见。"}</p></div><Link className="directory-crosslink" href="/bookmarks">{"翻翻书签"}<ArrowUpRight size={16} /></Link></header>
    <div className="friends-note"><span className="friends-note-symbol" aria-hidden="true">✳</span><p>{"这里为认真记录的人留一个位置。"}<small>当前 {archive.remote ? archive.allCount : friends.length}{" 张名片。"}</small></p><span className="friends-note-index" aria-hidden="true">{"PERSONAL"}<br />{"WEB DIRECTORY"}</span></div>
    <section aria-label="友链目录">
      <div className="friends-toolbar"><div className="friends-filters" aria-label="友链分类">{categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => { setCategory(name); setLimit(24); }}>{name}<small>{name === '全部' ? archive.remote ? archive.searchTotal : matches.length : categoryCount(name)}</small></button>)}</div><div className="directory-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="搜索友链" value={query} placeholder="找一个名字或主题…" onChange={(event) => { setQuery(event.target.value); setLimit(24); }} />{query && <button type="button" aria-label="清空搜索" onClick={() => { setQuery(''); setLimit(24); }}><X size={17} /></button>}</div></div>
      <div className="directory-result-line"><h2>{category === '全部' ? '网上邻居' : category}</h2><output aria-live="polite">{total}{"个站点"}</output></div>
      <div className="friend-cards">{visible.map((friend) => <article className="friend-card" key={friend.id}><div className="friend-card-top"><span className={`friend-avatar tone-${categories.indexOf(friend.category) % 3}`} aria-hidden="true">{friend.initials}</span><span className="friend-category">{friend.category}</span><small>{String(visible.indexOf(friend) + 1).padStart(2, '0')}</small></div><h3>{friend.name}</h3><p>{friend.description}</p><div className="friend-card-bottom">{friend.url ? <a href={friend.url} target="_blank" rel="noopener noreferrer" aria-label={`访问 ${friend.name}（在新标签页打开）`}>{"去串门"}<ArrowUpRight size={16} /></a> : <span>{"示例名片 · 网址待补充"}</span>}</div></article>)}</div>
      <PublicListError error={archive.error} />
      {total === 0 && <div className="directory-empty"><Search size={26} /><h3>{"暂时没有找到这位邻居"}</h3><p>{"换个关键词，或看看全部站点。"}</p><button type="button" onClick={() => { setCategory('全部'); setQuery(''); setLimit(24); }}>{"重置筛选"}</button></div>}
      {visible.length < total && <button type="button" className="directory-more" onClick={() => setLimit(limit + 24)}>{"再看看"}{Math.min(24, total - visible.length)}{"个站点"}<span>↓</span></button>}
      <p className="directory-end">{"已显示"}{visible.length} / {total}{"· 排列不分先后"}</p>
    </section>
  </div>;
}

