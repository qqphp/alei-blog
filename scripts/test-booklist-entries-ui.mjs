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
    for (let index = 0; index < 2; index++) {
      await user.click(within(entries).getByRole('button', { name: '＋ 添加一项' }));
      const row = entries.querySelectorAll('details')[original.length + index];
      await user.click(row.querySelector('summary'));
      const title = within(row).getByLabelText('标题');
      const author = within(row).getByLabelText('作者');
      assert.equal(author.value, '', '新增条目包含空作者字段');
      await user.clear(title);
      await user.type(title, `新增书籍${index}`);
      await user.type(author, `新增作者${index}`);
    }
    const expected = [...original, { title: '新增书籍0', author: '新增作者0' },
      { title: '新增书籍1', author: '新增作者1' }];
    await user.click(screen.getByRole('button', { name: '确认提交' }));
    await user.click(await screen.findByRole('button', { name: listTitle, exact: true }));
    const reloaded = screen.getByRole('group', { name: /^内容条目/ });
    const rows = reloaded.querySelectorAll('details');
    assert.deepEqual(saved.entries, expected, '提交结构保留每项标题和作者');
    assert.equal(rows.length, expected.length);
    expected.forEach((entry, index) => {
      assert.equal(within(rows[index]).getByLabelText('标题').value, entry.title);
      assert.equal(within(rows[index]).getByLabelText('作者').value, entry.author);
    });
    await user.click(screen.getByRole('button', { name: '← 返回列表' }));
  }
  assert.deepEqual(writes, ['PUT', 'POST']);
  console.log('PASS booklist create/edit entries retain independent title and author fields through save/reload');
} finally {
  cleanup();
  await window.happyDOM.close();
}
