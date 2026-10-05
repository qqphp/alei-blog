import assert from 'node:assert/strict';
import { ImapFlow } from 'imapflow';
import { readMailSettings } from '../lib/contact-mail.ts';

const origin = process.env.CONTACT_TEST_ORIGIN ?? 'http://127.0.0.1:3000';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('真实验收仅允许本地服务');
const { value, password } = await readMailSettings(true);
if (!value.enabled || !password || value.sender !== value.recipient) throw new Error('本次回读验收需要启用邮箱，且发信、收信邮箱一致');
const imap = new ImapFlow({ host: value.imapHost, port: value.imapPort, secure: true,
  auth: { user: value.sender, pass: password }, logger: false,
  clientInfo: { name: 'Alei contact verification', version: '1.0' },
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let phase = 'IMAP 连接';
async function post(path, input) {
  const response = await fetch(origin + path, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ ...input, website: '' }), signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok) {
    console.error(`本地接口返回 HTTP ${response.status}：${typeof data.error === 'string' ? data.error : '请求失败'}`);
    throw new Error('真实邮箱验收接口失败');
  }
  return data;
}
async function readTestMail(messageId) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const lock = await imap.getMailboxLock('INBOX', { readOnly: true });
    try {
      const found = await imap.search({ header: { 'message-id': messageId } }, { uid: true });
      if (found.length) {
        const uid = found.at(-1);
        const mail = await imap.fetchOne(uid, { envelope: true }, { uid: true });
        const downloaded = await imap.download(uid, '1', { uid: true });
        const chunks = []; for await (const chunk of downloaded.content) chunks.push(chunk);
        return { text: Buffer.concat(chunks).toString('utf8'), envelope: mail.envelope };
      }
    } finally { lock.release(); }
    await pause(3000);
  }
  throw new Error('IMAP 未在等待时间内找到指定测试邮件');
}
try {
  await imap.connect();
  console.log('PASS IMAP authentication; reading matching test Message-ID only');
  phase = 'HTTP 发送验证码';
  const challenge = await post('/api/contact/codes', { email: value.sender });
  phase = 'IMAP 回读验证码';
  const verification = await readTestMail(`<contact-code-${challenge.challengeId}@${value.sender.split('@')[1]}>`);
  const code = verification.text.match(/验证码是：(\d{6})/)?.[1];
  assert.ok(code, '指定验证码测试邮件必须包含六位验证码');
  assert.ok(verification.envelope.to.some((item) => item.address?.toLowerCase() === value.sender));
  console.log('PASS SMTP verification code delivered and read back through IMAP');
  const content = `本地留言功能完整验收 ${new Date().toISOString()}\n这是经邮箱验证码验证的私密测试留言。`;
  phase = 'HTTP 提交留言';
  const saved = await post('/api/contact/messages', { email: value.sender, content, code, challengeId: challenge.challengeId });
  phase = 'IMAP 回读通知';
  const notification = await readTestMail(`<contact-message-${saved.id}@${value.sender.split('@')[1]}>`);
  assert.ok(notification.text.includes(content), '通知必须包含原留言内容');
  assert.ok(notification.text.includes(value.sender), '通知必须包含留言邮箱');
  assert.ok(notification.text.includes(saved.id), '通知必须包含留言编号');
  assert.ok(notification.envelope.replyTo?.some((item) => item.address?.toLowerCase() === value.sender));
  console.log(`PASS message saved and notification delivered; matched email, content, Reply-To and ID ${saved.id}`);
} catch {
  console.error(`真实邮箱验收失败，阶段：${phase}；未输出邮件内容、验证码或授权码。`);
  process.exitCode = 1;
} finally { if (imap.usable) await imap.logout(); else imap.close(); }
