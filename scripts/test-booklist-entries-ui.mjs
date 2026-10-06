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
const { createElement } = await import('react');
const { render, screen, cleanup, within } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { AdminGranularPanel } = await import('../components/admin-granular-panel.tsx');
const { bookSample } = await import('../lib/book-content.ts');
const { validateContent } = await import('../lib/cms-validation.ts');
const user = userEvent.setup({ document: window.document });
let saved = { ...structuredClone(bookSample.lists[0]), title: '已有书单',
  entries: [{ title: '已有书籍', author: '已有作者' }] };
const writes = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
  if (url.pathname === '/api/admin/session')
    return Response.json({ authenticated: true, configured: true });
  if (url.pathname.startsWith('/api/admin/options/')) return Response.json({});
  const base = '/api/admin/records/books/lists';
  if ((url.pathname === base && init.method === 'POST') ||
      (url.pathname === `${base}/${saved.id}` && init.method === 'PUT')) {
    const body = JSON.parse(init.body);
    validateContent('books', { ...bookSample, lists: [body.value] });
    saved = structuredClone(body.value);
    writes.push(init.method);
    return Response.json({ value: saved, revision: 1 });
  }
  if (url.pathname === base) return Response.json({ items: [{ id: saved.id,
    title: saved.title, revision: 1, published: false, position: 0 }], total: 1, page: 1, size: 20 });
  if (url.pathname === `${base}/${saved.id}`)
    return Response.json({ value: structuredClone(saved), revision: 1 });
  if (url.pathname.startsWith('/api/admin/records/'))
    return Response.json({ items: [], total: 0, page: 1, size: 20 });
  throw new Error(`Unexpected request: ${url.pathname}`);
};

try {
  render(createElement(AdminGranularPanel));
  await user.click(await screen.findByRole('button', { name: '书籍', exact: true }));
  await user.click(await screen.findByRole('tab', { name: '书单', exact: true }));
  for (const existing of [true, false]) {
    if (existing) await user.click(await screen.findByRole('button', { name: saved.title, exact: true }));
    else await user.click(await screen.findByRole('button', { name: '＋ 新增书单' }));
    const listTitle = existing ? '已有书单' : '新增书单';
    if (!existing) await user.type(document.getElementById('books.lists.title'), listTitle);
    const entries = screen.getByRole('group', { name: /^内容条目/ });
    const original = existing ? structuredClone(saved.entries) : [];
    const rows = () => [...entries.querySelectorAll('details')];
    const writesBeforeEditing = writes.length;
    for (const row of rows()) assert.equal(row.open, true, '已有条目默认展开');
    if (original.length) rows()[0].open = false;
    for (let index = 0; index < 2; index++) {
      await user.click(within(entries).getByRole('button', { name: '＋ 添加一项' }));
      const row = rows()[original.length + index];
      assert.equal(row.open, true, '新增条目自动展开');
      assert.ok(row.parentElement.classList.contains('admin-array-item'), '书单沿用歌单紧凑布局');
      assert.equal(row.querySelector('summary').textContent, `条目 ${original.length + index + 1}`);
      const title = within(row).getByLabelText('标题');
      const author = within(row).getByLabelText('作者');
      assert.equal(title.value, '', '新增标题为空，不填入未命名内容');
      assert.equal(author.value, '', '新增条目包含空作者字段');
      await user.type(title, `新增书籍${index}`);
      await user.type(author, `新增作者${index}`);
      assert.equal(row.querySelector('summary').textContent, `新增书籍${index}`);
      if (original.length) assert.equal(rows()[0].open, false, '新增和输入保留已有折叠状态');
      if (index > 0) assert.equal(rows()[original.length].open, false, '保留前一条新增项的折叠状态');
      else row.open = false;
    }
    const expected = [...original, { title: '新增书籍0', author: '新增作者0' },
      { title: '新增书籍1', author: '新增作者1' }];
    const lastTitle = within(rows().at(-1)).getByLabelText('标题');
    await user.clear(lastTitle);
    assert.equal(rows().at(-1).querySelector('summary').textContent, `条目 ${expected.length}`);
    await user.type(lastTitle, '新增书籍1');
    await user.click(within(entries).getByRole('button', { name: '＋ 添加一项' }));
    assert.equal(rows().at(-1).querySelector('summary').textContent, `条目 ${expected.length + 1}`);
    await user.click(within(rows().at(-1).parentElement).getByRole('button', { name: '上移' }));
    assert.equal(rows()[expected.length - 1].querySelector('summary').textContent, `条目 ${expected.length}`);
    assert.equal(rows()[expected.length - 1].open, true, '上移按钮不触发折叠');
    await user.click(within(rows()[expected.length - 1].parentElement).getByRole('button', { name: '下移' }));
    assert.equal(rows().at(-1).querySelector('summary').textContent, `条目 ${expected.length + 1}`);
    await user.click(within(rows().at(-1).parentElement).getByRole('button', { name: '删除' }));
    assert.equal(rows().length, expected.length);
    assert.equal(rows().at(-1).open, true, '删除按钮不触发其他条目折叠');
    await user.click(within(entries).getByRole('button', { name: '＋ 添加一项' }));
    assert.equal(rows().at(-1).querySelector('summary').textContent, `条目 ${expected.length + 1}`, '删除后按当前位置重新编号');
    await user.click(within(rows().at(-1).parentElement).getByRole('button', { name: '删除' }));
    assert.equal(writes.length, writesBeforeEditing, '新增、编辑、排序、删除不自动提交');
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    await user.click(await screen.findByRole('button', { name: listTitle, exact: true }));
    const reloaded = screen.getByRole('group', { name: /^内容条目/ });
    const reloadedRows = reloaded.querySelectorAll('details');
    assert.deepEqual(saved.entries, expected, '提交结构保留每项标题和作者');
    assert.equal(reloadedRows.length, expected.length);
    expected.forEach((entry, index) => {
      assert.equal(reloadedRows[index].open, true, '重新加载的条目默认展开');
      assert.equal(within(reloadedRows[index]).getByLabelText('标题').value, entry.title);
      assert.equal(within(reloadedRows[index]).getByLabelText('作者').value, entry.author);
    });
    await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  }
  assert.deepEqual(writes, ['PUT', 'POST']);
  console.log('PASS booklist empty templates, compact expansion, summaries/numbering, preserved collapse, move/delete and explicit save/reload');
} finally {
  cleanup();
  await window.happyDOM.close();
}
