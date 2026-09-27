'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { defaults, sectionLabels, type Content, type Section } from '@/lib/cms-defaults';
import { adminCollections, collectionLabels, configScopes } from '@/lib/admin-sections';
import { coverInput } from '@/lib/article-categories';
import { projectImageInput, type Project } from '@/lib/project-content';
import { filmCoverInput, type Film } from '@/lib/film-content';
import { podcastCoverInput, type Podcast } from '@/lib/podcast-content';
import { musicSample, playlistCoverInput, type MusicPlaylist } from '@/lib/music-content';
import { storyDate } from '@/lib/story-content';
import type { Json } from '@/lib/cms-validation';
import { AdminWritingEditor, createArticleCover, type Article } from './admin-writing-editor';
import { createProjectImage } from './admin-project-images';
import { createFilmCover, createPodcastCover } from './admin-generated-covers';
import { createPlaylistCover } from './admin-playlist-cover';
import { AdminAiSettings } from './admin-ai-settings';
import { AdminAiResources } from './admin-ai-resources';
import { AdminInvestmentEditor } from './admin-investment-editor';
import { formatRecordTime } from '@/lib/content-times';
import { api, asJson, Field, fresh } from './admin-fields';
import './admin.css';

type Item = Record<string, unknown>;
type Summary = {
  id: string; title: string; excerpt?: string; categoryId?: string;
  published?: boolean; date?: string; revision: number; position: number;
  createdAt?: string | null; updatedAt?: string;
};
type Page = { items: Summary[]; total: number; page: number; size: number };
type Edit = { id: string | null; value: Json; revision: number; original: string };
type Option = { id: string; name: string; parentId?: string; title?: string };

const sidebarSections: { label?: string; sections: Section[] }[] = [
  { sections: ['writing', 'projects', 'stories', 'ai', 'investing', 'profile'] },
  { label: '网站', sections: ['bookmarks', 'friends'] },
  { label: '生活', sections: ['tracks', 'films', 'podcasts', 'travel', 'hobbies', 'books'] },
  { label: '设置', sections: ['aiSettings', 'site'] },
];
const websiteTabs = [
  { id: 'site', label: '站点', keys: ['name', 'mark', 'title', 'description', 'footer', 'copyright', 'footerLink', 'footerUrl'] },
  { id: 'navigation', label: '导航', keys: ['links', 'sites', 'life'] },
  { id: 'home', label: '首页', keys: ['eyebrow', 'title', 'description', 'noteTitle', 'noteText'] },
];
const EMPTY_COLLECTIONS: readonly string[] = [];
const destinations: Partial<Record<Section, string>> = {
  home: '/', site: '/', writing: '/writing', projects: '/projects', stories: '/notes',
  slides: '/notes', profile: '/about', ai: '/ai',
  investing: '/investing', bookmarks: '/bookmarks', friends: '/friends',
  books: '/books', tracks: '/music', films: '/films', podcasts: '/podcasts',
  travel: '/travel', hobbies: '/hobbies',
};
const collectionName = (section: Section, collection: string) => {
  if (section === 'writing' && collection === 'articles') return '文章管理';
  if (section === 'writing' && collection === 'categories') return '文章分类';
  if (section === 'stories') return collection === 'covers' ? '说说封面' : '说说';
  if (section === 'slides') return '说说封面';
  return collectionLabels[collection] ?? collection;
};
const recordUrl = (section: Section, collection: string, id?: string) =>
  `/api/admin/records/${section}/${collection}${id ? `/${encodeURIComponent(id)}` : ''}`;
const configUrl = (section: Section, scope: string) =>
  `/api/admin/config/${section}/${encodeURIComponent(scope)}`;

function sampleRecord(section: Section, collection: string, options: Record<string, Option[]>): Json {
  if (section === 'writing' && collection === 'articles')
    return {
      slug: `article-${crypto.randomUUID().slice(0, 8)}`, title: '', excerpt: '', body: '',
      categoryId: options.categories?.[0]?.id ?? '', category: options.categories?.[0]?.name ?? '',
      date: format(new Date(), 'yyyy.MM.dd'), cover: '', coverMode: 'upload',
      coverGeneratedFor: '', _published: false,
    };
  if (section === 'writing' && collection === 'categories')
    return { id: `category-${crypto.randomUUID()}`, name: '', description: '', parentId: '' };
  if (section === 'investing' && collection === 'entries') {
    const sample = defaults.investing.sections[0].entries[0];
    return { ...fresh(asJson(sample)) as Item, id: crypto.randomUUID(),
      sectionId: options.sections?.[0]?.id ?? '' } as Json;
  }
  const source = defaults[section] as unknown;
  const list = Array.isArray(source) ? source
    : section === 'investing' && collection === 'sections' ? defaults.investing.sections
      : source && typeof source === 'object' ? (source as Item)[collection] : undefined;
  const sample = Array.isArray(list) && list.length ? list[0]
    : section === 'tracks' && collection === 'playlists' ? musicSample.playlists[0] : undefined;
  if (!sample) throw new Error('此列表没有可用的表单模板');
  const value = fresh(asJson(sample)) as Item;
  value.id = crypto.randomUUID();
  if (section === 'investing' && collection === 'sections') delete value.entries;
  if (section === 'ai' && collection === 'agents') value.status = 'active';
  if (section === 'stories') value.date = storyDate(new Date());
  return value as Json;
}

function sampleConfig(section: Section): Json {
  const source = defaults[section];
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const collections = adminCollections[section] ?? EMPTY_COLLECTIONS;
  return Object.fromEntries(Object.entries(source).filter(([key]) => !collections.includes(key))) as Json;
}

async function prepareMedia(section: Section, collection: string, value: Json, setMessage: (message: string) => void) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const item = value as Item;
  if (section === 'writing' && collection === 'articles') {
    const article = item as unknown as Article;
    if (article.coverMode === 'ai' && (!article.cover || article.coverGeneratedFor !== coverInput(article.title, article.excerpt))) {
      setMessage('正在生成文章封面…');
      return asJson(await createArticleCover(article));
    }
  }
  if (section === 'projects' && collection === 'items') {
    const project = item as unknown as Project;
    const images = [...project.images];
    for (let index = 0; index < images.length; index++)
      if (images[index].mode === 'ai' && (!images[index].src || images[index].generatedFor !== projectImageInput(project))) {
        setMessage(`正在生成项目图片 ${index + 1}…`);
        images[index] = await createProjectImage(project, images[index]);
      }
    return asJson({ ...project, images });
  }
  if (section === 'films' && collection === 'items') {
    const film = item as unknown as Film;
    if (film.coverMode === 'ai' && (!film.cover || film.coverGeneratedFor !== filmCoverInput(film))) {
      setMessage('正在生成电影封面…');
      return asJson(await createFilmCover(film));
    }
  }
  if (section === 'podcasts' && collection === 'items') {
    const podcast = item as unknown as Podcast;
    if (podcast.coverMode === 'ai' && (!podcast.cover || podcast.coverGeneratedFor !== podcastCoverInput(podcast))) {
      setMessage('正在生成播客封面…');
      return asJson(await createPodcastCover(podcast));
    }
  }
  if (section === 'tracks' && collection === 'playlists') {
    const list = item as unknown as MusicPlaylist;
    if (list.coverMode === 'ai' && (!list.cover || list.coverGeneratedFor !== playlistCoverInput(list))) {
      setMessage('正在生成歌单封面…');
      return asJson(await createPlaylistCover(list));
    }
  }
  return value;
}

export function AdminGranularPanel() {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState('');
  const [section, setSection] = useState<Section>('writing');
  const [tab, setTab] = useState('articles');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [list, setList] = useState<Page | null>(null);
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [edit, setEdit] = useState<Edit | null>(null);
  const [config, setConfig] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const listRequest = useRef(0);
  const editRequest = useRef(0);
  const collections = useMemo(() => section === 'stories' ? ['root', 'covers'] : adminCollections[section] ?? EMPTY_COLLECTIONS, [section]);
  const recordSection = section === 'stories' && tab === 'covers' ? 'slides' : section;
  const scopes = section === 'site' ? websiteTabs : configScopes(section);
  const activeCollection = collections.includes(tab) ? tab === 'covers' ? 'root' : tab : null;
  const activeScope = !activeCollection && scopes.some((scope) => scope.id === tab) ? tab : null;
  const configSection = section === 'site' && tab === 'home' ? 'home' : section;
  const configScope = section === 'site' ? 'root' : activeScope;
  const dirty = Boolean((edit && JSON.stringify(edit.value) !== edit.original) ||
    (config && JSON.stringify(config.value) !== config.original));
  const confirmDiscard = () => !dirty || window.confirm('有未提交的修改，确定放弃吗？');
  const optionFields = useMemo(() => ({
    categoryId: options.categories ?? [], statusId: options.statuses ?? [],
    moodId: options.scenes ?? [], sectionId: options.sections?.map((item) =>
      ({ id: item.id, name: item.title ?? item.name })) ?? [],
    parentId: [{ id: '', name: '无上级分类' }, ...(options.categories ?? [])],
    coverMode: [{ id: 'upload', name: '上传文件' }, { id: 'ai', name: 'AI 生成' }],
    mode: [{ id: 'upload', name: '上传文件' }, { id: 'ai', name: 'AI 生成' }],
  }), [options]);

  useEffect(() => {
    void (async () => {
      try {
        const session = await api<{ configured: boolean; authenticated: boolean }>('/api/admin/session');
        setConfigured(session.configured);
        setLoggedIn(session.authenticated);
      } catch (error) { setMessage(String(error)); }
      finally { setReady(true); }
    })();
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  useEffect(() => {
    if (!loggedIn || !collections.length) return;
    let current = true;
    void api<Record<string, Option[]>>(`/api/admin/options/${recordSection}`)
      .then((result) => { if (current) setOptions(result); })
      .catch((error) => { if (current) setMessage(String(error)); });
    return () => { current = false; };
  }, [loggedIn, recordSection, collections]);

  const refreshOptions = useCallback(async () => {
    if (collections.length)
      setOptions(await api<Record<string, Option[]>>(`/api/admin/options/${recordSection}`));
  }, [recordSection, collections]);

  const refreshList = useCallback(async () => {
    if (!activeCollection) return;
    const params = new URLSearchParams({ page: String(page), size: '20', q: query,
      status, categoryId, statusId: section === 'projects' ? statusId : '' });
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const result = await api<Page>(`${recordUrl(recordSection, activeCollection)}?${params}`);
      if (request === listRequest.current) setList(result);
    } catch (error) { if (request === listRequest.current) setMessage(String(error)); }
    finally { if (request === listRequest.current) setLoading(false); }
  }, [recordSection, activeCollection, page, query, status, categoryId, statusId, section]);
  useEffect(() => {
    if (!loggedIn || !activeCollection) return;
    const task = setTimeout(() => void refreshList(), 0);
    return () => clearTimeout(task);
  }, [loggedIn, activeCollection, refreshList]);
  useEffect(() => {
    if (!loggedIn || !activeScope) return;
    let current = true;
    void api<{ value: Json; revision: number }>(configUrl(configSection, configScope!))
      .then((result) => { if (current) setConfig({ id: activeScope, value: result.value,
        revision: result.revision, original: JSON.stringify(result.value) }); })
      .catch((error) => { if (current) setMessage(String(error)); });
    return () => { current = false; };
  }, [loggedIn, configSection, configScope, activeScope]);

  function changeSection(next: Section) {
    if (busy || working || next === section || !confirmDiscard()) return;
    listRequest.current++;
    editRequest.current++;
    setSection(next);
    setTab(next === 'site' ? websiteTabs[0].id : adminCollections[next]?.[0] ?? configScopes(next)[0]?.id ?? 'root');
    setEdit(null); setConfig(null); setList(null); setOptions({}); setPage(1); setQuery('');
    setStatus('all'); setCategoryId(''); setStatusId(''); setMessage('');
  }
  function changeTab(next: string) {
    if (busy || working || next === tab || !confirmDiscard()) return;
    listRequest.current++;
    editRequest.current++;
    setTab(next); setEdit(null); setConfig(null); setList(null);
    setPage(1); setQuery(''); setStatus('all'); setCategoryId(''); setStatusId(''); setMessage('');
  }
  async function openRecord(id: string) {
    if (busy || working || !confirmDiscard() || !activeCollection) return;
    const request = ++editRequest.current;
    setBusy(true); setMessage('');
    try {
      const result = await api<{ value: Json; revision: number }>(recordUrl(recordSection, activeCollection, id));
      if (request !== editRequest.current) return;
      if (!result) throw new Error('记录不存在');
      setEdit({ id, value: result.value, revision: result.revision,
        original: JSON.stringify(result.value) });
    } catch (error) { if (request === editRequest.current) setMessage(String(error)); }
    finally { if (request === editRequest.current) setBusy(false); }
  }
  function addRecord() {
    if (busy || working || !activeCollection || !confirmDiscard()) return;
    editRequest.current++;
    try {
      const value = sampleRecord(recordSection, activeCollection, options);
      setEdit({ id: null, value, revision: 0, original: JSON.stringify(value) });
      setMessage('');
    } catch (error) { setMessage(String(error)); }
  }
  async function save() {
    if (busy || working) return;
    setBusy(true); setMessage('');
    try {
      if (activeCollection && edit) {
        const prepared = await prepareMedia(recordSection, activeCollection, edit.value, setMessage);
        setEdit((current) => current ? { ...current, value: prepared } : current);
        const url = recordUrl(recordSection, activeCollection, edit.id ?? undefined);
        const result = await api<{ revision: number; failedMedia?: string[] }>(url, {
          method: edit.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: prepared, revision: edit.revision }),
        });
        setEdit(null);
        await refreshList();
        if (['categories', 'statuses', 'scenes', 'sections'].includes(activeCollection))
          await refreshOptions();
        setMessage(result.failedMedia?.length ? '已保存，但部分旧素材清理失败。' : '已保存，内容已入库。');
      } else if (activeScope && config) {
        const result = await api<{ value: Json; revision: number }>(configUrl(configSection, configScope!), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: config.value, revision: config.revision }),
        });
        setConfig({ id: activeScope, value: result.value, revision: result.revision,
          original: JSON.stringify(result.value) });
        setMessage('已保存，内容已入库。');
      }
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  async function quickAction(item: Summary, action: 'publish' | 'delete' | 'up' | 'down') {
    if (busy || working || !activeCollection || !confirmDiscard()) return;
    if (action === 'delete' && !window.confirm(`确定删除「${item.title || item.id}」？此操作立即生效。`)) return;
    setBusy(true); setMessage('');
    try {
      const base = recordUrl(recordSection, activeCollection, item.id);
      const method = action === 'publish' ? 'PATCH' : action === 'delete' ? 'DELETE' : 'POST';
      const body = action === 'publish' ? { published: !item.published, revision: item.revision }
        : action === 'delete' ? { revision: item.revision }
          : { direction: action === 'up' ? -1 : 1, revision: item.revision };
      await api(action === 'up' || action === 'down' ? `${base}/move` : base, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      await refreshList();
      if (action === 'delete' && ['categories', 'statuses', 'scenes', 'sections'].includes(activeCollection))
        await refreshOptions();
      setMessage(action === 'delete' ? '已删除。' : '已更新并入库。');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  async function generateAdditionalImage() {
    if (busy || working || !edit || !activeCollection || !edit.value || typeof edit.value !== 'object' || Array.isArray(edit.value)) return;
    const value = edit.value as Item;
    const kind = section === 'travel' ? 'travel-cover' : section === 'hobbies' ? 'hobby-cover'
      : section === 'books' && activeCollection === 'items' ? 'book-cover'
        : section === 'books' && activeCollection === 'lists' ? 'booklist-cover'
          : section === 'stories' ? 'story-image' : null;
    if (!kind) return;
    setWorking(true); setMessage('正在生成图片…');
    try {
      const result = await api<{ url: string }>('/api/admin/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: kind, title: value.title ?? value.text ?? '',
          excerpt: value.description ?? value.text ?? '', author: value.author ?? '' }),
      });
      const next = kind === 'story-image'
        ? { ...value, images: [...(value.images as unknown[]), { src: result.url,
          alt: typeof value.text === 'string' ? value.text.slice(0, 80) : '' }] }
        : { ...value, cover: result.url };
      setEdit({ ...edit, value: next as Json });
      setMessage('图片已生成，点击“确认提交”后生效。');
    } catch (error) { setMessage(String(error)); }
    finally { setWorking(false); }
  }

  if (!ready) return <main className="admin-login"><output>正在连接内容管理…</output></main>;
  if (!loggedIn) return <main className="admin-login"><form onSubmit={async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }) });
      setPassword(''); setLoggedIn(true); setMessage('');
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }}>
    <p className="admin-eyebrow">ALEI / CONTENT STUDIO</p><h1>内容管理</h1>
    <p>在这里整理、编辑和发布你的博客。</p>
    {!configured && <p className="admin-notice">请先运行 <code>npm run admin:password</code> 设置管理员密码。</p>}
    <label htmlFor="admin-password">管理员密码</label>
    <input id="admin-password" type="password" autoComplete="current-password" required
      value={password} onChange={(event) => setPassword(event.target.value)} />
    <button className="admin-primary" disabled={busy || !configured}>{busy ? '登录中…' : '登录后台'}</button>
    <p role="alert">{message}</p><Link href="/">← 返回博客</Link>
  </form></main>;

  const configSample = activeScope ? sampleConfig(configSection) : null;
  const websiteTab = section === 'site' ? websiteTabs.find((item) => item.id === tab) : undefined;
  const configValue = websiteTab && config
    ? asJson(Object.fromEntries(Object.entries(config.value as Item).filter(([key]) => websiteTab.keys.includes(key))))
    : config?.value;
  const recordSample = activeCollection ? sampleRecord(recordSection, activeCollection, options) : null;
  const canPublish = activeCollection && !['categories', 'statuses', 'scenes', 'sections'].includes(activeCollection)
    && !(section === 'writing' && activeCollection === 'categories');
  const canGenerate = Boolean(edit && ((recordSection === 'travel' || recordSection === 'hobbies' || recordSection === 'stories')
    || (section === 'books' && ['items', 'lists'].includes(activeCollection ?? ''))));
  const showTimes = (section === 'writing' && activeCollection === 'articles') ||
    (section === 'projects' && activeCollection === 'items') || (section === 'investing' && activeCollection === 'entries');
  const canMove = !['writing', 'stories'].includes(recordSection) && !(section === 'investing' && activeCollection === 'entries');
  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span>ALEI ADMIN</span><strong>后台管理系统</strong></div>
      <p>内容与页面</p>
      <nav aria-label="后台栏目">
        {sidebarSections.map((group, index) => <div key={group.label ?? index}
          className={group.label ? 'admin-nav-group' : 'admin-nav-primary'}>
          {group.label && <span className="admin-nav-group-label">{group.label}</span>}
          {group.sections.map((key) => <button key={key} type="button" disabled={busy || working}
            className={group.label ? 'admin-nav-child' : undefined}
            aria-current={section === key ? 'page' : undefined} onClick={() => changeSection(key)}>
            {sectionLabels[key]}
          </button>)}
        </div>)}
      </nav>
      <button type="button" disabled={busy || working} onClick={async () => {
        if (!confirmDiscard()) return;
        try { await api('/api/admin/session', { method: 'DELETE' }); setLoggedIn(false); }
        catch (error) { setMessage(String(error)); }
      }}>退出登录</button>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><div>
        <p className="admin-eyebrow">LOCAL BLOG / EDITOR</p><h1>{sectionLabels[section]}</h1>
      </div><div><a href={destinations[section] ?? '/'} target="_blank" rel="noreferrer">查看前台 ↗</a></div></header>
      <output className="admin-status">{message}</output>
      <div className="admin-editor">
        <div className="admin-settings-tabs" role="tablist" aria-label="栏目内容">
          {collections.map((name) => <button key={name} type="button" role="tab"
            disabled={busy || working}
            aria-selected={tab === name} onClick={() => changeTab(name)}>{collectionName(section, name)}</button>)}
          {scopes.map((scope) => <button key={scope.id} type="button" role="tab"
            disabled={busy || working}
            aria-selected={tab === scope.id} onClick={() => changeTab(scope.id)}>{scope.label}</button>)}
        </div>
        {activeCollection && (edit ? <section className="admin-form" aria-label="内容表单">
          <div className="admin-section-heading"><button type="button" disabled={busy || working} onClick={() => {
            if (confirmDiscard()) { editRequest.current++; setEdit(null); setMessage(''); }
          }}>← 返回列表</button><span>{edit.id ? '编辑内容' : '新增内容'}</span></div>
          {showTimes && <dl className="admin-record-times">
            <div><dt>{section === 'investing' ? '添加时间' : '创建时间'}</dt><dd>{edit.id ? formatRecordTime((edit.value as Item).createdAt as string | null) : '首次保存时自动记录'}</dd></div>
            <div><dt>最后更新时间</dt><dd>{edit.id ? formatRecordTime((edit.value as Item).updatedAt as string) : '首次保存时自动记录'}</dd></div>
          </dl>}
          <fieldset disabled={busy || working}>
            {section === 'writing' && activeCollection === 'articles' ?
              <AdminWritingEditor article={edit.value as unknown as Article}
                categories={(options.categories ?? []) as Content['categories']}
                onWorking={setWorking} disabled={busy || working}
                onChange={(value) => setEdit({ ...edit, value: asJson(value) })} /> :
              section === 'ai' ? <AdminAiResources collection={activeCollection} value={edit.value} sample={recordSample!}
                onChange={(value) => setEdit({ ...edit, value })} /> :
              section === 'investing' && activeCollection === 'entries' ? <AdminInvestmentEditor value={edit.value} sample={recordSample!}
                columns={optionFields.sectionId} onChange={(value) => setEdit({ ...edit, value })} /> :
              <Field path={`${recordSection}.${activeCollection}`} label={collectionName(recordSection, activeCollection)}
                value={edit.value} sample={recordSample ?? edit.value} options={optionFields}
                onWorking={setWorking}
                immutableIdentity={Boolean(edit.id)}
                onChange={(value) => setEdit({ ...edit, value })} />}
          </fieldset>
          {canGenerate && <button type="button" disabled={busy || working} onClick={() => void generateAdditionalImage()}>
            {working ? '正在生成图片…' : section === 'stories' ? 'AI 生成配图' : 'AI 生成封面'}
          </button>}
          <div className="admin-form-actions"><button className="admin-primary" type="button"
            disabled={busy || working} onClick={() => void save()}>
            {busy ? '提交中…' : '确认提交'}
          </button></div>
        </section> : <section className="admin-writing-table">
          <div className="admin-table-toolbar">
            <input type="search" aria-label="搜索此列表" placeholder="搜索内容" value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
            {canPublish && <select aria-label="按发布状态筛选" value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">全部状态</option><option value="published">已发布</option>
              <option value="draft">草稿</option>
            </select>}
            {activeCollection === 'items' || activeCollection === 'articles' || activeCollection === 'entries' ?
              <select aria-label={section === 'tracks' ? '按场景筛选' : '按分类筛选'} value={categoryId}
                onChange={(event) => { setCategoryId(event.target.value); setPage(1); }}>
                <option value="">{section === 'tracks' ? '全部场景' : section === 'investing' ? '全部栏目' : '全部分类'}</option>
                {(section === 'tracks' ? options.scenes : section === 'investing' ? options.sections : options.categories)?.map((item) =>
                  <option value={item.id} key={item.id}>{item.title ?? item.name}</option>)}
              </select> : null}
            {section === 'projects' && activeCollection === 'items' ?
              <select aria-label="按项目状态筛选" value={statusId}
                onChange={(event) => { setStatusId(event.target.value); setPage(1); }}>
                <option value="">全部项目状态</option>
                {options.statuses?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select> : null}
            <button className="admin-primary" type="button" disabled={busy || working} onClick={addRecord}>＋ 新增{collectionName(section, tab)}</button>
          </div>
          <div className="admin-table-scroll"><table className="admin-data-table">
            <caption>共 {list?.total ?? 0} 条；每页最多 20 条</caption>
            <thead><tr><th scope="col">内容</th>{showTimes && <><th scope="col">{section === 'investing' ? '添加时间' : '创建时间'}</th><th scope="col">最后更新时间</th></>}<th scope="col">状态</th><th scope="col">操作</th></tr></thead>
            <tbody>{list?.items.map((item, index) => <tr key={item.id}>
              <td><button type="button" className="admin-table-title" disabled={busy || working} onClick={() => void openRecord(item.id)}>
                {item.title || item.excerpt || item.id}</button>
                <small>{item.excerpt?.slice(0, 100) || item.id}</small></td>
              {showTimes && <><td>{formatRecordTime(item.createdAt)}</td><td>{item.updatedAt ? formatRecordTime(item.updatedAt) : '—'}</td></>}
              <td>{canPublish ? <span className={`admin-status-badge ${item.published ? 'published' : ''}`}>
                {item.published ? '已发布' : '草稿'}</span> : '—'}</td>
              <td><div className="admin-row-actions">
                <button type="button" disabled={busy} onClick={() => void openRecord(item.id)}>编辑</button>
                {canPublish && <button type="button" disabled={busy}
                  onClick={() => void quickAction(item, 'publish')}>{item.published ? '转草稿' : '发布'}</button>}
                {canMove && <><button type="button" disabled={busy || (index === 0 && page === 1) || Boolean(query)}
                  onClick={() => void quickAction(item, 'up')}>上移</button>
                <button type="button" disabled={busy || (index === (list?.items.length ?? 0) - 1 && page >= Math.ceil((list?.total ?? 0) / 20)) || Boolean(query)}
                  onClick={() => void quickAction(item, 'down')}>下移</button></>}
                <button type="button" className="admin-danger" disabled={busy}
                  onClick={() => void quickAction(item, 'delete')}>删除</button>
              </div></td>
            </tr>)}</tbody>
          </table>{!loading && !list?.items.length && <p className="admin-empty">此列表暂无内容。</p>}</div>
          <nav className="admin-table-pagination" aria-label="表格分页">
            <span>第 {list?.page ?? page} / {Math.max(1, Math.ceil((list?.total ?? 0) / 20))} 页</span>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</button>
            <button type="button" disabled={page >= Math.ceil((list?.total ?? 0) / 20) || loading}
              onClick={() => setPage(page + 1)}>下一页</button>
          </nav>
        </section>)}
        {activeScope && config && <section className="admin-form" aria-label="设置表单">
          {section === 'aiSettings' ?
            <AdminAiSettings value={config.value as unknown as typeof defaults.aiSettings}
              dirty={dirty} onChange={(value) => setConfig({ ...config, value: asJson(value) })} /> :
            <Field path={`${section}.${activeScope}`} label={scopes.find((scope) => scope.id === activeScope)?.label ?? sectionLabels[section]}
              value={configValue!} sample={configSample ?? config.value}
              onWorking={setWorking}
              onChange={(value) => setConfig({ ...config,
                value: websiteTab ? asJson({ ...config.value as Item, ...value as Item }) : value })} />}
          <div className="admin-form-actions"><button type="button" className="admin-primary"
            disabled={busy || working || !dirty} onClick={() => void save()}>
            {busy ? '提交中…' : '确认提交'}
          </button></div>
        </section>}
        {loading && <p className="admin-empty">正在加载…</p>}
      </div>
    </div>
  </main>;
}
