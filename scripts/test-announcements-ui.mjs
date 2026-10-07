import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Window } from 'happy-dom';

register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
for (const name of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement',
  'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'Event', 'MouseEvent', 'KeyboardEvent',
  'PointerEvent', 'FocusEvent', 'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  const value = name === 'window' ? window : window[name];
  Object.defineProperty(globalThis, name, { value: typeof value === 'function' && !/^[A-Z]/.test(name) ? value.bind(window) : value, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement } = await import('react');
const { render, screen, waitFor, cleanup, within } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { AnnouncementPopup } = await import('../components/announcement-popup.tsx');
const { AdminSidebar } = await import('../components/admin-sidebar.tsx');
const { activeAnnouncements, announcementTime, shanghaiInput, announcementReadKey } = await import('../lib/announcements.ts');
const { validateContent } = await import('../lib/cms-validation.ts');
const user = userEvent.setup({ document: window.document });
const category = { id: 'notice-type', name: '通知' };
const base = { title: '第一条公告', id: 'notice-1', categoryId: category.id, category: category.name, body: '**公告正文**',
  startAt: '2026-10-07T04:00:00.000Z', endAt: '2026-10-07T05:00:00.000Z', _published: true,
  updatedAt: '2026-10-07T04:00:00.123Z' };
assert.equal(announcementTime('2026-10-07T12:34:56'), '2026-10-07T04:34:56.000Z');
assert.equal(shanghaiInput('2026-10-07T04:34:56.000Z'), '2026-10-07T12:34:56');
assert.equal(announcementTime('2026-02-30T12:00:00'), '');
assert.deepEqual(activeAnnouncements([base], Date.parse(base.startAt)).map((item) => item.id), [base.id]);
assert.deepEqual(activeAnnouncements([base], Date.parse(base.endAt)), []);
assert.deepEqual(activeAnnouncements([{ ...base, _published: false }], Date.parse(base.startAt)), []);
assert.deepEqual(activeAnnouncements([base], Date.parse(base.startAt) - 1), []);
assert.equal(activeAnnouncements([{ ...base, endAt: '' }], Date.parse(base.endAt)).length, 1);
const { category: _category, updatedAt: _updatedAt, ...record } = base;
validateContent('announcements', { items: [record], categories: [category] });
for (const change of [{ title: '' }, { body: ' ' }, { categoryId: '' }, { startAt: '' },
  { startAt: '2026-02-30T00:00:00.000Z' }, { endAt: record.startAt }, { endAt: 'invalid' }])
  assert.throws(() => validateContent('announcements', { items: [{ ...record, ...change }], categories: [category] }));
const notices = [base, { ...base, id: 'notice-2', title: '第二条公告' }, { ...base, id: 'notice-3', title: '第三条公告' }];
render(createElement(AnnouncementPopup, { announcements: notices }));
await screen.findByRole('dialog');
assert.ok(screen.getByRole('heading', { name: '第一条公告' }));
await waitFor(() => assert.equal(JSON.parse(localStorage.getItem(announcementReadKey))[base.id], base.updatedAt));
await user.click(screen.getByRole('button', { name: '下一条公告' }));
assert.ok(screen.getByRole('heading', { name: '第二条公告' }));
await user.click(screen.getByRole('button', { name: '关闭公告' }));
await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
cleanup();
render(createElement(AnnouncementPopup, { announcements: notices }));
await screen.findByRole('heading', { name: '第三条公告' });
cleanup();
render(createElement(AnnouncementPopup, { announcements: [{ ...base, updatedAt: '2026-10-07T04:01:00.000Z' }] }));
await screen.findByRole('heading', { name: '第一条公告' });
cleanup();
localStorage.setItem(announcementReadKey, 'malformed');
render(createElement(AnnouncementPopup, { announcements: [base] }));
await screen.findByRole('heading', { name: '第一条公告' });
cleanup();
const selected = [];
const sidebarProps = { section: 'announcements', disabled: false, onSelect: (section) => { selected.push(section); return true; }, onLogout: async () => {} };
render(createElement(AdminSidebar, sidebarProps));
for (const label of ['内容', '网站', '生活', '设置']) {
  const heading = screen.getByRole('button', { name: label, exact: true });
  assert.equal(heading.getAttribute('aria-expanded'), 'true');
  assert.ok(document.getElementById(heading.getAttribute('aria-controls')));
}
assert.deepEqual(Array.from(screen.getByRole('button', { name: '网站设置' }).parentElement.querySelectorAll('button'))
  .map((button) => button.textContent), ['网站设置', '模型设置', '公告设置']);
await user.click(screen.getByRole('button', { name: '内容', exact: true }));
await user.click(screen.getByRole('button', { name: '网站', exact: true }));
assert.equal(screen.queryByRole('button', { name: '写作' }), null);
assert.equal(screen.queryByRole('button', { name: '书签' }), null);
assert.ok(screen.getByRole('button', { name: '音乐' }));
assert.equal(selected.length, 0);
screen.getByRole('button', { name: '内容', exact: true }).focus();
await user.keyboard('{Enter}');
assert.ok(screen.getByRole('button', { name: '写作' }));
await user.keyboard(' ');
assert.equal(screen.queryByRole('button', { name: '写作' }), null);
await user.click(screen.getByRole('button', { name: '收起侧栏' }));
assert.equal(localStorage.getItem('alei-admin-sidebar-collapsed'), 'true');
assert.equal(screen.getByRole('button', { name: '公告设置' }).getAttribute('aria-current'), 'page');
assert.ok(screen.getByRole('button', { name: '写作' }));
assert.ok(screen.getByRole('button', { name: '书签' }));
await user.click(screen.getByRole('button', { name: '展开侧栏' }));
assert.equal(screen.queryByRole('button', { name: '写作' }), null);
assert.equal(screen.queryByRole('button', { name: '书签' }), null);
cleanup();
render(createElement(AdminSidebar, sidebarProps));
await waitFor(() => assert.equal(screen.getByRole('button', { name: '内容', exact: true }).getAttribute('aria-expanded'), 'false'));
assert.equal(screen.getByRole('button', { name: '网站', exact: true }).getAttribute('aria-expanded'), 'false');
await user.click(screen.getByRole('button', { name: '后台菜单' }));
const drawer = await screen.findByRole('dialog');
assert.equal(within(drawer).queryByRole('button', { name: '书签' }), null);
await user.click(within(drawer).getByRole('button', { name: '网站', exact: true }));
assert.ok(within(drawer).getByRole('button', { name: '书签' }));
const controlIds = Array.from(document.querySelectorAll('[aria-controls]')).map((node) => node.getAttribute('aria-controls'));
assert.equal(new Set(controlIds).size, controlIds.length);
await user.click(within(drawer).getByRole('button', { name: '公告设置' }));
await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
assert.equal(selected.at(-1), 'announcements');
assert.ok(screen.getByRole('button', { name: '书签' }));
cleanup();
console.log('PASS announcement validity/read versions; independent menu groups, keyboard toggles, persisted state, compact access and shared mobile drawer state');
await window.happyDOM.close();
