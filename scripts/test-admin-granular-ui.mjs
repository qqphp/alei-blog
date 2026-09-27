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
const { createElement, act } = await import('react');
const { render, screen, waitFor, cleanup, within } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { AdminGranularPanel } = await import('../components/admin-granular-panel.tsx');
const { defaults } = await import('../lib/cms-defaults.ts');
const user = userEvent.setup({ document: window.document });
const calls = [];
const category = { id: 'ui-category', name: '测试分类', description: '', parentId: '' };
let article = { ...defaults.writing[0], slug: 'ui-granular', title: '原文章', body: '正文',
  excerpt: '摘要', categoryId: category.id, category: category.name,
  cover: '/notes/paper-v2.png', coverMode: 'upload', coverGeneratedFor: '',
  _published: false };
let articleRevision = 1;
let home = { ...defaults.home };
let homeRevision = 1;
let site = { ...structuredClone(defaults.site), name: ' 自定义站点 ', description: '自定义说明\n第二行', footer: '自定义页脚' };
let siteRevision = 1;
let failNextConfigWrite = '';
let failNextWrite = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost:3000');
  calls.push({ path: url.pathname, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });
  if (url.pathname === '/api/admin/session')
    return Response.json({ authenticated: true, configured: true });
  if (url.pathname === '/api/admin/options/writing')
    return Response.json({ categories: [category] });
  if (url.pathname.startsWith('/api/admin/options/')) return Response.json({});
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
    return Response.json({ value: isSite ? site : home, revision: isSite ? siteRevision : homeRevision });
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
  const markdown = await screen.findByRole('textbox', { name: '文章正文 Markdown' });
  await user.type(markdown, '\n\n## 按需编辑测试');
  await user.click(screen.getByRole('button', { name: '预览', exact: true }));
  assert.ok(screen.getByRole('heading', { name: '按需编辑测试', exact: true }));
  await user.click(screen.getByRole('button', { name: '编辑', exact: true }));
  assert.ok(screen.getByRole('textbox', { name: '文章正文 Markdown' }).value.includes('按需编辑测试'));
  await user.click(screen.getByRole('button', { name: '分屏', exact: true }));
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
  assert.ok(write.body.value.body.includes('## 按需编辑测试'), '按需加载后的正文修改必须随表单保存');
  assert.equal(Object.hasOwn(write.body, 'key'), false);
  await screen.findByRole('button', { name: '原文章已修改' });
  await user.click(screen.getByRole('button', { name: '发布' }));
  await waitFor(() => assert.equal(article._published, true));
  assert.ok(calls.some((call) => call.method === 'PATCH'));
  await user.click(screen.getByRole('button', { name: '＋ 新增文章管理' }));
  assert.equal(calls.some((call) => call.method === 'POST' && call.path.includes('/records/')), false);
  await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  assert.equal(calls.some((call) => call.method === 'POST' && call.path.includes('/records/')), false);
  await user.click(within(nav).getByRole('button', { name: '网站设置' }));
  await screen.findByLabelText('站点标记');
  assert.ok(screen.getByRole('heading', { name: '网站设置' }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['站点', '导航', '首页']);
  assert.equal(screen.getByRole('tab', { name: '站点' }).getAttribute('aria-selected'), 'true');
  assert.equal(screen.getByRole('link', { name: '查看前台 ↗' }).getAttribute('href'), '/');
  assert.deepEqual([...window.document.querySelectorAll('.admin-form label')].map((node) => node.textContent),
    ['名称', '站点标记', '标题', '说明', '页脚文字', '版权文字', '页脚链接文字', '页脚链接地址']);
  assert.equal(screen.getByLabelText('名称').value, ' 自定义站点 ');
  assert.equal(screen.getByLabelText('说明').value, '自定义说明\n第二行');
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
  assert.deepEqual(site, originalSite);
  assert.ok(screen.getByLabelText('名称').value.endsWith('已修改'));
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(site.name, ' 自定义站点 已修改'));
  for (const key of ['links', 'sites', 'life']) assert.deepEqual(site[key], originalSite[key]);
  const savedSite = structuredClone(site);
  await user.click(screen.getByRole('tab', { name: '导航' }));
  const mainNav = await screen.findByRole('group', { name: /^主导航/ });
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
  assert.deepEqual(site, beforeConflict);
  assert.ok(within(mainNav).getAllByLabelText('名称')[0].value.endsWith('冲突输入'));
  await user.click(screen.getByRole('tab', { name: '站点' }));
  await screen.findByLabelText('站点标记');
  assert.equal(screen.getByLabelText('名称').value, savedSite.name);
  const homeTab = screen.getByRole('tab', { name: '首页' });
  homeTab.focus();
  await user.keyboard('[Enter]');
  await screen.findByLabelText('标题');
  assert.deepEqual([...window.document.querySelectorAll('.admin-form label')].map((node) => node.textContent),
    ['眉题', '标题', '说明', '说说区标题', '说说区说明']);
  await user.type(screen.getByLabelText('标题'), ' 测试');
  assert.equal(home.title, defaults.home.title);
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.ok(home.title.endsWith(' 测试')));
  assert.deepEqual(site, beforeConflict, '首页保存不能改变站点或导航');
  await user.click(screen.getByRole('tab', { name: '导航' }));
  await screen.findByRole('group', { name: /^主导航/ });
  assert.ok(screen.getByText('新增导航'));
  await user.click(screen.getByRole('tab', { name: '首页' }));
  await screen.findByLabelText('标题');
  assert.equal(screen.getByLabelText('标题').value, home.title);
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
  await user.click(screen.getByRole('button', { name: '＋ 新增说说封面' }));
  await screen.findByLabelText('素材地址');
  let finishUpload;
  globalThis.fetch = async (input, init) => {
    if (input === '/api/admin/media') {
      await new Promise((done) => { finishUpload = done; });
      return Response.json({ url: '/api/media/1234-abcd.png' });
    }
    return immediateFetch(input, init);
  };
  await user.upload(screen.getByLabelText('上传替换'), new window.File(['image'], 'test.png', { type: 'image/png' }));
  assert.equal(screen.getByRole('tab', { name: '说说', exact: true }).disabled, true);
  assert.equal(screen.getByRole('button', { name: '← 返回列表' }).disabled, true);
  assert.equal(screen.getByRole('button', { name: '确认提交' }).disabled, true);
  assert.equal(within(nav).getByRole('button', { name: 'AI', exact: true }).disabled, true);
  await act(async () => finishUpload());
  globalThis.fetch = immediateFetch;
  await waitFor(() => assert.equal(screen.getByLabelText('素材地址').value, '/api/media/1234-abcd.png'));
  assert.equal(screen.getByRole('button', { name: '← 返回列表' }).disabled, false);
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: 'AI', exact: true }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['智能体', '技能 Skills', '中转站 API']);
  await user.click(screen.getByRole('button', { name: '＋ 新增智能体' }));
  await user.type(screen.getByLabelText('名称'), '未保存资源');
  window.confirm = () => false;
  await user.click(screen.getByRole('tab', { name: '技能 Skills' }));
  assert.ok(screen.getByLabelText('名称').value.includes('未保存资源'));
  window.confirm = () => true;
  await user.click(screen.getByRole('tab', { name: '技能 Skills' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增技能 Skills' }));
  assert.ok(screen.getByLabelText('子分类'));
  assert.equal(screen.queryByLabelText('提示词'), null);
  await user.click(within(screen.getByRole('navigation', { name: '后台栏目' })).getByRole('button', { name: '投资', exact: true }));
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['文章', '栏目']);
  await user.click(screen.getByRole('button', { name: '＋ 新增文章' }));
  assert.equal(screen.getAllByText('首次保存时自动记录').length, 2);
  assert.ok(screen.getByLabelText('栏目'));
  assert.equal(screen.queryByLabelText('添加时间'), null);
  await user.click(screen.getByRole('tab', { name: '栏目' }));
  await user.click(screen.getByRole('button', { name: '＋ 新增栏目' }));
  assert.ok(screen.getByLabelText('标题'));
  assert.equal(screen.queryByLabelText('上级分类'), null);
  assert.equal(screen.queryByText('内容条目'), null);
  assert.equal(within(screen.getByRole('navigation', { name: '后台栏目' })).queryByRole('button', { name: '页面标题与配图', exact: true }), null);
  assert.equal(within(screen.getByRole('navigation', { name: '后台栏目' })).queryByRole('button', { name: '页面固定文案', exact: true }), null);
  assert.equal('copy' in defaults, false);
  console.log('PASS per-record admin UI and website settings tabs: explicit submit, navigation editing, preserved fields, unsaved drafts and conflict retention');
} finally {
  cleanup();
  await window.happyDOM.abort();
}
