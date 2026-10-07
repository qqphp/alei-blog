import { Window } from 'happy-dom';
import { register } from 'node:module';
import assert from 'node:assert/strict';

register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
for (const name of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement',
  'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLSelectElement',
  'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'Event', 'MouseEvent',
  'KeyboardEvent', 'PointerEvent', 'FocusEvent', 'MutationObserver', 'ResizeObserver',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  const value = name === 'window' ? window : window[name];
  Object.defineProperty(globalThis, name, { value: typeof value === 'function' && !/^[A-Z]/.test(name)
    ? value.bind(window) : value, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const { createElement, act, useState } = await import('react');
const { render, screen, waitFor, cleanup, within, fireEvent } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { AdminGranularPanel } = await import('../components/admin-granular-panel.tsx');
const { defaults, footerIconOptions } = await import('../lib/cms-defaults.ts');
const { SiteFooter } = await import('../components/site-chrome.tsx');
const { musicSample } = await import('../lib/music-content.ts');
const { Field, fresh, asJson } = await import('../components/admin-fields.tsx');
const { validateContent } = await import('../lib/cms-validation.ts');
const { AiNotebook } = await import('../components/ai-notebook.tsx');
const { ContentProvider } = await import('../components/content-provider.tsx');
const user = userEvent.setup({ document: window.document });
const calls = [];
const category = { id: 'ui-category', name: '测试分类', description: '已有说明', parentId: '' };
let categoryRevision = 1;
let addedCategory = null;
let article = { ...defaults.writing[0], slug: 'ui-granular', title: '原文章', body: '正文',
  excerpt: '摘要', categoryId: category.id, category: category.name,
  cover: '/notes/paper-v2.png', coverMode: 'upload', coverGeneratedFor: '',
  _published: false };
let articleRevision = 1;
let home = { ...defaults.home };
let homeRevision = 1;
function reorderConfigFields(value, saved) {
  if (Array.isArray(value)) return value.map((item) => reorderConfigFields(item, saved));
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  return Object.fromEntries((saved ? keys.sort() : keys.reverse())
    .map((key) => [key, reorderConfigFields(value[key], saved)]));
}
let site = { ...structuredClone(defaults.site), name: ' 自定义站点 ', description: '自定义说明\n第二行', footer: '自定义页脚' };
let siteRevision = 1;
let failNextConfigWrite = '';
let failNextWrite = false;
let story = { ...structuredClone(defaults.stories[0]), id: 'ui-story', text: '原说说',
  date: '2026-09-08T12:34:56+08:00', topics: [], images: [
    { src: '/stories-lake.png', alt: '湖面上的清晨薄雾' },
    { src: '/stories-coast.png', alt: '海边的灯塔' },
  ] };
let storyRevision = 1;
let failStoryImage = false;
const slide = { ...structuredClone(defaults.slides[0]), id: 'ui-slide', title: '原封面', alt: '原有封面描述' };
let addedSlide = null;
let failNextSlideWrite = false;
const project = { ...structuredClone(defaults.projects.items[0]), title: '原项目', subtitle: '项目副标题' };
const aiResources = Object.fromEntries(['agents', 'skills', 'relays'].map((collection) => [collection,
  { ...structuredClone(defaults.ai[collection][0]), id: `ui-${collection}`,
    href: `https://example.com/${collection}`,
    ...(collection === 'skills' ? { name: '原技能', title: '技能展示标题' } : { name: `原${collection}` }) }]));
const skillCategories = [{ id: 'skill-parent', name: '界面设计', parentId: '' },
  { id: 'skill-child', name: '页面生成', parentId: 'skill-parent' }];
const agentStatuses = structuredClone(defaults.ai.agentStatuses);
const directoryRecords = Object.fromEntries(['bookmarks', 'friends'].map((section) => [section, [{
  ...structuredClone(defaults[section].items[0]), id: `ui-${section}`,
  name: section === 'bookmarks' ? '原书签' : '原友链',
  url: `https://example.com/${section}`, description: '不应显示的说明',
  initials: section === 'bookmarks' ? '书' : '友', tags: ['原标签'],
}]]));
const directoryRevisions = { bookmarks: {}, friends: {} };
for (const section of ['bookmarks', 'friends']) directoryRevisions[section][`ui-${section}`] = 1;
const orderedRecords = {
  tracks: { items: { ...structuredClone(defaults.tracks.items[0]), id: 'ordered-track', title: '原音乐', artist: '测试音乐作者' },
    playlists: { ...structuredClone(musicSample.playlists[0]), id: 'ordered-playlist', title: '原歌单', color: '#123456' } },
  films: { items: { ...structuredClone(defaults.films.items[0]), id: 'ordered-film', title: '原电影', director: '测试导演' } },
  podcasts: { items: { ...structuredClone(defaults.podcasts.items[0]), id: 'ordered-podcast', title: '原播客', host: '测试专辑主播' } },
  travel: { items: { ...structuredClone(defaults.travel.items[0]), id: 'ordered-travel', title: '原旅行', description: '旅行说明', body: '不应显示的旅行正文' } },
  hobbies: { items: { ...structuredClone(defaults.hobbies.items[0]), id: 'ordered-hobby', title: '原爱好', description: '爱好说明', body: '不应显示的爱好正文' } },
  books: { items: { ...structuredClone(defaults.books.items[0]), id: 'ordered-book', title: '原书籍', author: '书籍作者' } },
};
let investment = { ...structuredClone(defaults.investing.sections[0].entries[0]), id: 'ui-investment',
  title: '原投资文章', description: '投资说明', sectionId: defaults.investing.sections[0].id,
  createdAt: '2026-09-08T01:02:03.000Z', updatedAt: '2026-09-09T01:02:03.000Z' };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost:3000');
  calls.push({ path: url.pathname, search: url.search, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
  if (url.pathname === '/api/admin/session')
    return Response.json({ authenticated: true, configured: true });
  if (url.pathname === '/api/admin/options/writing')
    return Response.json({ categories: [category] });
  if (url.pathname === '/api/admin/options/projects')
    return Response.json({ categories: defaults.projects.categories, statuses: defaults.projects.statuses });
  if (url.pathname === '/api/admin/options/bookmarks' || url.pathname === '/api/admin/options/friends')
    return Response.json({ categories: defaults[url.pathname.split('/').at(-1)].categories });
  if (url.pathname === '/api/admin/options/investing')
    return Response.json({ sections: defaults.investing.sections.map(({ id, title }) => ({ id, name: title })) });
  if (url.pathname === '/api/admin/options/ai') return Response.json({ agentStatuses, skillCategories });
  if (url.pathname.startsWith('/api/admin/options/')) return Response.json({});
  if (url.pathname === '/api/admin/ai' && init.method === 'POST')
    return failStoryImage ? Response.json({ error: '模拟生成失败，原图片已保留' }, { status: 502 })
      : Response.json({ url: '/api/media/story-generated.png',
        generatedFor: JSON.stringify([JSON.parse(init.body).description.trim()]) });
  if (url.pathname === '/api/admin/records/stories/root') {
    if (init.method === 'POST') { story = JSON.parse(init.body).value; return Response.json({ revision: 1 }); }
    return Response.json({ items: [{ id: story.id, title: story.text, excerpt: story.text, date: story.date,
      revision: storyRevision, published: story._published, position: 0 },
      { id: 'empty-story', title: '不应回退为标题', excerpt: '', date: null, revision: 1, position: 1 }],
      total: 2, page: 1, size: 20 });
  }
  if (url.pathname === '/api/admin/records/stories/root/ui-story') {
    if (init.method === 'PUT') { story = JSON.parse(init.body).value; storyRevision++; }
    return Response.json({ value: story, revision: storyRevision });
  }
  if (url.pathname === '/api/admin/records/slides/root') {
    if (init.method === 'POST') {
      if (failNextSlideWrite) { failNextSlideWrite = false; return Response.json({ error: '模拟保存失败' }, { status: 500 }); }
      addedSlide = JSON.parse(init.body).value; return Response.json({ revision: 1 });
    }
    const items = [slide, addedSlide].filter(Boolean).map((value, position) => ({
      id: value.id, title: value.title, excerpt: value.alt, revision: 1, position,
    }));
    return Response.json({ items, total: items.length, page: 1, size: 20 });
  }
  if (url.pathname === `/api/admin/records/slides/root/${slide.id}`)
    return Response.json({ value: slide, revision: 1 });
  if (url.pathname === '/api/admin/records/projects/items') {
    if (init.method === 'POST') {
      if (!JSON.parse(init.body).value.images.length)
        return Response.json({ error: '项目至少需要一张图片' }, { status: 400 });
      return Response.json({ revision: 1 });
    }
    return Response.json({ items: [{ id: project.id, title: project.title, excerpt: project.subtitle, revision: 1,
      published: project._published, position: 0 }], total: 1, page: 1, size: 20 });
  }
  if (url.pathname === `/api/admin/records/projects/items/${project.id}`)
    return Response.json({ value: Object.fromEntries(Object.entries(project).reverse()), revision: 1 });
  for (const section of ['bookmarks', 'friends']) {
    const base = `/api/admin/records/${section}/items`;
    if (url.pathname === base) {
      if (init.method === 'POST') {
        const value = JSON.parse(init.body).value;
        directoryRecords[section].unshift(value);
        directoryRevisions[section][value.id] = 1;
        return Response.json({ revision: 1 });
      }
      return Response.json({ items: directoryRecords[section].map((value, position) => ({
        id: value.id, title: value.name, excerpt: value.url, revision: directoryRevisions[section][value.id], position,
      })), total: directoryRecords[section].length, page: 1, size: 20 });
    }
    if (url.pathname.startsWith(`${base}/`)) {
      const id = url.pathname.slice(base.length + 1);
      let value = directoryRecords[section].find((item) => item.id === id);
      if (init.method === 'PUT') {
        value = JSON.parse(init.body).value;
        directoryRecords[section] = directoryRecords[section].map((item) => item.id === id ? value : item);
        directoryRevisions[section][id]++;
      }
      return Response.json({ value: Object.fromEntries(Object.entries(value).reverse()),
        revision: directoryRevisions[section][id] });
    }
  }
  for (const [collection, value] of Object.entries(aiResources)) {
    const base = `/api/admin/records/ai/${collection}`;
    if (url.pathname === base)
      return Response.json({ items: [{ id: value.id, title: collection === 'skills' ? value.name : value.title ?? value.name,
        excerpt: value.href, revision: 1,
        published: value._published, position: 0 }], total: 1, page: 1, size: 20 });
    if (url.pathname === `${base}/${value.id}`) return Response.json({ value, revision: 1 });
  }
  if (url.pathname === '/api/admin/records/ai/skillCategories')
    return Response.json({ items: skillCategories.map((item, position) => ({
      id: item.id, title: item.name, revision: 1, position })),
      total: skillCategories.length, page: 1, size: 20 });
  if (url.pathname.startsWith('/api/admin/records/ai/skillCategories/')) {
    const category = skillCategories.find((item) => url.pathname.endsWith(`/${item.id}`));
    return Response.json({ value: category, revision: 1 });
  }
  if (url.pathname === '/api/admin/records/ai/agentStatuses') {
    if (init.method === 'POST') { agentStatuses.push(JSON.parse(init.body).value); return Response.json({ revision: 1 }); }
    return Response.json({ items: agentStatuses.map((item, position) => ({
      id: item.id, title: item.name, revision: 1, position })),
      total: agentStatuses.length, page: 1, size: 20 });
  }
  if (url.pathname.startsWith('/api/admin/records/ai/agentStatuses/')) {
    const item = agentStatuses.find((status) => url.pathname.endsWith(`/${status.id}`));
    return Response.json({ value: item, revision: 1 });
  }
  for (const [section, collections] of Object.entries(orderedRecords)) {
    for (const [collection, value] of Object.entries(collections)) {
      const base = `/api/admin/records/${section}/${collection}`;
      if (url.pathname === base) {
        const subtitle = { tracks: 'artist', films: 'director', podcasts: 'host', travel: 'description', hobbies: 'description', books: 'author' }[section];
        const items = [{ id: value.id, title: value.title, excerpt: subtitle ? value[subtitle] : undefined,
          revision: 1, published: value._published, position: 0 }];
        if (section === 'hobbies' && collection === 'items')
          items.push({ id: 'empty-hobby', title: '空说明爱好', excerpt: '', revision: 1, published: false, position: 1 });
        if (section === 'books' && collection === 'items')
          items.push({ id: 'empty-book', title: '空作者书籍', excerpt: '', revision: 1, published: false, position: 1 });
        return Response.json({ items, total: items.length, page: 1, size: 20 });
      }
      if (url.pathname === `${base}/${value.id}`) {
        if (init.method === 'PUT') Object.assign(value, JSON.parse(init.body).value);
        return Response.json({ value: Object.fromEntries(Object.entries(value).reverse()), revision: 1 });
      }
    }
  }
  if (url.pathname === '/api/admin/records/investing/entries')
    return Response.json({ items: [{ id: investment.id, title: investment.title, excerpt: investment.description, revision: 1,
      createdAt: investment.createdAt, updatedAt: investment.updatedAt,
      published: investment._published, position: 0 }], total: 1, page: 1, size: 20 });
  if (url.pathname === `/api/admin/records/investing/entries/${investment.id}`) {
    if (init.method === 'PUT') investment = JSON.parse(init.body).value;
    return Response.json({ value: investment, revision: 1 });
  }
  if (url.pathname === '/api/admin/records/writing/articles') {
    if (init.method === 'POST') return Response.json({ revision: 1 });
    return Response.json({ items: [{ id: article.slug, title: article.title,
      excerpt: article.excerpt, revision: articleRevision, published: article._published,
      position: 0 }], total: 1, page: 1, size: 20 });
  }
  if (url.pathname === '/api/admin/records/writing/articles/ui-granular') {
    if (init.method === 'PUT') {
      if (failNextWrite) { failNextWrite = false; return Response.json({ error: '此记录已在另一窗口修改' }, { status: 409 }); }
      article = init.body ? JSON.parse(init.body).value : article;
      articleRevision++;
      return Response.json({ revision: articleRevision, value: article });
    }
    if (init.method === 'PATCH') {
      article = { ...article, _published: JSON.parse(init.body).published };
      articleRevision++;
      return Response.json({ revision: articleRevision, value: article });
    }
    return Response.json({ value: article, revision: articleRevision });
  }
  if (url.pathname === '/api/admin/records/writing/categories') {
    if (init.method === 'POST') { addedCategory = JSON.parse(init.body).value; return Response.json({ revision: 1 }); }
    const page = Number(url.searchParams.get('page') ?? 1);
    const items = (page === 1 ? [addedCategory, category] : [category]).filter(Boolean).map((value, position) => ({
      id: value.id, title: value.name, revision: value === category ? categoryRevision : 1, position,
    }));
    return Response.json({ items, total: 21, page, size: 20 });
  }
  if (url.pathname === `/api/admin/records/writing/categories/${category.id}`) {
    if (init.method === 'PUT') { Object.assign(category, JSON.parse(init.body).value); categoryRevision++; }
    return Response.json({ value: category, revision: categoryRevision });
  }
  if (['/api/admin/config/site/root', '/api/admin/config/home/root'].includes(url.pathname)) {
    const isSite = url.pathname.includes('/site/');
    if (init.method === 'PUT') {
      if (failNextConfigWrite) {
        const conflict = failNextConfigWrite === 'conflict';
        failNextConfigWrite = '';
        return Response.json({ error: conflict ? '此设置已在另一窗口修改' : '保存失败' }, { status: conflict ? 409 : 500 });
      }
      const body = JSON.parse(init.body);
      if (body.revision !== (isSite ? siteRevision : homeRevision))
        return Response.json({ error: '此设置已在另一窗口修改' }, { status: 409 });
      if (isSite) { site = body.value; siteRevision++; }
      else { home = body.value; homeRevision++; }
    }
    return Response.json({ value: reorderConfigFields(isSite ? site : home, init.method === 'PUT'),
      revision: isSite ? siteRevision : homeRevision,
      ...(isSite ? { seoEnvironment: { siteUrl: 'https://blog.example.test', indexable: false } } : {}) });
  }
  return Response.json({ items: [], total: 0, page: 1, size: 20 });
};

try {
  render(createElement(AdminGranularPanel));
  await screen.findByRole('button', { name: '原文章' });
  assert.equal(calls.some((call) => call.path === '/api/admin/content'), false);
  const nav = screen.getByRole('navigation', { name: '后台栏目' });
  assert.deepEqual(within(nav).getAllByRole('button').slice(0, 6).map((node) => node.textContent), ['写作', '项目', '说说', 'AI', '投资', '关于']);
  assert.equal(within(nav).queryByRole('button', { name: '提示词便签' }), null);
  assert.equal(within(nav).queryByRole('button', { name: '说说封面' }), null);
  assert.equal(within(nav).queryByRole('button', { name: '站点与导航' }), null);
  assert.equal(within(nav).queryByRole('button', { name: '首页', exact: true }), null);
  assert.equal(within(nav).getByRole('button', { name: '网站设置' }).parentElement.textContent, '设置AI 大模型设置网站设置');
  for (const label of ['导出内容备份', '导入此栏目', '重新载入', '保存栏目'])
    assert.equal(screen.queryByText(label), null, label);
  assert.equal(window.document.querySelector('.admin-toolbar'), null);
  const immediateFetch = globalThis.fetch;
  let finishDetail;
  globalThis.fetch = async (input, init) => {
    if (input === '/api/admin/records/writing/articles/ui-granular')
      await new Promise((done) => { finishDetail = done; });
    return immediateFetch(input, init);
  };
  await user.click(screen.getByRole('button', { name: '原文章' }));
  const categoryTab = screen.getByRole('tab', { name: '文章分类' });
  assert.equal(categoryTab.disabled, true, '详情未返回时不可切换表单');
  await user.click(categoryTab);
  assert.equal(screen.getByRole('tab', { name: '文章管理' }).getAttribute('aria-selected'), 'true');
  await act(async () => finishDetail());
  globalThis.fetch = immediateFetch;
  await screen.findByLabelText('文章标题');
  assert.equal(screen.queryByLabelText('或使用已有素材地址'), null);
  assert.ok(screen.getByLabelText('上传替换'));
  assert.equal(screen.getByLabelText('素材地址').value, article.cover);
  assert.equal(screen.queryByRole('img', { name: '当前文章封面' }), null);
  for (const label of ['创建时间', '最后更新时间', '发布日期', '文章路径标识'])
    assert.equal(screen.queryByText(label), null, `文章表单隐藏 ${label}`);
  assert.equal(screen.getAllByRole('checkbox').at(-1), screen.getByRole('checkbox', { name: /发布到前台/ }));
  assert.equal(screen.queryByRole('radio', { name: '草稿' }), null);
  const markdown = await screen.findByRole('textbox', { name: '文章正文 Markdown' });
  await user.click(screen.getByText('搜索展示（可选）'));
  assert.equal(screen.getByLabelText('SEO 标题').maxLength, 200);
  assert.equal(screen.getByLabelText('SEO 描述').maxLength, 1000);
  await user.type(screen.getByLabelText('SEO 标题'), '独立搜索标题');
  await user.type(screen.getByLabelText('SEO 描述'), '独立搜索描述');
  assert.match(screen.getByLabelText('搜索展示预览').textContent, /独立搜索标题.*自定义站点/);
  await user.type(markdown, '\n\n## 按需编辑测试');
  await user.click(screen.getByRole('button', { name: '预览', exact: true }));
  assert.ok(screen.getByRole('heading', { name: '按需编辑测试', exact: true }));
  await user.click(screen.getByRole('button', { name: '预览', exact: true }));
  assert.ok(screen.getByRole('textbox', { name: '文章正文 Markdown' }).value.includes('按需编辑测试'));
  await user.click(screen.getByRole('button', { name: '编辑 & 预览', exact: true }));
  await user.type(screen.getByLabelText('文章标题'), '已修改');
  assert.equal(calls.filter((call) => call.method === 'PUT').length, 0,
    '输入字段时不能自动保存');
  assert.ok(screen.getByRole('button', { name: '确认提交' }).closest('.admin-form-actions'));
  let finishWrite;
  globalThis.fetch = async (input, init) => {
    if (init?.method === 'PUT') await new Promise((done) => { finishWrite = done; });
    return immediateFetch(input, init);
  };
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  assert.equal(screen.getByRole('button', { name: '← 返回列表' }).disabled, true);
  assert.equal(screen.getByRole('tab', { name: '文章分类' }).disabled, true);
  assert.equal(within(nav).getByRole('button', { name: '项目' }).disabled, true);
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  assert.ok(screen.getByLabelText('文章标题'));
  await act(async () => finishWrite());
  globalThis.fetch = immediateFetch;
  await waitFor(() => assert.equal(article.title, '原文章已修改'));
  const write = calls.find((call) => call.method === 'PUT' && call.path.includes('/records/'));
  assert.equal(Array.isArray(write.body.value), false);
  assert.equal(write.body.value.slug, 'ui-granular');
  assert.equal(write.body.value.cover, '/notes/paper-v2.png', '修改正文时保留原封面');
  assert.ok(write.body.value.body.includes('## 按需编辑测试'), '按需加载后的正文修改必须随表单保存');
  assert.equal(write.body.value.seoTitle, '独立搜索标题');
  assert.equal(write.body.value.seoDescription, '独立搜索描述');
  assert.equal(Object.hasOwn(write.body, 'key'), false);
  await screen.findByRole('button', { name: '原文章已修改' });
  await user.click(screen.getByRole('button', { name: '发布' }));
  await waitFor(() => assert.equal(article._published, true));
  assert.ok(calls.some((call) => call.method === 'PATCH'));
  await user.click(screen.getByRole('button', { name: '＋ 新增文章管理' }));
  assert.equal(screen.queryByLabelText('或使用已有素材地址'), null);
  for (const label of ['创建时间', '最后更新时间', '发布日期', '文章路径标识'])
    assert.equal(screen.queryByText(label), null, `新增文章表单隐藏 ${label}`);
  assert.equal(calls.some((call) => call.method === 'POST' && call.path.includes('/records/')), false);
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  assert.equal(calls.some((call) => call.method === 'POST' && call.path.includes('/records/')), false);
  await user.click(screen.getByRole('tab', { name: '文章分类' }));
  await screen.findByRole('button', { name: '测试分类' });
  await user.click(screen.getByRole('button', { name: '下一页' }));
  await screen.findByText('第 2 / 2 页');
  await user.click(screen.getByRole('button', { name: '＋ 新增文章分类' }));
  assert.deepEqual([...window.document.querySelectorAll('.admin-article-category > .admin-fields > .admin-field > label')]
    .map((node) => node.textContent), ['名称', '上级分类', '说明']);
  assert.equal(screen.getByLabelText('名称').value, '');
  assert.equal(screen.getByLabelText('说明').value, '');
  await user.type(screen.getByLabelText('名称'), '新增分类');
  await user.type(screen.getByLabelText('说明'), '新增说明');
  const beforeCategorySave = calls.length;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '新增分类' });
  assert.ok(calls.slice(beforeCategorySave).some((call) => call.method === 'GET' &&
    call.path === '/api/admin/records/writing/categories' && new URLSearchParams(call.search).get('page') === '1'),
  '新增成功后应返回列表第一页');
  assert.equal(addedCategory.description, '新增说明');
  await user.click(screen.getByRole('button', { name: '测试分类' }));
  await screen.findByLabelText('上级分类');
  assert.equal(screen.getByLabelText('说明').value, '已有说明');
  await user.type(screen.getByLabelText('名称'), '已修改');
  await user.type(screen.getByLabelText('说明'), '已更新');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '测试分类已修改' });
  assert.equal(category.description, '已有说明已更新');
  assert.equal(calls.find((call) => call.method === 'PUT' && call.path.includes('/writing/categories/')).body.value.description, '已有说明已更新');
  await user.click(screen.getByRole('button', { name: '测试分类已修改' }));
  await screen.findByLabelText('上级分类');
  assert.equal(screen.getByLabelText('名称').value, '测试分类已修改');
  assert.equal(screen.getByLabelText('说明').value, '已有说明已更新');
  await user.click(within(nav).getByRole('button', { name: '项目' }));
  await user.click(screen.getByRole('tab', { name: '状态' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增状态' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  await user.click(screen.getByRole('tab', { name: '分类' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增分类' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  await user.click(within(nav).getByRole('button', { name: '网站设置' }));
  await screen.findByLabelText('站点标记');
  assert.ok(screen.getByRole('heading', { name: '网站设置' }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['站点', 'SEO', '导航', '首页', '页脚', '邮箱设置']);
  assert.equal(screen.getByRole('tab', { name: '站点' }).getAttribute('aria-selected'), 'true');
  assert.equal(screen.getByRole('link', { name: '查看前台 ↗' }).getAttribute('href'), '/');
  const settingsLabels = () => [...window.document.querySelectorAll('.admin-form label')].map((node) => node.textContent);
  const siteLabels = ['名称', '站点标记'];
  const homeLabels = ['眉题', '标题', '说明', '正在开发', '正在写作', '正在探索', '主视觉右上英文', '主视觉右下英文', '说说区标题', '说说区说明', '说说装饰英文'];
  const assertNavigationOrder = () => {
    assert.deepEqual([...window.document.querySelectorAll('.admin-form .admin-array > legend')]
      .map((node) => node.childNodes[0].textContent.trim()), ['主导航', '网站导航', '生活导航']);
    for (const item of window.document.querySelectorAll('.admin-form .admin-nested'))
      assert.deepEqual([...item.querySelectorAll('label')].map((node) => node.textContent), ['名称', '链接地址']);
  };
  assert.deepEqual(settingsLabels(), siteLabels);
  assert.equal(screen.getByLabelText('名称').value, ' 自定义站点 ');
  assert.equal(screen.queryByLabelText('说明'), null);
  const originalSite = structuredClone(site);
  const writesBeforeSettings = calls.filter((call) => call.method === 'PUT').length;
  await user.type(screen.getByLabelText('名称'), '已修改');
  assert.equal(calls.filter((call) => call.method === 'PUT').length, writesBeforeSettings);
  window.confirm = () => false;
  await user.click(screen.getByRole('tab', { name: '导航' }));
  await user.click(within(nav).getByRole('button', { name: '写作' }));
  assert.equal(screen.getByRole('tab', { name: '站点' }).getAttribute('aria-selected'), 'true');
  assert.ok(screen.getByLabelText('名称').value.endsWith('已修改'));
  window.confirm = () => true;
  failNextConfigWrite = 'failure';
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByText(/保存失败/);
  assert.deepEqual(settingsLabels(), siteLabels);
  assert.deepEqual(site, originalSite);
  assert.ok(screen.getByLabelText('名称').value.endsWith('已修改'));
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(site.name, ' 自定义站点 已修改'));
  await waitFor(() => assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true));
  assert.deepEqual(settingsLabels(), siteLabels);
  assert.equal(screen.getByLabelText('名称').value, site.name);
  for (const key of ['links', 'sites', 'life']) assert.deepEqual(site[key], originalSite[key]);
  const savedSite = structuredClone(site);
  await user.click(screen.getByRole('tab', { name: '导航' }));
  const mainNav = await screen.findByRole('group', { name: /^主导航/ });
  assertNavigationOrder();
  assert.deepEqual(screen.getAllByRole('group').filter((node) => node.tagName === 'FIELDSET').map((node) => node.querySelector('legend').childNodes[0].textContent.trim()),
    ['主导航', '网站导航', '生活导航']);
  assert.equal(screen.queryByLabelText('站点标记'), null);
  assert.equal(screen.queryByLabelText('页脚文字'), null);
  await user.click(mainNav.querySelector('summary'));
  await user.type(within(mainNav).getAllByLabelText('名称')[0], '修改');
  await user.type(within(mainNav).getAllByLabelText('链接地址')[0], '?from=settings');
  await user.click(within(mainNav).getAllByRole('button', { name: '下移' })[0]);
  await user.click(within(mainNav).getAllByRole('button', { name: '上移' })[1]);
  await user.click(within(mainNav).getByRole('button', { name: '＋ 添加一项' }));
  await user.click(mainNav.querySelector('details:last-of-type summary'));
  await user.clear(within(mainNav).getAllByLabelText('名称').at(-1));
  await user.type(within(mainNav).getAllByLabelText('名称').at(-1), '新增导航');
  await user.type(within(mainNav).getAllByLabelText('链接地址').at(-1), '/about');
  await user.click(within(mainNav).getAllByRole('button', { name: '删除' })[1]);
  assert.deepEqual(site, savedSite, '导航操作需确认提交后生效');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(site.links.at(-1).name, '新增导航'));
  await waitFor(() => assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true));
  assertNavigationOrder();
  assert.equal(site.links[0].name, `${originalSite.links[0].name}修改`);
  assert.equal(site.links[0].href, `${originalSite.links[0].href}?from=settings`);
  assert.equal(site.links.length, originalSite.links.length);
  for (const key of Object.keys(savedSite).filter((key) => key !== 'links'))
    assert.deepEqual(site[key], savedSite[key], `${key} 不应被导航保存改变`);
  await user.type(within(mainNav).getAllByLabelText('名称')[0], '冲突输入');
  const beforeConflict = structuredClone(site);
  siteRevision++;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByText(/此设置已在另一窗口修改/);
  assertNavigationOrder();
  assert.deepEqual(site, beforeConflict);
  assert.ok(within(mainNav).getAllByLabelText('名称')[0].value.endsWith('冲突输入'));
  await user.click(screen.getByRole('tab', { name: '站点' }));
  await screen.findByLabelText('站点标记');
  assert.equal(screen.getByLabelText('名称').value, savedSite.name);
  assert.deepEqual(settingsLabels(), siteLabels);
  await user.click(screen.getByRole('tab', { name: 'SEO' }));
  await screen.findByLabelText('首页 SEO 标题');
  assert.equal(screen.getByLabelText('首页 SEO 描述').value, site.description);
  assert.equal(screen.getByLabelText('默认分享图片').value, '');
  assert.ok(screen.getByText('https://blog.example.test'));
  assert.ok(screen.getByText('不允许收录'));
  assert.equal(screen.queryByLabelText('站点标记'), null);
  await user.type(screen.getByLabelText('分享图片说明'), '分享图说明');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(site.defaultShareImageAlt, '分享图说明'));
  assert.equal(site.title, beforeConflict.title);
  assert.equal(site.description, beforeConflict.description);
  beforeConflict.defaultShareImageAlt = site.defaultShareImageAlt;
  screen.getByRole('tab', { name: '首页' }).focus();
  await user.keyboard('[Enter]');
  await screen.findByLabelText('标题');
  assert.deepEqual(settingsLabels(), homeLabels);
  await user.type(screen.getByLabelText('标题'), ' 测试');
  await user.type(screen.getByLabelText('正在开发'), '开发近况测试');
  await user.type(screen.getByLabelText('正在写作'), '写作近况测试');
  await user.type(screen.getByLabelText('正在探索'), '探索近况测试');
  await user.clear(screen.getByLabelText('主视觉右上英文'));
  await user.type(screen.getByLabelText('主视觉右上英文'), 'Build\nTogether');
  assert.equal(home.title, defaults.home.title);
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.ok(home.title.endsWith(' 测试')));
  await waitFor(() => assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true));
  assert.deepEqual(settingsLabels(), homeLabels);
  assert.equal(screen.getByLabelText('标题').value, home.title);
  assert.equal(home.nowBuilding, '开发近况测试');
  assert.equal(home.nowWriting, '写作近况测试');
  assert.equal(home.nowExploring, '探索近况测试');
  assert.equal(home.heroArtTopText, 'Build\nTogether');
  assert.deepEqual(site, beforeConflict, '首页保存不能改变站点或导航');
  await user.click(screen.getByRole('tab', { name: '导航' }));
  await screen.findByRole('group', { name: /^主导航/ });
  assertNavigationOrder();
  assert.ok(screen.getByText('新增导航'));
  await user.click(screen.getByRole('tab', { name: '首页' }));
  await screen.findByLabelText('标题');
  assert.equal(screen.getByLabelText('标题').value, home.title);
  assert.deepEqual(settingsLabels(), homeLabels);
  assert.equal(screen.getByLabelText('正在开发').value, home.nowBuilding);
  await user.clear(screen.getByLabelText('正在开发'));
  await user.clear(screen.getByLabelText('正在写作'));
  await user.clear(screen.getByLabelText('正在探索'));
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(home.nowBuilding, ''));
  assert.equal(home.nowWriting, '');
  assert.equal(home.nowExploring, '');
  await user.click(screen.getByRole('tab', { name: '页脚' }));
  await screen.findByLabelText('页脚文字');
  const siteBeforeFooter = structuredClone(site);
  const homeBeforeFooter = structuredClone(home);
  assert.equal(screen.getByLabelText('页脚文字').value, site.footer);
  const footerNav = screen.getByRole('group', { name: /^页脚导航/ });
  await user.click(within(footerNav).getByRole('button', { name: '＋ 添加一项' }));
  await user.click(footerNav.querySelector('summary'));
  await user.clear(within(footerNav).getByLabelText('名称'));
  await user.type(within(footerNav).getByLabelText('名称'), '独立页脚导航');
  await user.type(within(footerNav).getByLabelText('链接地址'), '/projects');
  const socials = screen.getByRole('group', { name: /^社交入口/ });
  await user.click(within(socials).getByRole('button', { name: '＋ 添加一项' }));
  await user.click(socials.querySelector('summary'));
  await user.clear(within(socials).getByLabelText('名称'));
  await user.type(within(socials).getByLabelText('名称'), '测试RSS');
  assert.deepEqual(Array.from(within(socials).getByLabelText('图标').options)
    .filter((option) => option.value).map((option) => option.value), footerIconOptions.map((option) => option.id));
  await user.selectOptions(within(socials).getByLabelText('图标'), 'rss');
  await user.type(within(socials).getByLabelText('链接地址'), 'https://example.com/rss');
  await user.clear(screen.getByLabelText('页脚右下角短句'));
  await user.type(screen.getByLabelText('页脚右下角短句'), 'Keep building.');
  assert.deepEqual(site, siteBeforeFooter, '页脚操作须确认提交后生效');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(site.footerMotto, 'Keep building.'));
  assert.deepEqual(site.footerLinks, [{ name: '独立页脚导航', href: '/projects' }]);
  assert.deepEqual(site.footerSocialLinks, [{ name: '测试RSS', icon: 'rss', href: 'https://example.com/rss' }]);
  for (const key of ['name', 'mark', 'title', 'description', 'links', 'sites', 'life'])
    assert.deepEqual(site[key], siteBeforeFooter[key]);
  assert.deepEqual(home, homeBeforeFooter);
  await user.click(screen.getByRole('tab', { name: '站点' }));
  await screen.findByLabelText('站点标记');
  await user.click(screen.getByRole('tab', { name: '页脚' }));
  await screen.findByLabelText('页脚右下角短句');
  assert.equal(screen.getByLabelText('页脚右下角短句').value, 'Keep building.');
  for (const { id } of footerIconOptions.slice(6)) {
    const socialGroup = screen.getByRole('group', { name: /^社交入口/ });
    const details = socialGroup.querySelector('details');
    if (!details.open) await user.click(details.querySelector('summary'));
    await user.selectOptions(within(socialGroup).getByLabelText('图标'), id);
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    await waitFor(() => assert.equal(site.footerSocialLinks[0].icon, id));
    await user.click(screen.getByRole('tab', { name: '站点' }));
    await screen.findByLabelText('站点标记');
    await user.click(screen.getByRole('tab', { name: '页脚' }));
    await screen.findByLabelText('页脚右下角短句');
    const reloadedSocials = screen.getByRole('group', { name: /^社交入口/ });
    await user.click(reloadedSocials.querySelector('summary'));
    assert.equal(within(reloadedSocials).getByLabelText('图标').value, id);
  }
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '写作' }));
  await screen.findByRole('button', { name: '原文章已修改' });
  await user.click(within(nav).getByRole('button', { name: '网站设置' }));
  await screen.findByLabelText('站点标记');
  assert.equal(screen.getByRole('tab', { name: '站点' }).getAttribute('aria-selected'), 'true');
  await user.type(screen.getByLabelText('名称'), '放弃输入');
  await user.click(screen.getByRole('tab', { name: '导航' }));
  await screen.findByRole('group', { name: /^主导航/ });
  await user.click(screen.getByRole('tab', { name: '站点' }));
  await screen.findByLabelText('站点标记');
  assert.equal(screen.getByLabelText('名称').value, savedSite.name, '确认切换应放弃未提交修改');
  await user.click(within(nav).getByRole('button', { name: '写作' }));
  await screen.findByRole('button', { name: '原文章已修改' });
  await user.click(screen.getByRole('button', { name: '原文章已修改' }));
  await screen.findByLabelText('文章标题');
  await user.type(screen.getByLabelText('文章标题'), ' 未提交');
  failNextWrite = true;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByText(/此记录已在另一窗口修改/);
  assert.ok(screen.getByLabelText('文章标题').value.endsWith(' 未提交'),
    '冲突后必须保留表单内容');
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '音乐' }));
  await user.click(screen.getByRole('tab', { name: '歌单' }));
  assert.ok(screen.getByRole('button', { name: '＋ 新增歌单' }));
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '说说', exact: true }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['说说', '说说封面']);
  await user.click(screen.getByRole('tab', { name: '说说封面' }));
  await waitFor(() => assert.ok(calls.some((call) => call.path === '/api/admin/records/slides/root')));
  const slideRow = screen.getByRole('button', { name: '原封面' }).closest('tr');
  assert.equal(slideRow.querySelector('small').textContent, '原有封面描述');
  await user.click(screen.getByRole('button', { name: '原封面' }));
  await screen.findByLabelText('标题');
  assert.deepEqual([...window.document.querySelectorAll('.admin-slide-cover > .admin-fields > .admin-field > label')]
    .slice(0, 3).map((node) => node.textContent), ['标题', '素材地址', '图片描述']);
  const savedCoverView = ['宽度', '高度', '图片取景位置'].map((label) => screen.getByLabelText(label).value);
  globalThis.fetch = async (input, init) => input === '/api/admin/media'
    ? Response.json({ url: '/api/media/edit-cover.png' }) : immediateFetch(input, init);
  await user.upload(screen.getByLabelText('上传替换'), new window.File(['image'], 'edit.png', { type: 'image/png' }));
  await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/edit-cover.png'));
  assert.deepEqual(['宽度', '高度', '图片取景位置'].map((label) => screen.getByLabelText(label).value),
    savedCoverView, '编辑已有封面上传时只替换素材地址');
  globalThis.fetch = immediateFetch;
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  await user.type(screen.getByRole('searchbox', { name: '搜索此列表' }), '原封面');
  await screen.findByText('清除筛选后可调整排序。');
  await user.click(screen.getByRole('button', { name: '＋ 新增说说封面' }));
  await screen.findByLabelText('素材地址');
  assert.deepEqual([...window.document.querySelectorAll('.admin-slide-cover > .admin-fields > .admin-field > label')]
    .slice(0, 3).map((node) => node.textContent), ['标题', '素材地址', '图片描述']);
  for (const label of ['标题', '素材地址', '图片描述', '宽度', '高度', '图片取景位置'])
    assert.equal(screen.getByLabelText(label).value, '', `新增说说封面不预填${label}`);
  assert.equal(screen.getByLabelText('宽度').type, 'number');
  assert.equal(screen.getByRole('checkbox', { name: /发布到前台/ }).checked, false);
  const originalImage = globalThis.Image;
  const originalObjectUrl = URL.createObjectURL.bind(URL);
  const originalRevokeUrl = URL.revokeObjectURL.bind(URL);
  globalThis.Image = class {
    naturalWidth = 1881;
    naturalHeight = 836;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  };
  URL.createObjectURL = () => 'blob:test-cover';
  URL.revokeObjectURL = () => {};
  let finishUpload;
  let failUpload = true;
  globalThis.fetch = async (input, init) => {
    if (input === '/api/admin/media') {
      if (failUpload) return Response.json({ error: '模拟上传失败' }, { status: 503 });
      await new Promise((done) => { finishUpload = done; });
      return Response.json({ url: '/api/media/1234-abcd.png' });
    }
    return immediateFetch(input, init);
  };
  await user.upload(screen.getByLabelText('上传替换'), new window.File(['image'], 'test.png', { type: 'image/png' }));
  await screen.findByText(/模拟上传失败/);
  for (const label of ['素材地址', '宽度', '高度', '图片取景位置'])
    assert.equal(screen.getByLabelText(label).value, '', `上传失败不修改${label}`);
  failUpload = false;
  await user.upload(screen.getByLabelText('上传替换'), new window.File(['image'], 'test.png', { type: 'image/png' }));
  assert.equal(screen.getByRole('tab', { name: '说说', exact: true }).disabled, true);
  assert.equal(screen.getByRole('button', { name: '← 返回列表' }).disabled, true);
  assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true);
  assert.equal(within(nav).getByRole('button', { name: 'AI', exact: true }).disabled, true);
  await act(async () => finishUpload());
  globalThis.fetch = immediateFetch;
  globalThis.Image = originalImage;
  URL.createObjectURL = originalObjectUrl;
  URL.revokeObjectURL = originalRevokeUrl;
  await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/1234-abcd.png'));
  assert.equal(screen.getByLabelText('宽度').value, '1881');
  assert.equal(screen.getByLabelText('高度').value, '836');
  assert.equal(screen.getByLabelText('图片取景位置').value, 'center 55%');
  assert.equal(screen.getByRole('button', { name: '← 返回列表' }).disabled, false);
  await user.type(screen.getByLabelText('标题'), '新增封面');
  await user.type(screen.getByLabelText('图片描述'), '山间晨雾');
  failNextSlideWrite = true;
  const beforeFailedSlideSave = calls.length;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByText(/模拟保存失败/);
  assert.equal(screen.getByLabelText('标题').value, '新增封面');
  assert.equal(calls.slice(beforeFailedSlideSave).filter((call) => call.method === 'GET' &&
    call.path === '/api/admin/records/slides/root').length, 0, '保存失败应保留当前列表请求状态');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  const newSlideRow = (await screen.findByRole('button', { name: '新增封面' })).closest('tr');
  assert.equal(screen.getByRole('searchbox', { name: '搜索此列表' }).value, '');
  assert.ok(calls.slice(beforeFailedSlideSave).some((call) => call.method === 'GET' &&
    call.path === '/api/admin/records/slides/root' && new URLSearchParams(call.search).get('q') === ''),
  '新增成功后应清除搜索');
  assert.equal(newSlideRow.querySelector('small').textContent, '山间晨雾');
  assert.equal(addedSlide.alt, '山间晨雾');
  assert.equal(addedSlide.width, 1881);
  assert.equal(addedSlide.height, 836);
  assert.equal(addedSlide.position, 'center 55%');
  assert.equal(screen.getAllByRole('button', { name: '上移' }).at(-1).disabled, false);
  await user.selectOptions(screen.getByRole('combobox', { name: '按发布状态筛选' }), 'draft');
  await screen.findByText('清除筛选后可调整排序。');
  assert.ok(screen.getAllByRole('button', { name: '上移' }).every((button) => button.disabled));
  assert.ok(screen.getAllByRole('button', { name: '下移' }).every((button) => button.disabled));
  await user.selectOptions(screen.getByRole('combobox', { name: '按发布状态筛选' }), 'all');
  await waitFor(() => assert.equal(screen.queryByText('清除筛选后可调整排序。'), null));
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: 'AI', exact: true }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['智能体', '技能 Skills', '中转站 API', '智能体状态', 'Skills分类']);
  for (const [tab, collection, name] of [
    ['智能体', 'agents', '原agents'], ['技能 Skills', 'skills', '原技能'],
    ['中转站 API', 'relays', '原relays'],
  ]) {
    await user.click(screen.getByRole('tab', { name: tab }));
    const row = (await screen.findByRole('button', { name })).closest('tr');
    assert.equal(row.querySelector('td > small').textContent, `https://example.com/${collection}`);
    if (collection === 'skills') assert.equal(screen.queryByRole('button', { name: '技能展示标题' }), null);
  }
  await user.click(screen.getByRole('tab', { name: '智能体状态' }));
  await screen.findByRole('button', { name: '已上线' });
  await user.click(screen.getByRole('button', { name: '＋ 新增智能体状态' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  await user.type(screen.getByLabelText('名称'), '维护中');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '维护中' });
  await user.click(screen.getByRole('tab', { name: '智能体' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增智能体' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  assert.deepEqual([...window.document.querySelectorAll('.admin-form .admin-fields > .admin-field > label')]
    .slice(0, 4).map((node) => node.textContent), ['名称', '作者', '链接地址', 'Logo']);
  assert.equal(screen.getByLabelText('内容状态').value, '');
  assert.ok(screen.getByLabelText('内容状态').querySelector(`option[value="${agentStatuses.at(-1).id}"]`));
  await user.selectOptions(screen.getByLabelText('内容状态'), agentStatuses.at(-1).id);
  assert.ok(screen.getByLabelText('Logo').closest('.admin-resource-logo'));
  await user.type(screen.getByLabelText('名称'), '未保存资源');
  window.confirm = () => false;
  await user.click(screen.getByRole('tab', { name: '技能 Skills' }));
  assert.ok(screen.getByLabelText('名称').value.includes('未保存资源'));
  window.confirm = () => true;
  await user.click(screen.getByRole('tab', { name: '技能 Skills' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增技能 Skills' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  assert.equal(screen.getByLabelText('标题').value, '');
  assert.equal(screen.queryByLabelText('子分类'), null);
  assert.ok(screen.getByLabelText('分类').querySelector('option[value="skill-child"]'));
  assert.equal(screen.queryByLabelText('提示词'), null);
  await user.click(screen.getByRole('tab', { name: '中转站 API' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增中转站 API' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  assert.deepEqual([...window.document.querySelectorAll('.admin-form .admin-fields > .admin-field > label')]
    .slice(0, 4).map((node) => node.textContent), ['名称', '链接地址', 'Logo', '站点标记']);
  assert.ok(screen.getByLabelText('Logo').closest('.admin-resource-logo'));
  await user.click(screen.getByRole('tab', { name: 'Skills分类' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增Skills分类' }));
  assert.equal(screen.getByLabelText('名称').value, '');
  assert.ok(screen.getByLabelText('上级分类').querySelector('option[value="skill-parent"]'));
  assert.equal(screen.getByLabelText('上级分类').querySelector('option[value="skill-child"]'), null);
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  await user.click(screen.getByRole('tab', { name: '中转站 API' }));
  await user.click(await screen.findByRole('button', { name: '原relays' }));
  assert.equal((await screen.findByLabelText('名称')).value, '原relays');
  assert.ok(screen.getByLabelText('站点标记'));
  assert.ok(screen.getByLabelText('Logo').closest('.admin-resource-logo'));
  for (const [tab, label, title, stored] of [
    ['智能体', '名称', '原agents', '原agents'],
    ['技能 Skills', '标题', '原技能', '技能展示标题'],
  ]) {
    await user.click(screen.getByRole('tab', { name: tab }));
    await user.click(await screen.findByRole('button', { name: title }));
    assert.equal((await screen.findByLabelText(label)).value, stored);
    if (tab === '智能体') {
      assert.ok(screen.getByLabelText('作者'));
      assert.ok(screen.getByLabelText('Logo').closest('.admin-resource-logo'));
      assert.equal(screen.getByLabelText('内容状态').value, 'active');
      assert.deepEqual([...window.document.querySelectorAll('.admin-agent-resource > .admin-fields > .admin-field > label')]
        .slice(0, 4).map((node) => node.textContent), ['名称', '作者', '链接地址', 'Logo']);
    }
  }
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '投资', exact: true }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['文章', '栏目']);
  await user.click(screen.getByRole('button', { name: '＋ 新增文章' }));
  assert.equal(screen.getByLabelText('标题').value, '');
  for (const text of ['首次保存时自动记录', '添加时间', '最后更新时间']) assert.equal(screen.queryByText(text), null);
  assert.ok(screen.getByLabelText('栏目'));
  assert.equal(screen.queryByLabelText('添加时间'), null);
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  await screen.findByRole('button', { name: '原投资文章' });
  assert.equal(screen.getByRole('button', { name: '原投资文章' }).closest('tr').querySelector('td > small').textContent, '投资说明');
  assert.ok(screen.getByRole('columnheader', { name: '添加时间' }));
  assert.ok(screen.getByRole('columnheader', { name: '最后更新时间' }));
  await user.click(screen.getByRole('button', { name: '原投资文章' }));
  assert.equal((await screen.findByLabelText('标题')).value, '原投资文章');
  for (const text of ['添加时间', '最后更新时间']) assert.equal(screen.queryByText(text), null);
  await user.type(screen.getByLabelText('说明'), '修改说明');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '原投资文章' });
  assert.equal(investment.createdAt, '2026-09-08T01:02:03.000Z');
  await user.click(screen.getByRole('button', { name: '原投资文章' }));
  assert.ok((await screen.findByLabelText('说明')).value.endsWith('修改说明'));
  await user.click(screen.getByRole('tab', { name: '栏目' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增栏目' }));
  assert.equal(screen.getByLabelText('标题').value, '');
  assert.equal(screen.queryByLabelText('上级分类'), null);
  assert.equal(screen.queryByText('内容条目'), null);
  assert.equal(within(screen.getByRole('navigation', { name: '后台栏目' })).queryByRole('button', { name: '页面标题与配图', exact: true }), null);
  assert.equal(within(screen.getByRole('navigation', { name: '后台栏目' })).queryByRole('button', { name: '页面固定文案', exact: true }), null);
  assert.equal('copy' in defaults, false);
  await user.click(within(nav).getByRole('button', { name: '项目', exact: true }));
  await screen.findByRole('button', { name: '原项目' });
  assert.equal(screen.getByRole('button', { name: '原项目' }).closest('tr').querySelector('td > small').textContent, '项目副标题');
  await user.click(screen.getByRole('button', { name: '＋ 新增内容' }));
  const labels = () => [...window.document.querySelectorAll('.admin-form .admin-field > label, .admin-form .admin-array > legend, .admin-form .admin-check')]
    .filter((node) => !node.closest('details,.admin-story-image'))
    .map((node) => node.firstChild.textContent.trim());
  const projectLabels = labels();
  assert.equal(screen.queryByLabelText('年份'), null);
  assert.equal(screen.getByLabelText('标题').value, '');
  assert.equal(within(screen.getByRole('group', { name: /^图片/ })).queryByLabelText('素材地址'), null);
  assert.match(screen.getByRole('group', { name: /^图片/ }).textContent, /0 项/);
  await user.type(screen.getByLabelText('标题'), '新项目');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  assert.ok(await screen.findByText(/项目至少需要一张图片/));
  const tags = screen.getByLabelText('标签');
  await user.type(tags, '新标签{Enter}');
  assert.ok(screen.getByRole('button', { name: '删除标签 新标签' }));
  await user.type(tags, '新标签{Enter}');
  assert.ok(screen.getByText('标签不能重复'));
  await user.clear(tags);
  await user.click(within(screen.getByRole('group', { name: /^图片/ })).getByRole('button', { name: '＋ 添加一项' }));
  assert.equal(screen.getByLabelText('素材地址').value, '');
  assert.ok(screen.getByLabelText('图片标题').closest('.admin-project-image-label'));
  assert.equal(screen.getByRole('button', { name: 'AI 生成配图' }).disabled, true);
  await user.type(screen.getByLabelText('图片描述'), '山上的小型木屋');
  await user.click(screen.getByRole('button', { name: 'AI 生成配图' }));
  await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/story-generated.png'));
  const projectAiCall = calls.filter((call) => call.path === '/api/admin/ai').at(-1);
  assert.deepEqual(projectAiCall.body, { action: 'project-cover', description: '山上的小型木屋' });
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '原项目' });
  const createdProject = calls.filter((call) => call.path === '/api/admin/records/projects/items' && call.method === 'POST').at(-1).body.value;
  assert.equal(createdProject.images.length, 1);
  assert.deepEqual(createdProject.tags, ['新标签']);
  assert.equal(window.document.querySelector('.admin-record-times'), null);
  await user.selectOptions(screen.getByRole('combobox', { name: '按分类筛选' }), defaults.projects.categories[0].id);
  await screen.findByText('清除筛选后可调整排序。');
  await user.selectOptions(screen.getByRole('combobox', { name: '按分类筛选' }), '');
  await user.selectOptions(screen.getByRole('combobox', { name: '按项目状态筛选' }), defaults.projects.statuses[0].id);
  await screen.findByText('清除筛选后可调整排序。');
  await user.selectOptions(screen.getByRole('combobox', { name: '按项目状态筛选' }), '');
  await user.click(await screen.findByRole('button', { name: '原项目' }));
  await screen.findByLabelText('标题');
  assert.equal(screen.queryByLabelText('年份'), null);
  assert.deepEqual(labels(), projectLabels, '项目编辑字段顺序与新增一致，即使接口顺序相反');
  assert.ok(screen.getAllByLabelText('图片标题').every((field) => field.closest('.admin-project-image-label')));
  assert.equal(window.document.querySelector('.admin-record-times'), null);

  await user.click(within(nav).getByRole('button', { name: '说说', exact: true }));
  const storyTitle = await screen.findByRole('button', { name: '2026-09-08 12:34:56' });
  assert.equal(storyTitle.closest('td').querySelector('small').textContent, '原说说');
  const emptyTitle = screen.getByRole('button', { name: '—', exact: true });
  assert.equal(emptyTitle.closest('td').querySelector('small').textContent, '');
  assert.equal(screen.queryByRole('button', { name: '原说说' }), null);
  await user.click(storyTitle);
  await screen.findByLabelText('内容');
  assert.equal(screen.queryByLabelText('文字'), null);
  assert.equal(screen.queryByText('topics'), null);
  assert.equal(screen.getByLabelText('日期（北京时间）').textContent, '2026-09-08 12:34:56');
  await user.click(screen.getByLabelText('日期（北京时间）'));
  fireEvent.change(screen.getByLabelText('时间（时分秒）'), { target: { value: '23:45:12' } });
  await user.click(screen.getByRole('button', { name: '完成', exact: true }));
  assert.equal(screen.getByLabelText('日期（北京时间）').textContent, '2026-09-08 23:45:12');
  const topics = screen.getByLabelText('话题');
  await user.type(topics, '# 湖边 ');
  fireEvent.keyDown(topics, { key: 'Enter', isComposing: true });
  assert.equal(screen.queryByRole('button', { name: '删除话题 湖边' }), null, '输入法确认不创建话题');
  await user.keyboard('{Enter}');
  assert.ok(screen.getByRole('button', { name: '删除话题 湖边' }));
  await user.type(topics, '湖边{Enter}');
  assert.ok(screen.getByText('话题不能重复'));
  await user.clear(topics);
  await user.keyboard('{Enter}');
  assert.ok(screen.getByText('请输入话题内容'));
  await user.type(topics, '长'.repeat(41) + '{Enter}');
  assert.ok(screen.getByText('每个话题最多 40 字'));
  await user.clear(topics);
  for (let i = 2; i <= 6; i++) await user.type(topics, `话题${i}{Enter}`);
  await user.type(topics, '第七条{Enter}');
  assert.ok(screen.getByText('最多创建 6 个话题'));
  const beforePending = calls.filter((call) => call.method === 'PUT').length;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  assert.ok(screen.getByText('话题输入框还有未创建的内容，请先按 Enter 创建话题。'));
  assert.equal(calls.filter((call) => call.method === 'PUT').length, beforePending);
  await user.clear(topics);
  await user.click(screen.getByRole('button', { name: '删除话题 话题6' }));
  await user.type(topics, '替换话题{Enter}');
  assert.ok(screen.getByRole('button', { name: '删除话题 替换话题' }));
  const imageRows = () => [...window.document.querySelectorAll('.admin-story-image')];
  assert.deepEqual([...imageRows()[0].querySelectorAll('.admin-field > label')].map((node) => node.textContent), ['素材地址', '图片描述']);
  assert.deepEqual([...imageRows()[0].querySelector('.admin-asset').children].map((node) => node.textContent),
    ['上传替换', 'AI 生成配图', '查看素材 ↗', 'AI 生成配图依据当前图片描述生成']);
  await user.clear(screen.getAllByLabelText('图片描述')[0]);
  assert.equal(screen.getAllByRole('button', { name: 'AI 生成配图' })[0].disabled, true);
  await user.type(screen.getAllByLabelText('图片描述')[0], '田野上的白色帐篷');
  failStoryImage = true;
  await user.click(screen.getAllByRole('button', { name: 'AI 生成配图' })[0]);
  await screen.findByText('模拟生成失败，原图片已保留');
  assert.equal(screen.getAllByLabelText('素材地址')[0].value, '/stories-lake.png');
  failStoryImage = false;
  await user.click(screen.getAllByRole('button', { name: 'AI 生成配图' })[0]);
  await waitFor(() => assert.equal(screen.getAllByLabelText('素材地址')[0].value, '/api/media/story-generated.png'));
  assert.equal(screen.getAllByLabelText('素材地址')[1].value, '/stories-coast.png');
  assert.equal(imageRows().length, 2, '生成替换当前图片，不追加图片');
  assert.deepEqual(calls.filter((call) => call.path === '/api/admin/ai').at(-1).body,
    { action: 'story-image', description: '田野上的白色帐篷' });
  assert.equal(story.images[0].src, '/stories-lake.png', '生成后尚未提交');
  await user.click(within(imageRows()[0]).getByRole('button', { name: '下移' }));
  assert.equal(screen.getAllByLabelText('素材地址')[0].value, '/stories-coast.png');
  await user.click(within(imageRows()[1]).getByRole('button', { name: '上移' }));
  await user.click(within(screen.getByRole('group', { name: /^图片/ })).getByRole('button', { name: '＋ 添加一项' }));
  assert.equal(screen.getAllByLabelText('素材地址')[2].value, '');
  await user.click(within(imageRows()[2]).getByRole('button', { name: '删除', exact: true }));
  const beforeSaveAi = calls.filter((call) => call.path === '/api/admin/ai').length;
  await user.type(screen.getByLabelText('内容'), '正文'.repeat(80));
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  const savedStoryTitle = await screen.findByRole('button', { name: '2026-09-08 23:45:12' });
  assert.equal(savedStoryTitle.closest('td').querySelector('small').textContent, story.text.slice(0, 100));
  assert.equal(savedStoryTitle.closest('td').querySelector('small').textContent.length, 100);
  assert.equal(story.date, '2026-09-08T23:45:12+08:00');
  assert.equal(story.images[0].src, '/api/media/story-generated.png');
  assert.equal(story.images[0].alt, '田野上的白色帐篷');
  assert.equal(story.topics.length, 6);
  assert.equal(calls.filter((call) => call.path === '/api/admin/ai').length, beforeSaveAi, '提交不能自动生图');
  await user.click(screen.getByRole('button', { name: '2026-09-08 23:45:12' }));
  await screen.findByLabelText('话题');
  assert.equal(screen.getAllByLabelText('素材地址')[0].value, story.images[0].src);
  assert.equal(screen.getByLabelText('日期（北京时间）').textContent, '2026-09-08 23:45:12');
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增说说' }));
  assert.match(screen.getByLabelText('日期（北京时间）').textContent, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(imageRows().length, 0, '新增说说不能继承示例图片');
  assert.equal(screen.queryByLabelText('素材地址'), null);
  await user.click(within(screen.getByRole('group', { name: /^图片/ })).getByRole('button', { name: '＋ 添加一项' }));
  assert.equal(imageRows().length, 1);
  assert.equal(screen.getByLabelText('素材地址').value, '');
  assert.equal(screen.getByLabelText('图片描述').value, '');
  assert.equal(screen.getByRole('button', { name: 'AI 生成配图' }).disabled, true);
  await user.click(within(imageRows()[0]).getByRole('button', { name: '删除', exact: true }));
  assert.equal(imageRows().length, 0);
  await user.click(within(nav).getByRole('button', { name: '写作', exact: true }));
  await user.click(screen.getByRole('button', { name: '＋ 新增文章管理' }));
  const checkWritingLayout = () => {
    assert.deepEqual([...document.querySelectorAll('.admin-writing-title-row label')]
      .map((node) => node.textContent), ['文章标题', '文章分类']);
    assert.deepEqual([...document.querySelectorAll('.admin-cover .admin-field label')]
      .map((node) => node.textContent), ['素材地址', '图片描述']);
    assert.equal(screen.queryByRole('radio'), null);
    assert.equal(screen.queryByRole('img', { name: '当前文章封面' }), null);
    assert.equal(screen.getByLabelText('图片描述').maxLength, 5000);
    assert.ok(screen.getByText('AI 生成配图依据当前图片描述生成'));
  };
  checkWritingLayout();
  assert.equal(screen.getByLabelText('素材地址').value, '');
  assert.equal(screen.getByLabelText('图片描述').value, '');
  assert.equal(screen.getByRole('button', { name: 'AI 生成配图' }).disabled, true);
  await user.type(screen.getByLabelText('文章标题'), '封面上传验收');
  await user.type(screen.getByLabelText('文章摘要'), '封面摘要');
  let finishWritingUpload;
  globalThis.fetch = async (input, init) => input === '/api/admin/media'
    ? new Promise((resolve) => { finishWritingUpload = resolve; }) : immediateFetch(input, init);
  await user.upload(screen.getByLabelText('上传替换'), new window.File(['image'], 'cover.png', { type: 'image/png' }));
  assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true);
  assert.equal(screen.getByLabelText('上传替换').disabled, true);
  assert.equal(screen.getByLabelText('图片描述').closest('fieldset').disabled, true);
  finishWritingUpload(Response.json({ url: '/api/media/writing-uploaded.png' }));
  await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/writing-uploaded.png'));
  assert.equal(screen.getByRole('link', { name: '查看素材 ↗' }).getAttribute('href'), '/api/media/writing-uploaded.png');
  globalThis.fetch = immediateFetch;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '原文章已修改' });
  const createdWriting = calls.filter((call) => call.method === 'POST' && call.path === '/api/admin/records/writing/articles').at(-1).body.value;
  assert.equal(createdWriting.cover, '/api/media/writing-uploaded.png');
  assert.equal(createdWriting.coverDescription, '');
  assert.equal(createdWriting.coverMode, 'upload');
  await user.click(screen.getByRole('button', { name: '原文章已修改' }));
  await screen.findByLabelText('文章标题');
  checkWritingLayout();
  const originalCover = screen.getByLabelText('素材地址').value;
  await user.type(screen.getByLabelText('图片描述'), '薄雾中的白色灯塔');
  let finishWritingGeneration;
  let writingAiBody;
  globalThis.fetch = async (input, init) => input === '/api/admin/ai'
    ? new Promise((resolve) => { writingAiBody = JSON.parse(init.body); finishWritingGeneration = resolve; })
    : immediateFetch(input, init);
  await user.click(screen.getByRole('button', { name: 'AI 生成配图' }));
  assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true);
  assert.equal(screen.getByLabelText('上传替换').disabled, true);
  assert.deepEqual(writingAiBody, { action: 'cover', description: '薄雾中的白色灯塔' });
  finishWritingGeneration(Response.json({ error: '模拟写作生图失败' }, { status: 502 }));
  await screen.findByText('模拟写作生图失败');
  assert.equal(screen.getByLabelText('素材地址').value, originalCover);
  assert.equal(screen.getByLabelText('图片描述').value, '薄雾中的白色灯塔');
  await user.click(screen.getByRole('button', { name: 'AI 生成配图' }));
  const generatedFor = JSON.stringify(['薄雾中的白色灯塔']);
  finishWritingGeneration(Response.json({ url: '/api/media/writing-generated.png', generatedFor }));
  await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/writing-generated.png'));
  globalThis.fetch = immediateFetch;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '原文章已修改' });
  assert.equal(article.cover, '/api/media/writing-generated.png');
  assert.equal(article.coverDescription, '薄雾中的白色灯塔');
  assert.equal(article.coverMode, 'ai');
  assert.equal(article.coverGeneratedFor, generatedFor);
  await user.click(screen.getByRole('button', { name: '原文章已修改' }));
  await screen.findByLabelText('文章标题');
  assert.equal(screen.getByLabelText('素材地址').value, article.cover);
  assert.equal(screen.getByLabelText('图片描述').value, article.coverDescription);
  const beforeWritingSaveAi = calls.filter((call) => call.path === '/api/admin/ai').length;
  await user.type(screen.getByLabelText('文章摘要'), '新摘要');
  await user.type(screen.getByLabelText('图片描述'), '新的描述');
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '原文章已修改' });
  assert.equal(article.cover, '/api/media/writing-generated.png');
  assert.equal(article.coverGeneratedFor, generatedFor);
  assert.equal(calls.filter((call) => call.path === '/api/admin/ai').length, beforeWritingSaveAi, '写作提交不得自动生图');
  await user.click(screen.getByRole('button', { name: '原文章已修改' }));
  await screen.findByLabelText('文章标题');
  globalThis.fetch = async (input, init) => input === '/api/admin/media'
    ? Response.json({ error: '模拟写作上传失败' }, { status: 500 }) : immediateFetch(input, init);
  await user.upload(screen.getByLabelText('上传替换'), new window.File(['image'], 'failed.png', { type: 'image/png' }));
  await screen.findByText('模拟写作上传失败');
  assert.equal(screen.getByLabelText('素材地址').value, article.cover);
  await user.clear(screen.getByLabelText('素材地址'));
  await user.type(screen.getByLabelText('素材地址'), '/covers/writing-notes.png');
  globalThis.fetch = immediateFetch;
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByRole('button', { name: '原文章已修改' });
  assert.equal(article.coverMode, 'upload');
  assert.equal(article.coverGeneratedFor, '');
  assert.equal(article.coverDescription, '薄雾中的白色灯塔新的描述');
  console.log('PASS writing field layout, upload/generate busy states, failures, persistence and manual generation only');
  for (const [sectionLabel, tabLabel, inputLabel] of [
    ['书签', '内容', '名称'], ['书签', '分类', '名称'],
    ['友链', '内容', '名称'], ['友链', '分类', '名称'],
    ['音乐', '内容', '标题'], ['音乐', '音乐场景', '名称'], ['音乐', '歌单', '标题'],
    ['电影', '内容', '标题'], ['电影', '分类', '名称'],
    ['播客', '内容', '标题'], ['播客', '分类', '名称'],
    ['旅行', '内容', '标题'], ['旅行', '分类', '名称'],
    ['爱好', '内容', '标题'], ['爱好', '分类', '名称'],
    ['书籍', '内容', '标题'], ['书籍', '分类', '名称'], ['书籍', '书单', '标题'],
  ]) {
    await user.click(within(nav).getByRole('button', { name: sectionLabel, exact: true }));
    await user.click(screen.getByRole('tab', { name: tabLabel }));
    const expectedSubtitle = { 音乐: '测试音乐作者', 电影: '测试导演', 播客: '测试专辑主播',
      旅行: '旅行说明', 爱好: '爱好说明' }[sectionLabel];
    if (tabLabel === '内容' && expectedSubtitle) {
      const row = (await screen.findByRole('button', { name: `原${sectionLabel}` })).closest('tr');
      assert.equal(row.querySelector('td > small').textContent, expectedSubtitle);
      assert.equal(row.textContent.includes('不应显示的'), false);
      if (sectionLabel === '爱好')
        assert.equal(screen.getByRole('button', { name: '空说明爱好' }).closest('tr').querySelector('td > small').textContent, '');
    }
    if (sectionLabel === '书籍' && tabLabel === '内容')
      assert.equal(screen.getByRole('button', { name: '原书籍' }).closest('tr').querySelector('td > small').textContent, '书籍作者');
    if (sectionLabel === '书籍' && tabLabel === '内容')
      assert.equal(screen.getByRole('button', { name: '空作者书籍' }).closest('tr').querySelector('td > small').textContent, '');
    if (['音乐', '播客', '旅行', '爱好'].includes(sectionLabel))
      assert.equal(screen.queryByRole('tab', { name: '设置' }), null);
    await user.click(screen.getByRole('button', { name: `＋ 新增${tabLabel}` }));
    assert.equal(screen.getByLabelText(inputLabel).value, '', `${sectionLabel}/${tabLabel} 新增名称应为空`);
    if (['音乐', '播客', '旅行', '爱好', '书籍'].includes(sectionLabel)) {
      const form = document.querySelector('.admin-form');
      for (const input of form.querySelectorAll('.admin-fields input[type="text"], .admin-fields input[type="number"], .admin-fields textarea, .admin-fields select'))
        assert.equal(input.value, '', `${sectionLabel}/${tabLabel} 不应预填 ${input.id}`);
      for (const count of form.querySelectorAll('.admin-array legend small'))
        assert.equal(count.textContent, '0 项', `${sectionLabel}/${tabLabel} 不应带入示例条目`);
      for (const checkbox of form.querySelectorAll('input[type="checkbox"]'))
        assert.equal(checkbox.checked, false, `${sectionLabel}/${tabLabel} 不应默认发布`);
    }
    if (sectionLabel === '音乐' && tabLabel === '内容')
      assert.equal(screen.getByLabelText('素材地址').value, '');
    if (sectionLabel === '音乐' && tabLabel === '内容') {
      const src = screen.getByLabelText('素材地址').closest('.admin-track-src');
      assert.ok(src);
      assert.equal(src.nextElementSibling.querySelector('label').textContent, '时长（秒）');
    }
    if (sectionLabel === '音乐' && tabLabel === '歌单') {
      assert.equal(screen.queryByLabelText('书封颜色'), null);
      assert.ok(screen.getByRole('group', { name: /^歌曲/ }));
    }
    if (sectionLabel === '电影')
      assert.equal(screen.queryByRole('tab', { name: '设置' }), null);
    if (sectionLabel === '电影' && tabLabel === '内容') {
      assert.equal(screen.getByLabelText('封面图').value, '');
      for (const label of ['导演', '类型', '国家', '语言']) assert.ok(screen.getByLabelText(label));
    }
    if (sectionLabel === '播客' && tabLabel === '内容') assert.ok(screen.getByLabelText('专辑主播'));
    if (sectionLabel === '旅行' && tabLabel === '分类') {
      assert.equal(screen.queryByRole('button', { name: 'AI 生成配图' }), null);
      assert.equal(screen.queryByRole('button', { name: 'AI 生成封面' }), null);
    }
    if (['旅行', '爱好'].includes(sectionLabel) && tabLabel === '内容')
      assert.ok(screen.getByRole('group', { name: /^相册/ }));
    if ((tabLabel === '歌单' || tabLabel === '书单' || tabLabel === '内容' &&
      ['电影', '播客', '旅行', '爱好', '书籍'].includes(sectionLabel))) {
      assert.equal(screen.getByLabelText('封面图').value, '');
      assert.equal(screen.queryByLabelText('素材地址'), null);
    }
    if (['旅行', '爱好'].includes(sectionLabel) && tabLabel === '内容') {
      await screen.findByRole('textbox', { name: '正文 Markdown' });
      for (const mode of ['切换编辑模式', '编辑 & 预览', '预览'])
        assert.ok(screen.getByRole('button', { name: mode, exact: true }));
    }
    const section = { 音乐: 'tracks', 电影: 'films', 播客: 'podcasts', 旅行: 'travel', 爱好: 'hobbies', 书籍: 'books' }[sectionLabel];
    const collection = tabLabel === '歌单' ? 'playlists' : 'items';
    const existing = ['内容', '歌单'].includes(tabLabel) ? orderedRecords[section]?.[collection] : null;
    const order = () => [...document.querySelector('.admin-form .admin-fields').children]
      .map((node) => (node.matches('label') ? node : node.querySelector('label,legend'))?.firstChild?.textContent?.trim());
    const newOrder = existing ? order() : null;
    await user.click(screen.getByRole('button', { name: '← 返回列表' }));
    if (existing) {
      await user.click(await screen.findByRole('button', { name: existing.title }));
      await screen.findByDisplayValue(existing.title);
      assert.deepEqual(order(), newOrder, `${sectionLabel}/${tabLabel} 编辑字段顺序应与新增一致`);
      if (sectionLabel === '音乐' && tabLabel === '歌单') assert.equal(screen.queryByLabelText('书封颜色'), null);
      if (['旅行', '爱好'].includes(sectionLabel) && tabLabel === '内容') {
        assert.ok(screen.getByLabelText('封面图'));
        const markdown = await screen.findByRole('textbox', { name: '正文 Markdown' });
        await user.type(markdown, `\n\n## ${sectionLabel} Markdown 测试`);
        await user.click(screen.getByRole('button', { name: '预览', exact: true }));
        assert.ok(screen.getByRole('heading', { name: `${sectionLabel} Markdown 测试` }));
        await user.click(screen.getByRole('button', { name: '预览', exact: true }));
        await user.click(screen.getByRole('button', { name: '编辑 & 预览', exact: true }));
        await user.click(screen.getByRole('button', { name: '确认提交' }));
        await user.click(await screen.findByRole('button', { name: existing.title }));
        assert.ok((await screen.findByRole('textbox', { name: '正文 Markdown' })).value.includes(`${sectionLabel} Markdown 测试`));
      }
      await user.click(screen.getByRole('button', { name: '← 返回列表' }));
    }
  }
  for (const [section, label] of [['bookmarks', '书签'], ['friends', '友链']]) {
    await user.click(within(nav).getByRole('button', { name: label, exact: true }));
    const directoryRow = (await screen.findByRole('button', { name: section === 'bookmarks' ? '原书签' : '原友链' })).closest('tr');
    assert.equal(directoryRow.querySelector('td > small').textContent, `https://example.com/${section}`);
    assert.equal(directoryRow.textContent.includes('不应显示的说明'), false);
    await user.click(screen.getByRole('button', { name: '＋ 新增内容' }));
    const fieldOrder = () => [...document.querySelectorAll('.admin-form .admin-object > .admin-fields > .admin-field > label')]
      .map((node) => node.textContent);
    const expectedOrder = ['名称', '网址', '说明', '头像文字', '分类', '标签'];
    assert.deepEqual(fieldOrder(), expectedOrder, `${label}新增字段顺序`);
    assert.equal(screen.getByLabelText('头像文字').closest('.admin-field').nextElementSibling,
      screen.getByLabelText('分类').closest('.admin-field'), `${label}头像文字应紧邻分类`);
    assert.ok(screen.getByLabelText('标签').closest('.admin-story-topics'));
    await user.type(screen.getByLabelText('名称'), `新增${label}`);
    await user.type(screen.getByLabelText('网址'), `https://example.com/${section}`);
    await user.type(screen.getByLabelText('头像文字'), '新');
    await user.selectOptions(screen.getByLabelText('分类'), defaults[section].categories[0].id);
    const tagInput = screen.getByLabelText('标签');
    await user.type(tagInput, '  新标签  {Enter}');
    assert.ok(screen.getByRole('button', { name: '删除标签 新标签' }));
    await user.type(tagInput, '新标签{Enter}');
    assert.ok(screen.getByText('标签不能重复'));
    await user.clear(tagInput);
    await user.type(tagInput, '待删除{Enter}');
    await user.click(screen.getByRole('button', { name: '删除标签 待删除' }));
    await user.type(tagInput, '尚未创建');
    const postsBeforePending = calls.filter((call) => call.path === `/api/admin/records/${section}/items` && call.method === 'POST').length;
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    assert.ok(screen.getByText('标签输入框还有未创建的内容，请先按 Enter 创建标签。'));
    assert.equal(calls.filter((call) => call.path === `/api/admin/records/${section}/items` && call.method === 'POST').length,
      postsBeforePending, `${label}未确认标签不能保存`);
    await user.clear(tagInput);
    await user.type(tagInput, '保留标签{Enter}');
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    await screen.findByRole('button', { name: `新增${label}` });
    const created = directoryRecords[section][0];
    assert.deepEqual(created.tags, ['新标签', '保留标签']);
    assert.equal(created.initials, '新');
    await user.click(screen.getByRole('button', { name: `新增${label}` }));
    await screen.findByLabelText('标签');
    assert.deepEqual(fieldOrder(), expectedOrder, `${label}编辑字段顺序与新增一致`);
    assert.ok(screen.getByRole('button', { name: '删除标签 保留标签' }));
    assert.equal(screen.getByLabelText('标签').value, '');
    await user.type(screen.getByLabelText('标签'), '编辑标签{Enter}');
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    await screen.findByRole('button', { name: `新增${label}` });
    await user.click(screen.getByRole('button', { name: `新增${label}` }));
    await screen.findByLabelText('标签');
    assert.ok(screen.getByRole('button', { name: '删除标签 编辑标签' }));
    await user.click(screen.getByRole('button', { name: '← 返回列表' }));
    await user.click(screen.getByRole('button', { name: section === 'bookmarks' ? '原书签' : '原友链' }));
    await screen.findByLabelText('标签');
    assert.deepEqual(fieldOrder(), expectedOrder, `${label}已有记录的逆序接口字段不影响布局`);
    assert.ok(screen.getByRole('button', { name: '删除标签 原标签' }));
  }
  cleanup();
  const originalAudioObjectUrl = URL.createObjectURL.bind(URL);
  const originalAudioRevokeUrl = URL.revokeObjectURL.bind(URL);
  const audioPrototype = window.HTMLMediaElement.prototype;
  const originalAudioLoad = Object.getOwnPropertyDescriptor(audioPrototype, 'load');
  const originalAudioDuration = Object.getOwnPropertyDescriptor(audioPrototype, 'duration');
  let failMetadata = false;
  let failAudioUpload = false;
  let audioUploadCount = 0;
  audioPrototype.load = function () {
    if (this.src) queueMicrotask(() => failMetadata ? this.onerror?.() : this.onloadedmetadata?.());
  };
  Object.defineProperty(audioPrototype, 'duration', { configurable: true, get: () => 48.2 });
  URL.createObjectURL = () => 'blob:track-audio';
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async (input, init) => {
    if (input === '/api/admin/media') {
      audioUploadCount++;
      return failAudioUpload ? Response.json({ error: '模拟音频上传失败' }, { status: 503 })
        : Response.json({ url: '/api/media/new-track.wav' });
    }
    return immediateFetch(input, init);
  };
  function TrackForm({ existing = false }) {
    const [value, setValue] = useState(() => ({ ...defaults.tracks.items[0],
      src: existing ? '/audio/existing.wav' : '', duration: existing ? 32 : null }));
    return createElement(Field, { path: 'tracks.items', label: '音乐', value,
      sample: defaults.tracks.items[0], immutableIdentity: existing, onChange: setValue });
  }
  try {
    render(createElement(TrackForm));
    assert.equal(screen.getByLabelText('时长（秒）').type, 'number');
    assert.equal(screen.getByLabelText('时长（秒）').value, '');
    failMetadata = true;
    await user.upload(screen.getByLabelText('上传替换'), new window.File(['audio'], 'track.wav', { type: 'audio/wav' }));
    await screen.findByText(/无法读取音频时长/);
    assert.equal(audioUploadCount, 0);
    assert.equal(screen.getByLabelText('素材地址').value, '');
    assert.equal(screen.getByLabelText('时长（秒）').value, '');
    failMetadata = false;
    failAudioUpload = true;
    await user.upload(screen.getByLabelText('上传替换'), new window.File(['audio'], 'track.wav', { type: 'audio/wav' }));
    await screen.findByText(/模拟音频上传失败/);
    assert.equal(screen.getByLabelText('素材地址').value, '');
    assert.equal(screen.getByLabelText('时长（秒）').value, '');
    failAudioUpload = false;
    await user.upload(screen.getByLabelText('上传替换'), new window.File(['audio'], 'track.wav', { type: 'audio/wav' }));
    await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/new-track.wav'));
    assert.equal(screen.getByLabelText('时长（秒）').value, '49');
    await user.clear(screen.getByLabelText('时长（秒）'));
    assert.equal(screen.getByLabelText('时长（秒）').value, '');
    await user.type(screen.getByLabelText('时长（秒）'), '73');
    assert.equal(screen.getByLabelText('时长（秒）').value, '73');
    cleanup();
    render(createElement(TrackForm, { existing: true }));
    await user.upload(screen.getByLabelText('上传替换'), new window.File(['audio'], 'replacement.wav', { type: 'audio/wav' }));
    await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/new-track.wav'));
    assert.equal(screen.getByLabelText('时长（秒）').value, '49');
  } finally {
    cleanup();
    Object.defineProperty(audioPrototype, 'load', originalAudioLoad);
    Object.defineProperty(audioPrototype, 'duration', originalAudioDuration);
    URL.createObjectURL = originalAudioObjectUrl;
    URL.revokeObjectURL = originalAudioRevokeUrl;
    globalThis.fetch = immediateFetch;
  }
  for (const initialSongs of [[], [{ title: '已有歌曲', artist: '已有作者' }]]) {
    let submitted;
    function PlaylistForm({ onSave }) {
      const [value, setValue] = useState({ ...fresh(asJson(musicSample.playlists[0])),
        title: '独立歌单', songs: structuredClone(initialSongs) });
      return createElement('form', { onSubmit: (event) => { event.preventDefault(); onSave(value); } },
        createElement(Field, { path: 'tracks.playlists', label: '歌单', value,
          sample: fresh(asJson(musicSample.playlists[0])), onChange: setValue }),
        createElement('button', { type: 'submit' }, '保存测试歌单'));
    }
    render(createElement(PlaylistForm, { onSave: (value) => { submitted = value; } }));
    const songs = screen.getByRole('group', { name: /^歌曲/ });
    await user.click(within(songs).getByRole('button', { name: '＋ 添加一项' }));
    const row = songs.querySelectorAll('details')[initialSongs.length];
    assert.equal(row.open, true, '新歌曲应默认展开');
    const title = within(row).getByLabelText('标题');
    const artist = within(row).getByLabelText('音乐作者');
    assert.equal(title.value, '');
    assert.equal(artist.value, '');
    await user.type(title, '独立歌曲');
    await user.type(artist, '独立作者');
    await user.click(screen.getByRole('button', { name: '保存测试歌单' }));
    assert.deepEqual(submitted.songs, [...initialSongs, { title: '独立歌曲', artist: '独立作者' }]);
    validateContent('tracks', { ...musicSample, items: [], scenes: [], playlists: [submitted] });
    cleanup();
  }
  console.log('PASS playlist songs added from empty form templates remain independent objects');
  for (const [path, initial] of [
    ['tracks.playlists.songs', [{ title: '原歌曲', artist: '原作者' }]],
    ['travel.items.album', []],
    ['travel.items.album', ['/api/media/travel.jpg']],
    ['hobbies.items.album', []],
    ['hobbies.items.album', ['/api/media/hobby.jpg']],
  ]) {
    let submitted;
    function ArrayForm({ onSave }) {
      const [value, setValue] = useState(structuredClone(initial));
      return createElement('form', { onSubmit: (event) => { event.preventDefault(); onSave(value); } },
        createElement(Field, { path, label: '测试条目', value, sample: [], onChange: setValue }),
        createElement('button', { type: 'submit' }, '保存测试条目'));
    }
    render(createElement(ArrayForm, { onSave: (value) => { submitted = value; } }));
    const group = screen.getByRole('group', { name: /^测试条目/ });
    const rows = () => [...group.querySelectorAll('details')];
    if (!initial.length) {
      await user.click(within(group).getByRole('button', { name: '＋ 添加一项' }));
      assert.equal(rows()[0].open, true, '空相册新增图片应默认展开');
      await user.type(within(rows()[0]).getByLabelText('图片地址'), '/api/media/first-album.jpg');
      await user.click(screen.getByRole('button', { name: '保存测试条目' }));
      assert.deepEqual(submitted, ['/api/media/first-album.jpg']);
      cleanup();
      continue;
    }
    assert.equal(rows()[0].open, true, '已有条目应默认展开');
    rows()[0].open = false;
    await user.click(within(group).getByRole('button', { name: '＋ 添加一项' }));
    assert.equal(rows()[0].open, false, '添加条目应保留已有折叠状态');
    assert.equal(rows()[1].open, true);
    const song = path.endsWith('.songs');
    const input = within(rows()[1]).getByLabelText(song ? '标题' : '图片地址');
    const added = song ? '新增歌曲' : '/api/media/new-album.jpg';
    await user.type(input, added);
    assert.equal(rows()[0].open, false, '输入应保留已有折叠状态');
    await user.click(within(rows()[1].parentElement).getByRole('button', { name: '上移' }));
    assert.equal(rows()[1].open, true, '操作按钮不应触发折叠');
    await user.click(screen.getByRole('button', { name: '保存测试条目' }));
    const addedItem = song ? { title: added, artist: '' } : added;
    assert.deepEqual(submitted, [addedItem].concat(initial));
    await user.click(within(rows()[0].parentElement).getByRole('button', { name: '下移' }));
    await user.click(within(rows()[1].parentElement).getByRole('button', { name: '删除' }));
    await user.click(screen.getByRole('button', { name: '保存测试条目' }));
    assert.deepEqual(submitted, initial);
    await user.click(within(group).getByRole('button', { name: '＋ 添加一项' }));
    if (!song) {
      const previousFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => input === '/api/admin/media'
        ? Response.json({ url: '/api/media/uploaded-album.png', name: 'album.png' }) : previousFetch(input, init);
      try {
        await user.upload(within(rows()[1]).getByLabelText('上传替换'),
          new window.File(['image'], 'album.png', { type: 'image/png' }));
        await waitFor(() => assert.equal(within(rows()[1]).getByLabelText('图片地址').value, '/api/media/uploaded-album.png'));
        await user.click(screen.getByRole('button', { name: '保存测试条目' }));
        assert.deepEqual(submitted, initial.concat('/api/media/uploaded-album.png'));
      } finally { globalThis.fetch = previousFetch; }
    }
    cleanup();
  }
  console.log('PASS compact song/album expansion, preserved collapse, ordering, deletion and uploaded URLs');
  for (const [path, sample, action] of [
    ['tracks.playlists', musicSample.playlists[0], 'playlist-cover'],
    ['films.items', defaults.films.items[0], 'film-cover'],
    ['podcasts.items', defaults.podcasts.items[0], 'podcast-cover'],
    ['travel.items', defaults.travel.items[0], 'travel-cover'],
    ['hobbies.items', defaults.hobbies.items[0], 'hobby-cover'],
    ['books.items', defaults.books.items[0], 'book-cover'],
    ['books.lists', defaults.books.lists[0], 'booklist-cover'],
  ]) {
    function Form() {
      const [value, setValue] = useState(() => structuredClone(sample));
      return createElement('div', { className: 'admin-shell' }, createElement(Field, {
        path, label: '内容', value, sample, onChange: setValue,
      }));
    }
    render(createElement(Form));
    assert.deepEqual([...window.document.querySelectorAll('.admin-description-image .admin-field > label')]
      .map((node) => node.textContent), ['封面图', '图片描述']);
    assert.equal(screen.queryByLabelText('封面来源'), null);
    assert.equal(screen.getByRole('button', { name: 'AI 生成配图' }).disabled, true);
    await user.type(screen.getByLabelText('图片描述'), '薄雾中的白色灯塔');
    if (action === 'film-cover') {
      const previousCover = screen.getByLabelText('封面图').value;
      failStoryImage = true;
      await user.click(screen.getByRole('button', { name: 'AI 生成配图' }));
      await screen.findByText(/模拟生成失败/);
      assert.equal(screen.getByLabelText('封面图').value, previousCover);
      failStoryImage = false;
    }
    await user.click(screen.getByRole('button', { name: 'AI 生成配图' }));
    await waitFor(() => assert.equal(screen.getByLabelText('封面图').value, '/api/media/story-generated.png'));
    assert.deepEqual(calls.filter((call) => call.path === '/api/admin/ai').at(-1).body,
      { action, description: '薄雾中的白色灯塔' });
    assert.equal(screen.getByLabelText('图片描述').value, '薄雾中的白色灯塔');
    cleanup();
  }
  render(createElement(ContentProvider, { content: { ai: {
    ...defaults.ai,
    agents: [{ ...defaults.ai.agents[0], id: 'ui-custom-agent', status: 'maintenance' }],
    agentStatuses: [...defaults.ai.agentStatuses, { id: 'maintenance', name: '维护中' }],
  } } }, createElement(AiNotebook)));
  await user.click(screen.getByRole('tab', { name: '智能体' }));
  const customStatus = await screen.findByText('维护中');
  assert.equal(customStatus.className, 'ai-agent-status ai-status-maintenance');
  cleanup();
  console.log('PASS seven description image fields, exact AI request data and explicit generation controls');
  const footerSocialLinks = footerIconOptions.map(({ id, name }) =>
    ({ name, icon: id, href: `https://example.com/${id}` }));
  render(createElement(ContentProvider, { content: { site: {
    ...defaults.site, footerLinks: [{ name: '页脚普通导航', href: '/projects' }],
    footerSocialLinks: [...footerSocialLinks, { name: '', icon: 'rss', href: '/rss' }],
  } } }, createElement(SiteFooter)));
  const icons = [];
  for (const item of footerSocialLinks) {
    const link = screen.getByRole('link', { name: item.name, exact: true });
    assert.equal(link.getAttribute('href'), item.href);
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(link.getAttribute('title'), item.name);
    const svg = link.querySelector('svg');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('width'), '18');
    icons.push(svg.innerHTML);
  }
  assert.equal(new Set(icons).size, 16, '每个平台应渲染对应图标');
  assert.equal(window.document.querySelectorAll('.footer-socials a').length, 16);
  assert.equal(screen.getByRole('link', { name: '页脚普通导航' }).getAttribute('target'), null);
  cleanup();
  console.log('PASS all 16 footer social icons, new-tab attributes and unchanged ordinary navigation');
  console.log('PASS unified writing/project forms, story time/Enter topics/IME/limits, per-image generation/failure/reorder and explicit persistence');
  console.log('PASS per-record admin UI and website settings tabs: explicit submit, navigation editing, preserved fields, unsaved drafts and conflict retention');
} finally {
  cleanup();
  await window.happyDOM.abort();
}
