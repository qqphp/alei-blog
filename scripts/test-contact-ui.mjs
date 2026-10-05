import { Window } from 'happy-dom';
import { register } from 'node:module';
import assert from 'node:assert/strict';
register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
for (const name of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLInputElement',
  'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLSelectElement', 'Element', 'Node', 'NodeFilter',
  'DocumentFragment', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'FocusEvent', 'MutationObserver',
  'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  const value = name === 'window' ? window : window[name];
  Object.defineProperty(globalThis, name, { value: typeof value === 'function' && !/^[A-Z]/.test(name) ? value.bind(window) : value, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const { createElement, act } = await import('react');
const { render, screen, waitFor, cleanup, within, fireEvent } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { ContactForm } = await import('../components/contact-form.tsx');
const { AboutProfile } = await import('../components/about-profile.tsx');
const { ContentProvider } = await import('../components/content-provider.tsx');
const { AdminGranularPanel } = await import('../components/admin-granular-panel.tsx');
const { defaults } = await import('../lib/cms-defaults.ts');
const user = userEvent.setup({ document: window.document });
const originalNow = Date.now;
const calls = [];
let settings = { value: { enabled: true, smtpHost: 'smtp.163.com', smtpPort: 465, imapHost: 'imap.163.com', imapPort: 993, sender: 'sender@example.com', recipient: 'owner@example.com' }, configured: true, revision: 1 };
let profile = structuredClone(defaults.profile);
const messageContent = ('<script>这是纯文本留言</script>\n' + '保留换行的长留言。\n'.repeat(400)).slice(0, 3000);
let rejectCode = false;
let rejectMessage = false;
globalThis.fetch = async (input, init = {}) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ path, body, method: init.method ?? 'GET' });
  const json = (value, status = 200) => Response.json(value, { status });
  if (path === '/api/contact/codes') return rejectCode ? json({ error: '验证码发送失败，请稍后再试', retryAt: new Date(Date.now() + 60000).toISOString() }, 502)
    : json({ challengeId: 'ui-challenge', expiresAt: new Date(Date.now() + 180000).toISOString(), retryAt: new Date(Date.now() + 60000).toISOString() });
  if (path === '/api/contact/messages') return rejectMessage ? json({ error: '验证码不正确' }, 400) : json({ id: 'ui-message-id' }, 201);
  if (path === '/api/admin/session') return json({ configured: true, authenticated: true });
  if (path.startsWith('/api/admin/options/')) return json({ categories: [] });
  if (path.startsWith('/api/admin/records/')) return json({ items: [], total: 0, page: 1, size: 20 });
  if (path === '/api/admin/config/profile/root') {
    if (init.method === 'PUT') profile = body.value;
    const entries = Object.entries(profile);
    const reorder = (item) => Object.fromEntries(Object.entries(item).reverse());
    const value = Object.fromEntries((init.method === 'PUT' ? entries.sort(([a], [b]) => a.localeCompare(b)) : entries.reverse())
      .map(([key, item]) => [key, key === 'platforms' ? item.map(reorder) : item]));
    return json({ value, revision: 1 });
  }
  if (path === '/api/admin/config/site/root') return json({ value: defaults.site, revision: 1 });
  if (path === '/api/admin/mail-settings') {
    if (init.method === 'PUT') settings = { value: body.value, configured: true, revision: settings.revision + 1 };
    return json(settings);
  }
  if (path === '/api/admin/mail-settings/test') return json({ message: body.action === 'connection' ? 'SMTP 与 IMAP 连接成功' : 'SMTP 已接受测试邮件' });
  if (path.startsWith('/api/admin/contact/')) {
    const kind = path.includes('/messages?') ? 'messages' : 'codes';
    const params = new URL(path, 'http://localhost').searchParams;
    return json({ items: [{ id: `ui-${kind}`, email: 'private@example.com', created_at: '2026-10-05T04:00:00Z', status: kind === 'messages' ? 'retry' : 'consumed',
      ...(kind === 'messages' ? { content: messageContent, recipient: 'owner@example.com', attempts: 1, next_attempt_at: '2026-10-05T04:01:00Z', last_error: '邮件通知发送失败' } : { failures: 2, expires_at: '2026-10-05T04:03:00Z' }) }], total: params.get('q') ? 1 : 21 });
  }
  if (path === '/api/admin/media') return json({ url: '/api/media/ui-community.png' });
  throw new Error(`Unexpected test request: ${path}`);
};
try {
  render(createElement(ContentProvider, { content: defaults }, createElement(AboutProfile)));
  assert.ok(screen.getByText('关注我的记录，也欢迎一起交流。'));
  assert.ok(screen.getByText('交流群二维码'));
  assert.equal(screen.queryByAltText('交流群二维码'), null, 'missing group QR must not invent an image');
  assert.ok(screen.getByText('04 / 散落在互联网'));
  assert.ok(screen.getByLabelText('软件技术服务：代码窗口与数据库'));
  cleanup();
  render(createElement(ContactForm));
  assert.ok(screen.getByText('见字如面，你的分享与想法，都值得被认真倾听。'));
  const art = window.document.querySelector('.profile-message-art');
  assert.equal(art.getAttribute('aria-hidden'), 'true');
  assert.equal(art.getAttribute('focusable'), 'false');
  assert.ok(screen.getByText('留言仅供站点管理员查看，验证邮箱后即可提交；同一邮箱每天最多留言 3 次。'));
  assert.deepEqual([...window.document.querySelector('form').querySelectorAll('textarea, input:not([tabindex="-1"])')]
    .map((node) => node.id), ['contact-content', 'contact-email', 'contact-code']);
  await user.tab(); assert.equal(window.document.activeElement, screen.getByLabelText('留言内容'));
  await user.type(screen.getByLabelText('留言内容'), '请保留这段私密留言。');
  await user.tab(); assert.equal(window.document.activeElement, screen.getByLabelText('留言邮箱'));
  await user.type(screen.getByLabelText('留言邮箱'), 'person@example.com');
  await user.tab(); assert.equal(window.document.activeElement, screen.getByRole('button', { name: '发送验证码' }));
  await user.tab(); assert.equal(window.document.activeElement, screen.getByLabelText('邮箱验证码'));
  rejectCode = true;
  await user.click(screen.getByRole('button', { name: '发送验证码' }));
  await screen.findByText('验证码发送失败，请稍后再试');
  assert.ok(screen.getByRole('button', { name: /秒后重发/ }).disabled);
  assert.equal(screen.getByRole('button', { name: '提交留言 ↗' }).disabled, true);
  await act(async () => { Date.now = () => originalNow() + 61000; await new Promise((done) => setTimeout(done, 1100)); });
  rejectCode = false;
  await user.click(screen.getByRole('button', { name: '发送验证码' }));
  await screen.findByText('验证码已发送，请查看邮箱。');
  assert.ok(screen.getByRole('button', { name: /秒后重发/ }).disabled);
  assert.ok(screen.getByText(/有效期剩余/));
  await user.type(screen.getByLabelText('邮箱验证码'), '123456');
  await user.tab(); assert.equal(window.document.activeElement, screen.getByRole('button', { name: '提交留言 ↗' }));
  rejectMessage = true;
  await user.click(screen.getByRole('button', { name: '提交留言 ↗' }));
  await screen.findByText('验证码不正确');
  assert.equal(screen.getByLabelText('留言内容').value, '请保留这段私密留言。');
  rejectMessage = false;
  await user.click(screen.getByRole('button', { name: '提交留言 ↗' }));
  await screen.findByText(/留言已保存/);
  const submitted = calls.filter((call) => call.path === '/api/contact/messages').at(-1).body;
  assert.equal(submitted.challengeId, 'ui-challenge'); assert.equal(submitted.website, '');
  assert.equal(screen.getByLabelText('留言内容').value, '');
  cleanup();
  render(createElement(ContactForm));
  await user.type(screen.getByLabelText('留言邮箱'), 'another@example.com');
  await user.click(screen.getByRole('button', { name: '发送验证码' }));
  await screen.findByText('验证码已发送，请查看邮箱。');
  await user.type(screen.getByLabelText('邮箱验证码'), '123456');
  await act(async () => { Date.now = () => originalNow() + 242000; await new Promise((done) => setTimeout(done, 1100)); });
  assert.ok(screen.getByText('验证码已过期，请重新发送'));
  assert.equal(screen.getByRole('button', { name: '提交留言 ↗' }).disabled, true);
  await user.type(screen.getByLabelText('留言邮箱'), '.changed');
  assert.equal(screen.getByLabelText('邮箱验证码').value, '');
  assert.equal(screen.getByRole('button', { name: '提交留言 ↗' }).disabled, true);
  assert.ok(screen.getByText('验证码有效期 3 分钟，仅可使用一次'));
  cleanup();
  console.log('PASS about defaults, missing QR, private form send/failure/success/cooldown and email challenge reset');

  render(createElement(AdminGranularPanel));
  const nav = await screen.findByRole('navigation', { name: '后台栏目' });
  await user.click(within(nav).getByRole('button', { name: '关于' }));
  await screen.findByLabelText('关注区标题');
  assert.deepEqual(screen.getAllByRole('tab').map((node) => node.textContent), ['设置','留言','验证码']);
  const profileOrder = () => [...screen.getByRole('region', { name: '设置表单' }).querySelectorAll('.admin-fields label')]
    .filter((node) => node.htmlFor).map((node) => node.textContent);
  const expectedOrder = ['名称', '微信号', '邮箱', '公众号二维码', '关注区标题', '关注区说明', '交流群名称', '交流群说明', '交流群二维码', '服务网址',
    ...defaults.profile.platforms.flatMap(() => ['名称', '标签 / 栏目', '网址'])];
  assert.deepEqual(profileOrder(), expectedOrder, 'initial order follows the template despite shuffled response keys');
  await user.clear(screen.getByLabelText('关注区标题')); await user.type(screen.getByLabelText('关注区标题'), '欢迎来聊开发');
  await user.type(screen.getByLabelText('交流群名称'), '开发交流');
  const qrField = screen.getByLabelText('交流群二维码').closest('.admin-field');
  const file = new window.File(['test-image'], 'qr.png', { type: 'image/png' });
  fireEvent.change(qrField.querySelector('input[type=file]'), { target: { files: [file] } });
  await waitFor(() => assert.equal(screen.getByLabelText('交流群二维码').value, '/api/media/ui-community.png'));
  await user.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() => assert.equal(profile.followTitle, '欢迎来聊开发'));
  await screen.findByText('已保存，内容已入库。');
  assert.equal(profile.communityQr, '/api/media/ui-community.png');
  assert.deepEqual(profileOrder(), expectedOrder, 'save must not reorder root or platform fields');
  assert.deepEqual(profile.platforms.map((item) => item.name), defaults.profile.platforms.map((item) => item.name));
  await user.click(within(nav).getByRole('button', { name: '网站设置' }));
  await screen.findByRole('heading', { name: '网站设置' });
  await user.click(within(nav).getByRole('button', { name: '关于' }));
  await screen.findByLabelText('关注区标题');
  assert.deepEqual(profileOrder(), expectedOrder, 'reloading retains the same field order');
  assert.equal(screen.getByLabelText('关注区标题').value, '欢迎来聊开发');
  await user.click(screen.getByRole('tab', { name: '留言' }));
  await screen.findByText('private@example.com');
  assert.equal(screen.queryByRole('button', { name: /新增|编辑|删除|重发/ }), null);
  const messageTrigger = screen.getByRole('button', { name: '查看详情' });
  await user.click(messageTrigger);
  const messageDialog = await screen.findByRole('dialog', { name: '留言详情' });
  assert.equal(messageDialog.querySelector('.admin-contact-content').textContent, messageContent);
  assert.equal(messageContent.length, 3000);
  assert.equal(window.document.querySelector('.admin-contact-detail script'), null);
  await waitFor(() => assert.equal(window.document.activeElement, within(messageDialog).getByRole('button', { name: '关闭详情' })));
  await user.tab(); assert.ok(messageDialog.contains(window.document.activeElement), 'Tab stays inside the dialog');
  await user.tab({ shift: true }); assert.ok(messageDialog.contains(window.document.activeElement), 'Shift+Tab stays inside the dialog');
  await user.keyboard('[Escape]');
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  await waitFor(() => assert.ok(window.document.activeElement === messageTrigger, 'Esc restores focus to the message trigger'));
  await user.click(messageTrigger);
  await user.click(screen.getByRole('button', { name: '关闭详情' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  await waitFor(() => assert.ok(window.document.activeElement === messageTrigger, 'close button restores focus to the message trigger'));
  await user.click(messageTrigger);
  await screen.findByRole('dialog', { name: '留言详情' });
  await user.click(window.document.querySelector('[data-slot="dialog-overlay"]'));
  await waitFor(() => assert.ok(!screen.queryByRole('dialog'), 'backdrop dismissal closes the dialog'));
  await user.type(screen.getByLabelText('搜索私密记录'), 'private');
  await waitFor(() => assert.ok(calls.at(-1).path.includes('q=private')));
  await user.selectOptions(screen.getByLabelText('按发送状态筛选'), 'retry');
  await waitFor(() => assert.ok(calls.at(-1).path.includes('status=retry')));
  await user.click(screen.getByRole('tab', { name: '验证码' }));
  await screen.findByText('private@example.com');
  await user.click(screen.getByRole('button', { name: '下一页' }));
  await waitFor(() => assert.ok(calls.at(-1).path.includes('page=2')));
  await user.click(screen.getByRole('button', { name: '查看详情' }));
  const codeDialog = await screen.findByRole('dialog', { name: '验证码详情' });
  assert.ok(within(codeDialog).getByText('2 / 5'));
  assert.equal(screen.queryByText('123456'), null);
  const codeTrigger = screen.getByRole('button', { name: '查看详情', hidden: true });
  await user.keyboard('[Escape]');
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  await waitFor(() => assert.equal(window.document.activeElement, codeTrigger));
  await user.click(codeTrigger);
  assert.ok(await screen.findByRole('dialog', { name: '验证码详情' }));
  await user.click(screen.getByRole('button', { name: '关闭详情' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  await user.click(within(nav).getByRole('button', { name: '网站设置' }));
  await user.click(screen.getByRole('tab', { name: '邮箱设置' }));
  await screen.findByLabelText('邮箱授权码');
  assert.equal(screen.getByLabelText('邮箱授权码').value, '');
  assert.equal(screen.getByLabelText('邮箱授权码').placeholder, '已配置，留空保留');
  const actions = screen.getByRole('button', { name: '保存邮箱设置' }).closest('.admin-mail-actions');
  assert.deepEqual(within(actions).getAllByRole('button').map((node) => node.textContent), ['保存邮箱设置', '检查连接', '发送测试邮件']);
  await user.clear(screen.getByLabelText('收信邮箱')); await user.type(screen.getByLabelText('收信邮箱'), 'new@example.com');
  assert.equal(screen.getByRole('button', { name: '检查连接' }).disabled, true);
  await user.click(screen.getByRole('button', { name: '保存邮箱设置' }));
  await screen.findByText('邮箱配置已保存。');
  assert.equal(calls.findLast((call) => call.path === '/api/admin/mail-settings' && call.method === 'PUT').body.password, '');
  await user.click(screen.getByRole('button', { name: '检查连接' })); await screen.findByText('SMTP 与 IMAP 连接成功');
  await user.click(screen.getByRole('button', { name: '发送测试邮件' })); await screen.findByText('SMTP 已接受测试邮件');
  cleanup();
  console.log('PASS stable profile field order after load/save/reload, read-only dialogs/focus/search/filter/pagination and mail actions');
} finally { Date.now = originalNow; await act(async () => cleanup()); await window.happyDOM.close(); }
