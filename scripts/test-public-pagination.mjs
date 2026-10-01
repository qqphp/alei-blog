import { Window } from 'happy-dom';
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
const style = window.document.createElement('style');
style.textContent = readFileSync(
  new URL('../components/admin.css', import.meta.url),
  'utf8',
);
window.document.head.append(style);
for (const name of [
  'window',
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'Element',
  'Node',
  'NodeFilter',
  'DocumentFragment',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'FocusEvent',
  'MutationObserver',
  'ResizeObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  const value = name === 'window' ? window : window[name];
  Object.defineProperty(globalThis, name, {
    value:
      typeof value === 'function' && !/^[A-Z]/.test(name)
        ? value.bind(window)
        : value,
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h } = await import('react');
const { render, screen, cleanup, within, waitFor } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');

const { defaults } = await import('../lib/cms-defaults.ts');
const { contentPageSizes } = await import('../lib/content-page-sizes.ts');
const { paginateItems } = await import('../components/content-pagination.tsx');
const { ContentProvider } = await import('../components/content-provider.tsx');
const { AiNotebook } = await import('../components/ai-notebook.tsx');
const { ResearchHub } = await import('../components/research-hub.tsx');
const { Bookshelf } = await import('../components/bookshelf.tsx');
const { ProjectShowcase } = await import('../components/project-showcase.tsx');
const { default: StoriesPage } = await import('../components/stories-page.tsx');
const { monthSummary } = await import('../lib/story-calendar.ts');
const user = userEvent.setup({ document: window.document });
const realFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({groups:[],modelCount:0,fetchedAt:'2026-09-30',stale:false,refreshFailed:false});
const mount = (component, content, props = {}) => render(h(ContentProvider,{content:{...defaults,...content}},h(component,props)));
const next = async (label) => user.click(within(screen.getByRole('navigation',{name:label})).getByRole('button',{name:'下一页'}));
const previous = async (label) => user.click(within(screen.getByRole('navigation',{name:label})).getByRole('button',{name:'上一页'}));
const categories = [{id:'parent',name:'父分类',parentId:''},{id:'child',name:'子分类',parentId:'parent'},{id:'other',name:'其他',parentId:''}];
try {
  assert.deepEqual(Object.values(contentPageSizes),[8,6,8,9,9,9,9,12,6]);
  for(const size of new Set(Object.values(contentPageSizes))) {
    for(const count of [0,size-1,size,size+1,size*2+1]) {
      const items=Array.from({length:count},(_,i)=>i);
      const merged=[];
      for(let page=1;page<=Math.max(1,Math.ceil(count/size));page++) merged.push(...paginateItems(items,page,size).items);
      assert.deepEqual(merged,items);
      assert.equal(paginateItems(items,100,size).currentPage,Math.max(1,Math.ceil(count/size)));
    }
  }
  for(const [collection,tabName,selector,label] of [
    ['agents','智能体','.ai-agent-card','智能体分页'],
    ['skills','技能 Skills','.ai-skill-row','技能分页'],
    ['relays','中转站 API','.ai-relay-card','中转站分页'],
  ]) {
    const ai=structuredClone(defaults.ai);
    ai.skillCategories=categories;
    ai[collection]=Array.from({length:19},(_,i)=>({...ai[collection][0],id:`${collection}-${i}`,name:`条目${i}`,title:`标题${i}`,categoryId:i<10?'child':'other'}));
    const view=mount(AiNotebook,{ai});
    await user.click(screen.getByRole('tab',{name:tabName,exact:true}));
    assert.equal(view.container.querySelectorAll(selector).length,9);
    assert.equal(within(screen.getByRole('navigation',{name:label})).getByRole('button',{name:'上一页'}).disabled,true);
    const first=[...view.container.querySelectorAll(selector)].map(el=>el.textContent);
    await next(label);
    const second=[...view.container.querySelectorAll(selector)].map(el=>el.textContent);
    assert.equal(second.length,9);
    assert.ok(second.every(text=>!first.includes(text)));
    await next(label); assert.equal(view.container.querySelectorAll(selector).length,1);
    assert.equal(within(screen.getByRole('navigation',{name:label})).getByRole('button',{name:'下一页'}).disabled,true);
    if(collection==='skills') {
      await user.click(screen.getByRole('button',{name:/父分类/}));
      assert.equal(view.container.querySelectorAll(selector).length,9);
      assert.match(screen.getByRole('navigation',{name:label}).textContent,/第 1 \/ 2 页/);
      await next(label); assert.equal(view.container.querySelectorAll(selector).length,1);
      await user.click(screen.getByRole('button',{name:/子分类/}));
      assert.equal(view.container.querySelectorAll(selector).length,9);
      await user.click(screen.getByRole('button',{name:/未分类/}));
      assert.equal(view.container.querySelectorAll(selector).length,0);
      assert.equal(screen.queryByRole('navigation',{name:label}),null);
    } else {
      view.rerender(h(ContentProvider,{content:{...defaults,ai:{...ai,[collection]:ai[collection].slice(0,2)}}},h(AiNotebook)));
      assert.equal(view.container.querySelectorAll(selector).length,2);
      assert.match(screen.getByRole('navigation',{name:label}).textContent,/第 1 \/ 1 页/);
    }
    cleanup();
  }
  console.log('PASS AI pages, parent/child filtering, empty state, boundaries and data shrink');
  const investing=structuredClone(defaults.investing);
  investing.sections=investing.sections.map((section,index)=>({...section,entries:Array.from({length:10},(_,i)=>({...section.entries[0],id:`entry-${i}`,title:`投资${index}-${i}`,createdAt:'2026-09-30T00:00:00Z'}))}));
  const investmentView=mount(ResearchHub,{investing});
  assert.equal(document.querySelectorAll('.investment-article-list button').length,9);
  await next('投资目录分页');
  assert.equal(document.querySelector('.investment-article-heading h2').textContent,document.querySelector('.investment-article-list button').textContent);
  for(const topic of investmentView.container.querySelectorAll('.investment-topic')) {
    await user.click(topic);
    assert.equal(document.querySelectorAll('.investment-article-list button').length,9);
    assert.match(screen.getByRole('navigation',{name:'投资目录分页'}).textContent,/第 1 \/ 2 页/);
    await next('投资目录分页');
    assert.equal(document.querySelectorAll('.investment-article-list button').length,1);
    assert.equal(document.querySelector('.investment-article-heading h2').textContent,document.querySelector('.investment-article-list button').textContent);
  }
  cleanup();
  console.log('PASS investment combined/category pages and reader selection');
  const books=structuredClone(defaults.books);
  books.categories=[{id:'a',name:'甲类'},{id:'b',name:'乙类'}];
  books.items=Array.from({length:25},(_,i)=>({...books.items[0],id:`book-${i}`,title:`书籍${i}`,author:`作者${i}`,categoryId:i<13?'a':'b'}));
  books.lists=Array.from({length:13},(_,i)=>({...books.lists[0],id:`list-${i}`,title:`书单${i}`,entries:Array.from({length:13},(_,j)=>({title:`书单书目${i}-${j}`,author:`书单作者${i}`}))}));
  mount(Bookshelf,{books});
  assert.equal(document.querySelectorAll('.reading-book').length,12);
  await next('书籍分页'); assert.equal(document.querySelectorAll('.reading-book').length,12);
  await next('书籍分页'); assert.equal(document.querySelectorAll('.reading-book').length,1);
  await user.click(screen.getByRole('button',{name:'甲类',exact:true}));
  assert.equal(document.querySelectorAll('.reading-book').length,12);
  await next('书籍分页'); assert.equal(document.querySelectorAll('.reading-book').length,1);
  await user.type(screen.getByRole('textbox',{name:'搜索书名或作者'}),'作者0');
  assert.equal(document.querySelectorAll('.reading-book').length,1);
  await user.click(screen.getByRole('button',{name:'清空搜索'}));
  assert.equal(document.querySelectorAll('.reading-book').length,12);
  await user.click(screen.getByRole('button',{name:/主题书单\s*13/}));
  assert.equal(document.querySelectorAll('.booklist-card').length,6);
  await next('主题书单分页');
  assert.equal(document.querySelectorAll('.booklist-card').length,6);
  assert.match(document.querySelector('.booklist-card-meta').textContent,/书单 \/ 07/);
  await user.click(document.querySelector('.booklist-card'));
  const dialog=await screen.findByRole('dialog');
  assert.equal(dialog.querySelectorAll('.booklist-reading-order li').length,13);
  await user.click(within(dialog).getByRole('button',{name:'关闭',exact:true}));
  await next('主题书单分页'); assert.equal(document.querySelectorAll('.booklist-card').length,1);
  await user.type(screen.getByRole('searchbox',{name:'搜索主题书单'}),'书单书目0-0');
  assert.equal(document.querySelectorAll('.booklist-card').length,1);
  assert.match(screen.getByRole('navigation',{name:'主题书单分页'}).textContent,/第 1 \/ 1 页/);
  await user.clear(screen.getByRole('searchbox',{name:'搜索主题书单'}));
  await next('主题书单分页');
  await user.click(screen.getByRole('button',{name:/全部书籍\s*25/}));
  await user.click(screen.getByRole('button',{name:/主题书单\s*13/}));
  assert.match(screen.getByRole('navigation',{name:'主题书单分页'}).textContent,/第 1 \/ 3 页/);
  cleanup();
  console.log('PASS books and booklists pages, search, view reset, continuous numbering and complete detail');
  const projects=structuredClone(defaults.projects);
  projects.items=Array.from({length:7},(_,i)=>({...projects.items[0],id:`project-${i}`,title:`项目${i}`,createdAt:'2026-09-30T00:00:00Z'}));
  mount(ProjectShowcase,{projects},{initialId:'project-6'});
  assert.equal(document.querySelectorAll('.folio-project').length,1);
  assert.equal(document.querySelector('.folio-title h2').textContent,'项目6');
  await previous('项目分页');
  assert.equal(document.querySelectorAll('.folio-project').length,6);
  assert.equal(document.querySelector('.folio-title h2').textContent,'项目0');
  cleanup();
  console.log('PASS project initial page location and selection on page change');
  mount(ProjectShowcase, { projects: { ...defaults.projects, items: [] } }, { initialId: '' });
  assert.ok(screen.getByRole('heading', { name: '暂无已发布项目' }));
  assert.ok(screen.getByRole('heading', { name: '从一个想法，到一件作品。' }));
  assert.equal(screen.queryByRole('button', { name: '查看全部项目' }), null);
  assert.equal(screen.queryByRole('navigation', { name: '项目分页' }), null);
  cleanup();
  const emptyArchive = {
    items: [], total: 0, yearlyCount: 0, latestPeriod: 2026 * 12 + 8,
    calendar: monthSummary([], 2026, 9),
  };
  const storyView = mount(StoriesPage, { slides: [] }, { initial: emptyArchive });
  assert.ok(within(storyView.container.querySelector('.story-feed')).getByRole('heading', { name: '暂无说说' }));
  assert.match(screen.getByText(/月还没有发布说说/).textContent, /2026 年 9 月/);
  assert.equal(screen.queryByRole('navigation', { name: '说说分页' }), null);
  globalThis.fetch = async () => Response.json({ ...emptyArchive, calendar: monthSummary([], 2026, 10) });
  await user.click(screen.getByRole('button', { name: '下一个月' }));
  await waitFor(() => assert.match(screen.getByText(/月还没有发布说说/).textContent, /2026 年 10 月/));
  globalThis.fetch = async () => new Response('', { status: 500 });
  await user.click(screen.getByRole('button', { name: '下一个月' }));
  await waitFor(() => assert.match(screen.getByRole('alert').textContent, /读取说说失败/));
  assert.equal(screen.queryByRole('heading', { name: '暂无说说' }), null);
  cleanup();
  mount(StoriesPage, { slides: [] }, { initial: { ...emptyArchive, items: defaults.stories.slice(0, 1), total: 1, yearlyCount: 1 } });
  assert.equal(document.querySelectorAll('.story-post').length, 1);
  assert.equal(screen.queryByRole('heading', { name: '暂无说说' }), null);
  cleanup();
  console.log('PASS project/story empty states, month navigation, error state and populated feed');
} finally {
  cleanup(); globalThis.fetch=realFetch; await window.happyDOM.abort();
}
// Isolate database fixtures: no network connection or persisted test data.
const { default: pg } = await import('pg');
const { getWritingArchive, getStoryArchive } = await import('../lib/cms-server.ts');
const databaseUrl = process.env.DATABASE_URL;
const originalMethods = Object.fromEntries(['connect','query','end'].map(name => [name, Object.getOwnPropertyDescriptor(pg.Client.prototype, name)]));
const originalWriting = defaults.writing;
const originalStories = defaults.stories;
const articles = Array.from({length:17},(_,i)=>({...originalWriting[0],slug:`server-article-${i}`,date:`2026.09.${String(30-i).padStart(2,'0')}`,_published:true}));
const stories = Array.from({length:17},(_,i)=>({...originalStories[0],id:`server-story-${i}`,date:`2026-09-${String(30-i).padStart(2,'0')}T12:00:00+08:00`,_published:true}));
let fallback = false;
const slices = [];
process.env.DATABASE_URL = 'postgres://isolated-pagination-test';
pg.Client.prototype.connect = async () => {};
pg.Client.prototype.end = async () => {};
pg.Client.prototype.query = async function(sql,params=[]) {
  if(sql.includes('SELECT 1 FROM cms_sections')) return {rowCount:fallback?0:1,rows:[]};
  if(sql.includes('FROM article_categories')) return {rows:defaults.categories.map(c=>({...c,parent_id:c.parentId || null}))};
  if(sql.includes('LIMIT $5 OFFSET $6')) {
    slices.push({kind:'writing',size:params[4],offset:params[5]});
    return {rows:articles.slice(params[5],params[5]+params[4])};
  }
  if(sql.includes('LIMIT $1 OFFSET $2')) {
    slices.push({kind:'stories',size:params[0],offset:params[1]});
    return {rows:stories.slice(params[1],params[1]+params[0]).map(payload=>({payload}))};
  }
  if(sql.includes('max(occurred_at)')) return {rows:[{date:new Date('2026-09-30T00:00:00Z')}]};
  if(sql.includes('GROUP BY')) return {rows:[]};
  if(sql.includes('count(*)')) return {rows:[{count:17}]};
  throw new Error('Unexpected test query');
};
try {
  for(const [kind,load,key] of [['writing',page=>getWritingArchive('','',page),'slug'],['stories',page=>getStoryArchive(page),'id']]) {
    const pages=await Promise.all([load(1),load(2),load(3)]);
    assert.deepEqual(pages.map(page=>page.items.length),[8,8,1]);
    assert.equal(new Set(pages.flatMap(page=>page.items.map(item=>item[key]))).size,17);
    assert.deepEqual(slices.filter(call=>call.kind===kind).map(({size,offset})=>[size,offset]),[[8,0],[8,8],[8,16]]);
  }
  fallback=true; defaults.writing=articles; defaults.stories=stories;
  for(const load of [page=>getWritingArchive('','',page),page=>getStoryArchive(page)]) {
    assert.deepEqual((await Promise.all([load(1),load(2),load(3)])).map(page=>page.items.length),[8,8,1]);
  }
  console.log('PASS server database LIMIT/OFFSET and default-data fallback pages');
} finally {
  Object.defineProperties(pg.Client.prototype,originalMethods);
  defaults.writing=originalWriting; defaults.stories=originalStories;
  if(databaseUrl===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=databaseUrl;
}
