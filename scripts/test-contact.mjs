import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac, createCipheriv } from 'node:crypto';
import { readFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { postgresTool, postgresEnvironment } from './postgres-tools.mjs';

const source = new URL(process.env.DATABASE_URL);
const name = `alei_contact_test_${Date.now()}`;
const restoredName = `${name}_restored`;
const keyBackup = resolve('.local', `${name}.dump`);
const url = new URL(source); url.pathname = `/${name}`;
const admin = new pg.Client({ host: source.hostname, port: Number(source.port), user: 'postgres',
  password: (await readFile(resolve('.local/postgres18/admin-password'), 'utf8')).trim(), database: 'postgres' });
await admin.connect();
let db;
const previousUrl = process.env.DATABASE_URL;
const previousKey = process.env.MAIL_ENCRYPTION_KEY;
const previousSmtpAuth = process.env.SMTP_AUTH_CODE;
const previousAdminPassword = process.env.ADMIN_PASSWORD;
try {
  await admin.query(`CREATE DATABASE ${name} OWNER alei_blog`);
  const archives = (await readdir('.local/backups')).filter((value) => value.startsWith('alei-')).sort();
  const restored = spawnSync(postgresTool('pg_restore'), ['--no-owner', '--no-acl', '-d', name,
    resolve('.local/backups', archives.at(-1), 'database.dump')], { encoding: 'utf8', env: postgresEnvironment(url.toString()) });
  assert.equal(restored.status, 0, restored.stderr);
  process.env.DATABASE_URL = url.toString();
  process.env.ADMIN_PASSWORD = '  Literal-Admin-Password:<script>\'"&😀  ';
  delete process.env.MAIL_ENCRYPTION_KEY;
  delete process.env.SMTP_AUTH_CODE;
  process.env.CONTACT_MAIL_WORKER_ENABLED = '0';
  const migrated = spawnSync(process.execPath, ['scripts/migrate-postgres.mjs'], { encoding: 'utf8', env: process.env });
  assert.equal(migrated.status, 0, migrated.stderr);
  db = new pg.Client({ connectionString: url.toString() }); await db.connect();
  await db.query('TRUNCATE contact_codes, contact_messages, contact_limits, contact_mail_settings, contact_mail_keys');
  const { saveMailSettings, readMailSettings, mailDefaults, encryptionKey } = await import('../lib/contact-mail.ts');
  const { withDatabase } = await import('../lib/postgres.ts');
  const { requestContactCode, submitContactMessage, processContactNotifications, listContactRecords, shanghaiDay } = await import('../lib/contact-service.ts');
  const { contactIp } = await import('../lib/contact-http.ts');
  const { sessionCookie } = await import('../lib/admin-auth.ts');
  const codesRoute = await import('../app/api/contact/codes/route.ts');
  const messagesRoute = await import('../app/api/contact/messages/route.ts');
  const configRoute = await import('../app/api/admin/mail-settings/route.ts');
  const recordsRoute = await import('../app/api/admin/contact/[kind]/route.ts');
  const sessionRoute = await import('../app/api/admin/session/route.ts');
  const settings = { ...mailDefaults, enabled: true, sender: 'sender@example.com', recipient: 'owner@example.com' };
  await readMailSettings();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_mail_keys')).rows[0].n, 0, 'metadata reads do not initialize a key');
  await assert.rejects(saveMailSettings({ value: settings, password: '', revision: 0 }), /请填写授权码/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_mail_keys')).rows[0].n, 0, 'failed settings transaction rolls back key initialization');
  const keys = await Promise.all(Array.from({ length: 8 }, () => withDatabase((client) => encryptionKey(client))));
  assert.equal(keys[0].length, 32);
  assert.ok(keys.every((key) => key.equals(keys[0])), 'concurrent initialization uses one key');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_mail_keys')).rows[0].n, 1);
  const restarted = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "import pg from 'pg'; import { encryptionKey } from './lib/contact-mail.ts'; const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect(); try { const old = (await db.query('SELECT key FROM contact_mail_keys')).rows[0].key; if (!(await encryptionKey(db)).equals(old)) throw new Error('key changed'); console.log('KEY_REUSED'); } finally { await db.end(); }"],
    { encoding: 'utf8', env: process.env });
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.equal(restarted.stdout.trim(), 'KEY_REUSED');
  console.log('PASS automatic database key initialization, concurrent first use and process restart');

  await db.query('TRUNCATE contact_mail_keys, contact_mail_settings');
  process.env.SMTP_AUTH_CODE = 'mock-environment-authorization';
  await db.query('INSERT INTO contact_mail_settings(id,value) VALUES (true,$1)', [settings]);
  let firstMail;
  const firstTime = new Date();
  const firstChallenge = await requestContactCode('first@example.com', 'first', async (mail) => { firstMail = mail; }, firstTime);
  const firstKey = (await db.query('SELECT key FROM contact_mail_keys')).rows[0].key;
  assert.equal(firstKey.length, 32, 'first code request initializes the database key inside its transaction');
  const firstCode = firstMail.text.match(/验证码是：(\d{6})/)[1];
  await db.query('TRUNCATE contact_mail_keys');
  await assert.rejects(withDatabase((client) => encryptionKey(client)), /旧密钥/, 'active challenges also prevent replacement without a legacy key');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_mail_keys')).rows[0].n, 0);
  await db.query('INSERT INTO contact_mail_keys(id,key) VALUES (true,$1)', [firstKey]);
  await submitContactMessage({ email: 'first@example.com', content: '首次调用流程', challengeId: firstChallenge.challengeId, code: firstCode }, 'first', firstTime);
  await db.query('TRUNCATE contact_mail_keys, contact_mail_settings, contact_codes, contact_messages, contact_limits');
  delete process.env.SMTP_AUTH_CODE;
  console.log('PASS first code request and message submission without an environment key, active-code-only migration protection');

  const legacyKey = randomBytes(32), nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', legacyKey, nonce);
  const ciphertext = Buffer.concat([cipher.update('mock-legacy-authorization', 'utf8'), cipher.final()]);
  const legacySecret = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
  await db.query('INSERT INTO contact_mail_settings(id,value,secret) VALUES (true,$1,$2)', [settings, legacySecret]);
  const legacyId = randomUUID(), legacyEmail = 'legacy@example.com', legacyCode = '654321', legacyTime = new Date();
  const legacyDigest = createHmac('sha256', legacyKey).update(`${legacyId}\n${legacyEmail}\n${legacyCode}`).digest('hex');
  await db.query("INSERT INTO contact_codes(id,email,digest,status,created_at,expires_at) VALUES ($1,$2,$3,'sent',$4,$5)",
    [legacyId, legacyEmail, legacyDigest, legacyTime, new Date(legacyTime.getTime() + 180000)]);
  await assert.rejects(withDatabase((client) => encryptionKey(client)), /旧密钥/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_mail_keys')).rows[0].n, 0);
  process.env.MAIL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  await assert.rejects(withDatabase((client) => encryptionKey(client)), /旧密钥/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_mail_keys')).rows[0].n, 0);
  process.env.MAIL_ENCRYPTION_KEY = legacyKey.toString('base64');
  const databaseKey = await withDatabase((client) => encryptionKey(client));
  assert.ok(databaseKey.equals(legacyKey));
  delete process.env.MAIL_ENCRYPTION_KEY;
  assert.equal((await readMailSettings(true)).password, 'mock-legacy-authorization');
  await submitContactMessage({ email: legacyEmail, content: '迁移后验证', challengeId: legacyId, code: legacyCode }, 'legacy', legacyTime);
  process.env.MAIL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  assert.ok((await withDatabase((client) => encryptionKey(client))).equals(databaseKey), 'database key takes precedence after migration');
  delete process.env.MAIL_ENCRYPTION_KEY;
  await db.query('TRUNCATE contact_codes, contact_messages, contact_limits, contact_mail_settings');
  console.log('PASS legacy key migration preserves ciphertext and active challenges, missing or wrong legacy key does not overwrite data');
  process.env.SMTP_AUTH_CODE = 'mock-environment-authorization';
  const environmentSettings = await readMailSettings(true);
  assert.equal(environmentSettings.configured, true, 'environment authorization configures the mail service');
  assert.equal(environmentSettings.password, 'mock-environment-authorization');
  const savedWithEnvironment = await saveMailSettings({ value: settings, password: '', revision: 0 });
  assert.equal(savedWithEnvironment.configured, true, 'saving an enabled service accepts environment authorization');
  assert.equal((await db.query('SELECT secret FROM contact_mail_settings')).rows[0].secret, '', 'environment authorization stays out of the database');
  await db.query('TRUNCATE contact_mail_settings');
  delete process.env.SMTP_AUTH_CODE;
  let config = await saveMailSettings({ value: settings, password: 'mock-authorization', revision: 0 });
  assert.equal(config.configured, true);
  assert.ok(!JSON.stringify(config).includes('mock-authorization'));
  const encrypted = (await db.query('SELECT secret FROM contact_mail_settings')).rows[0].secret;
  assert.notEqual(encrypted, 'mock-authorization');
  config = await saveMailSettings({ value: settings, password: '', revision: config.revision });
  assert.equal((await db.query('SELECT secret FROM contact_mail_settings')).rows[0].secret, encrypted);
  await assert.rejects(saveMailSettings({ value: settings, password: '', revision: 0 }), /配置已更新/);
  assert.equal((await readMailSettings(true)).password, 'mock-authorization');
  process.env.SMTP_AUTH_CODE = 'mock-environment-authorization';
  await db.query('UPDATE contact_mail_settings SET secret=$1', ['unreadable-old-ciphertext']);
  assert.equal((await readMailSettings(true)).password, 'mock-environment-authorization', 'environment authorization overrides old ciphertext');
  assert.ok(!JSON.stringify(await readMailSettings()).includes('mock-environment-authorization'));
  await db.query('UPDATE contact_mail_settings SET secret=$1', [encrypted]);
  delete process.env.SMTP_AUTH_CODE;
  assert.equal((await readMailSettings(true)).password, 'mock-authorization', 'database authorization remains the fallback');
  console.log('PASS environment authorization without database secret, precedence, private reads and encrypted fallback');
  const sent = new Map();
  const send = async (mail) => { sent.set(mail.messageId.match(/contact-code-([^@]+)/)?.[1] ?? mail.messageId, mail); };
  const clock = new Date('2026-10-05T04:00:00Z');
  const at = (seconds) => new Date(clock.getTime() + seconds * 1000);
  const codeFor = (challenge) => sent.get(challenge.challengeId).text.match(/验证码是：(\d{6})/)[1];
  const payload = (challenge, email, content = '私密留言 <b>保留纯文本</b>') => ({ email, content, challengeId: challenge.challengeId, code: codeFor(challenge) });
  let challenge = await requestContactCode('  PERSON@Example.com ', 'one', send, clock);
  assert.equal(challenge.expiresAt, at(180).toISOString());
  assert.ok(!JSON.stringify(challenge).includes(codeFor(challenge)));
  assert.equal((await db.query('SELECT email FROM contact_codes WHERE id=$1', [challenge.challengeId])).rows[0].email, 'person@example.com');
  await assert.rejects(requestContactCode('person@example.com', 'one', send, at(59)), /60 秒/);
  await assert.rejects(submitContactMessage(payload(challenge, 'other@example.com'), 'one', at(1)), /失效/);
  await assert.rejects(submitContactMessage(payload(challenge, 'person@example.com'), 'one', at(180)), /失效/);
  const newer = await requestContactCode('person@example.com', 'one', send, at(61));
  await assert.rejects(submitContactMessage(payload(challenge, 'person@example.com'), 'one', at(62)), /失效/);
  const concurrent = await Promise.allSettled(Array.from({ length: 12 }, () => submitContactMessage(payload(newer, 'person@example.com'), 'one', at(62))));
  assert.equal(concurrent.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM contact_messages WHERE email='person@example.com'")).rows[0].n, 1);
  await assert.rejects(submitContactMessage({ ...payload(newer, 'person@example.com'), content: 'x'.repeat(3001) }, 'one', at(63)), /3000/);
  console.log('PASS expiry, normalization, email binding, resend invalidation and concurrent one-time consumption');

  const securityText = '<script>alert(1)</script><img src=x onerror=alert(1)>\n\' OR 1=1; DROP TABLE contact_messages; --\n中文😀\t制表符\r\nBcc: attacker@example.com';
  const securityCode = await requestContactCode('security@example.com', 'security', send, clock);
  for (const content of ['', '  ', 42, null, {}, [], 'x'.repeat(3001)])
    await assert.rejects(submitContactMessage({ ...payload(securityCode, 'security@example.com'), content }, 'security', at(1)), /3000/);
  for (const char of ['\0', '\x01', '\x0b', '\x1f', '\x7f', '\x85'])
    await assert.rejects(submitContactMessage(payload(securityCode, 'security@example.com', `内容${char}结尾`), 'security', at(1)), /控制字符/);
  for (const email of ['person@example.com\r\nBcc: attacker@example.com', 'person@example.com\0', {}, 42])
    await assert.rejects(requestContactCode(email, 'security', send, clock), /邮箱/);
  const securityMessage = await submitContactMessage(payload(securityCode, 'security@example.com', securityText), 'security', at(1));
  assert.equal((await db.query('SELECT content FROM contact_messages WHERE id=$1', [securityMessage.id])).rows[0].content, securityText);
  const securityMails = [];
  await processContactNotifications(async (mail) => { securityMails.push(mail); }, at(2));
  const securityMail = securityMails.find((mail) => mail.replyTo === 'security@example.com');
  assert.ok(securityMail.text.endsWith(securityText));
  assert.equal(securityMail.html, undefined);
  assert.equal(securityMail.bcc, undefined);
  const boundaryCode = await requestContactCode('boundary@example.com', 'boundary', send, clock);
  const boundaryText = '😀'.repeat(3000);
  const boundaryMessage = await submitContactMessage(payload(boundaryCode, 'boundary@example.com', boundaryText), 'boundary', at(1));
  assert.equal((await db.query('SELECT content FROM contact_messages WHERE id=$1', [boundaryMessage.id])).rows[0].content, boundaryText);
  const singleCode = await requestContactCode('single@example.com', 'single', send, clock);
  await submitContactMessage(payload(singleCode, 'single@example.com', '字'), 'single', at(1));
  console.log('PASS literal script/SQL storage and text-only mail, control/type validation, header injection rejection and Unicode length boundaries');

  challenge = await requestContactCode('wrong@example.com', 'wrong', send, clock);
  const wrong = codeFor(challenge) === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await assert.rejects(submitContactMessage({ ...payload(challenge, 'wrong@example.com'), code: wrong }, 'wrong', at(i)), /验证码/);
  await assert.rejects(submitContactMessage(payload(challenge, 'wrong@example.com'), 'wrong', at(6)), /失效/);
  const locked = (await db.query('SELECT status, failures FROM contact_codes WHERE id=$1', [challenge.challengeId])).rows[0];
  assert.deepEqual(locked, { status: 'locked', failures: 5 });
  await assert.rejects(requestContactCode('fail@example.com', 'failed', async () => { throw new Error('SMTP unavailable'); }, clock), /发送失败/);
  await assert.rejects(requestContactCode('fail@example.com', 'failed', send, at(1)), /60 秒/);
  assert.equal((await db.query("SELECT count FROM contact_limits WHERE bucket='code:email:fail@example.com:2026-10-05'")).rows[0].count, 1);
  for (let i = 0; i < 10; i++) await requestContactCode('limit@example.com', 'limit', send, at(i * 61));
  await assert.rejects(requestContactCode('limit@example.com', 'limit', send, at(610)), /频繁/);
  for (let i = 0; i < 20; i++) await requestContactCode(`ip${i}@example.com`, 'hour', send, clock);
  await assert.rejects(requestContactCode('ip20@example.com', 'hour', send, clock), /频繁/);
  await db.query("INSERT INTO contact_limits VALUES ('code:ip:day:2026-10-05',100,$1),('code:global:2026-10-05',499,$1) ON CONFLICT (bucket) DO UPDATE SET count=excluded.count,expires_at=excluded.expires_at", [new Date('2026-10-05T16:00:00Z')]);
  await assert.rejects(requestContactCode('day@example.com', 'day', send, clock), /频繁/);
  await requestContactCode('global499@example.com', 'global', send, clock);
  await assert.rejects(requestContactCode('global500@example.com', 'global', send, clock), /频繁/);
  await requestContactCode('limit@example.com', 'next-day', send, new Date('2026-10-05T16:00:00Z'));
  assert.equal(shanghaiDay(new Date('2026-10-05T15:59:59Z')), '2026-10-05');
  assert.equal(shanghaiDay(new Date('2026-10-05T16:00:00Z')), '2026-10-06');
  console.log('PASS wrong-attempt lock, failed-send accounting, cooldown, email/IP/global limits and Shanghai day boundary');

  // Independent valid challenges exercise the daily quota transaction under contention.
  const fixtures = [];
  for (let i = 0; i < 6; i++) {
    const id = randomUUID(), email = 'quota@example.com', code = '123456';
    const digest = createHmac('sha256', databaseKey).update(`${id}\n${email}\n${code}`).digest('hex');
    await db.query("INSERT INTO contact_codes(id,email,digest,status,created_at,expires_at) VALUES ($1,$2,$3,'sent',$4,$5)", [id, email, digest, clock, at(180)]);
    fixtures.push({ email, code, challengeId: id, content: `并发留言 ${i}` });
  }
  const quota = await Promise.allSettled(fixtures.map((input) => submitContactMessage(input, 'quota', at(1))));
  assert.equal(quota.filter((value) => value.status === 'fulfilled').length, 3);
  assert.ok(quota.filter((value) => value.status === 'rejected').every((value) => value.reason.status === 429));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM contact_messages WHERE email='quota@example.com'")).rows[0].n, 3);
  await db.query("UPDATE contact_codes SET expires_at='2026-10-05T16:03:00Z' WHERE email='quota@example.com' AND status='sent'");
  const unused = fixtures.find((input) => quota[fixtures.indexOf(input)].status === 'rejected');
  await submitContactMessage(unused, 'quota', new Date('2026-10-05T16:00:01Z'));
  console.log('PASS concurrent daily three-message quota and reset without refunding failed notification');

  const waitingId = randomUUID(), waitingEmail = 'wait@example.com';
  const waitingDigest = createHmac('sha256', databaseKey).update(`${waitingId}\n${waitingEmail}\n123456`).digest('hex');
  await db.query("INSERT INTO contact_codes(id,email,digest,status,created_at,expires_at) VALUES ($1,$2,$3,'sent',now(),now()+interval '100 milliseconds')", [waitingId, waitingEmail, waitingDigest]);
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('contact-limits'))");
  const waiting = submitContactMessage({ email: waitingEmail, code: '123456', challengeId: waitingId, content: '等待锁时过期' }, 'waiting')
    .then(() => false, (error) => /失效/.test(error.message));
  await new Promise((done) => setTimeout(done, 300));
  await db.query('COMMIT');
  assert.equal(await waiting, true, 'expiry must be checked after acquiring the transaction lock');
  console.log('PASS expiry while waiting for the database lock');

  await db.query('DELETE FROM contact_messages');
  const queuedId = randomUUID();
  await db.query("INSERT INTO contact_messages(id,email,content,recipient,created_at,next_attempt_at,message_id) VALUES ($1::uuid,$2,$3,$4,$5,$5,'<contact-message-' || $1::uuid::text || '@example.com>')", [queuedId, 'reply@example.com', '原始 <script>纯文本</script>', 'owner@example.com', clock]);
  const notifications = [];
  const failing = async (mail) => { notifications.push(mail); throw new Error('SMTP failed'); };
  const state = async () => (await db.query('SELECT * FROM contact_messages WHERE id=$1', [queuedId])).rows[0];
  await Promise.all([processContactNotifications(failing, clock), processContactNotifications(failing, clock)]);
  assert.equal(notifications.length, 1, 'leases must prevent concurrent send');
  assert.equal((await state()).attempts, 1);
  assert.equal((await state()).next_attempt_at.toISOString(), at(60).toISOString());
  await processContactNotifications(failing, at(59)); assert.equal(notifications.length, 1);
  config = await saveMailSettings({ value: { ...settings, sender: 'changed@different.example.com' }, password: '', revision: config.revision });
  await processContactNotifications(failing, at(60)); assert.equal((await state()).next_attempt_at.toISOString(), at(360).toISOString());
  await processContactNotifications(failing, at(360)); assert.equal((await state()).next_attempt_at.toISOString(), at(1260).toISOString());
  await processContactNotifications(failing, at(1260)); assert.equal((await state()).next_attempt_at.toISOString(), at(4860).toISOString());
  await processContactNotifications(failing, at(4860)); assert.equal((await state()).status, 'failed');
  await processContactNotifications(failing, at(8460)); assert.equal(notifications.length, 5);
  assert.equal(new Set(notifications.map((mail) => mail.messageId)).size, 1);
  assert.equal(notifications[0].replyTo, 'reply@example.com');
  assert.ok(notifications[0].text.includes('原始 <script>纯文本</script>'));
  await db.query("UPDATE contact_messages SET status='sending',attempts=1,lease_until=$2,lease_token=$3,next_attempt_at=$2 WHERE id=$1", [queuedId, at(1), randomUUID()]);
  await processContactNotifications(async () => {}, at(2));
  assert.equal((await state()).status, 'sent'); assert.equal((await state()).attempts, 2);
  console.log('PASS durable notification leases, restart recovery, retry schedule, fixed Message-ID and final failure');

  const origin = 'http://localhost:8895';
  const cookie = await sessionCookie(new Request(origin));
  const req = (path, body, options = {}) => new Request(origin + path, { method: body ? 'POST' : 'GET',
    headers: { origin, 'content-type': 'application/json', ...options.headers }, ...(body ? { body: JSON.stringify(body) } : {}), ...options });
  const rawRequest = (path, body, headers = {}) => new Request(origin + path, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers }, body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) });
  const stream = (size) => new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"content":"'));
    controller.enqueue(new Uint8Array(size).fill(120));
    controller.close();
  } });
  for (const [path, route, maximum] of [
    ['/api/admin/session', sessionRoute, 4096], ['/api/contact/codes', codesRoute, 16000], ['/api/contact/messages', messagesRoute, 16000],
  ]) {
    for (const type of ['text/plain', 'application/jsonp', 'application/json-extra', ''])
      assert.equal((await route.POST(rawRequest(path, '{}', { 'content-type': type }))).status, 415);
    for (const body of ['null', '[]', '1', '"text"', '{', '{"password":null}', '{"website":0}'])
      assert.equal((await route.POST(rawRequest(path, body))).status, 400);
    const invalidUtf8 = Buffer.concat([Buffer.from('{"password":"'), Buffer.from([0xc3, 0x28]), Buffer.from('","website":""}')]);
    assert.equal((await route.POST(rawRequest(path, invalidUtf8))).status, 400);
    assert.equal((await route.POST(rawRequest(path, stream(maximum)))).status, 413, 'stream limit without Content-Length');
    assert.equal((await route.POST(rawRequest(path, '{}', { 'content-length': String(maximum + 1) }))).status, 413);
    assert.equal((await route.POST(rawRequest(path, '{}', { origin: 'http://evil.test' }))).status, 403);
    assert.equal((await route.POST(rawRequest(path, '{}', { origin: '' }))).status, 403);
  }
  for (const password of ['', 123, null, [], {}, 'x'.repeat(257)])
    assert.equal((await sessionRoute.POST(req('/api/admin/session', { password }))).status, 400);
  await db.query('DELETE FROM cms_login_attempts');
  for (const password of ['x', 'x'.repeat(256), "' OR 1=1 --", '<script>alert(1)</script>', { $ne: null }]) {
    const response = await sessionRoute.POST(req('/api/admin/session', { password }));
    assert.equal(response.status, typeof password === 'string' ? 401 : 400);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const exactPassword = process.env.ADMIN_PASSWORD;
  assert.equal((await sessionRoute.POST(req('/api/admin/session', { password: exactPassword.trim() }))).status, 401);
  const login = await sessionRoute.POST(rawRequest('/api/admin/session', JSON.stringify({ password: exactPassword }), { 'content-type': 'Application/JSON; charset=utf-8' }));
  assert.equal(login.status, 200);
  assert.ok(login.headers.get('set-cookie').includes('HttpOnly; SameSite=Strict'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cms_login_attempts')).rows[0].n, 0);
  for (let i = 0; i < 10; i++) assert.equal((await sessionRoute.POST(req('/api/admin/session', { password: 'wrong' }))).status, 401);
  assert.equal((await sessionRoute.POST(req('/api/admin/session', { password: exactPassword }))).status, 429);
  await db.query('UPDATE cms_login_attempts SET expires = $1', [Date.now() - 1]);
  assert.equal((await sessionRoute.POST(req('/api/admin/session', { password: exactPassword }))).status, 200);
  for (const route of [codesRoute, messagesRoute])
    assert.equal((await route.POST(rawRequest('/api/contact/test', '{"website":""}', { 'content-type': 'Application/JSON; charset=utf-8' }))).status, 400, 'JSON parameters accepted, required fields validated');
  console.log('PASS strict JSON/UTF-8/shape/stream limits, CSRF, literal passwords, no injection bypass and durable login throttling');
  assert.equal((await codesRoute.POST(req('/api/contact/codes', { email: 'a@example.com', website: '' }, { headers: { origin: 'http://evil.test', 'content-type': 'application/json' } }))).status, 403);
  assert.equal((await codesRoute.POST(req('/api/contact/codes', { email: 'a@example.com', website: 'bot' }))).status, 400);
  assert.equal((await messagesRoute.POST(req('/api/contact/messages', { website: '', content: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await configRoute.GET(req('/api/admin/mail-settings'))).status, 401);
  assert.equal((await recordsRoute.GET(req('/api/admin/contact/messages'), { params: Promise.resolve({ kind: 'messages' }) })).status, 401);
  const authenticated = (path) => req(path, null, { headers: { cookie } });
  const configResponse = await configRoute.GET(authenticated('/api/admin/mail-settings'));
  assert.equal(configResponse.headers.get('cache-control'), 'no-store');
  const serialized = await configResponse.text(); assert.ok(!serialized.includes('mock-authorization') && !serialized.includes(encrypted));
  assert.ok(!serialized.includes(databaseKey.toString('base64')) && !serialized.includes(databaseKey.toString('hex')));
  const savedSettings = JSON.parse(serialized);
  const putBody = { value: savedSettings.value, revision: savedSettings.revision, password: '' };
  assert.equal((await configRoute.PUT(req('/api/admin/mail-settings', putBody, { method: 'PUT' }))).status, 401);
  assert.equal((await configRoute.PUT(req('/api/admin/mail-settings', putBody, { method: 'PUT', headers: { cookie, origin: 'http://evil.test', 'content-type': 'application/json' } }))).status, 403);
  const updated = await configRoute.PUT(req('/api/admin/mail-settings', putBody, { method: 'PUT', headers: { cookie, origin, 'content-type': 'application/json' } }));
  assert.equal(updated.status, 200);
  assert.equal((await db.query('SELECT secret FROM contact_mail_settings')).rows[0].secret, encrypted);
  assert.equal(recordsRoute.POST, undefined);
  const { getPublicContent } = await import('../lib/cms-server.ts');
  const { getAdminConfig, saveAdminConfig } = await import('../lib/admin-records.ts');
  const { defaults } = await import('../lib/cms-defaults.ts');
  const storedProfile = (await db.query("SELECT value FROM cms_sections WHERE section='profile'")).rows[0].value;
  const { publicAccountName: _accountName, publicAccountDescription: _accountDescription, ...oldProfile } = storedProfile;
  await db.query("UPDATE cms_sections SET value=$1 WHERE section='profile'", [oldProfile]);
  const legacyConfig = await getAdminConfig('profile', 'root');
  assert.equal(legacyConfig.value.publicAccountName, defaults.profile.publicAccountName);
  assert.equal(legacyConfig.value.publicAccountDescription, defaults.profile.publicAccountDescription);
  const legacyPublic = (await getPublicContent(['profile'])).profile;
  assert.equal(legacyPublic.publicAccountName, defaults.profile.publicAccountName);
  assert.equal(legacyPublic.publicAccountDescription, defaults.profile.publicAccountDescription);
  const updatedProfile = { ...legacyConfig.value, publicAccountName: '安全测试公众号', publicAccountDescription: '扫码关注测试更新' };
  await saveAdminConfig('profile', 'root', updatedProfile, legacyConfig.revision);
  const persistedProfile = (await db.query("SELECT value FROM cms_sections WHERE section='profile'")).rows[0].value;
  assert.deepEqual(persistedProfile, { ...oldProfile, publicAccountName: '安全测试公众号', publicAccountDescription: '扫码关注测试更新' });
  const reloadedProfile = await getAdminConfig('profile', 'root');
  assert.equal(reloadedProfile.value.publicAccountName, '安全测试公众号');
  assert.equal((await getPublicContent(['profile'])).profile.publicAccountDescription, '扫码关注测试更新');
  await saveAdminConfig('profile', 'root', { publicAccountDescription: '' }, reloadedProfile.revision);
  assert.equal((await getPublicContent(['profile'])).profile.publicAccountDescription, '');
  console.log('PASS legacy profile defaults, public/admin config readback, persisted captions and empty description');
  const publicData = JSON.stringify(await getPublicContent(['profile']));
  assert.ok(!publicData.includes('mock-authorization') && !publicData.includes('reply@example.com') && !publicData.includes('contact_messages'));
  assert.ok(!publicData.includes(databaseKey.toString('base64')) && !publicData.includes(databaseKey.toString('hex')));
  const records = await recordsRoute.GET(authenticated('/api/admin/contact/codes'), { params: Promise.resolve({ kind: 'codes' }) });
  const recordData = await records.json(); assert.ok(recordData.items.every((item) => !('digest' in item) && !('code' in item)));
  const list = await listContactRecords('messages', new URLSearchParams({ q: 'reply@example.com', status: 'sent' })); assert.equal(list.total, 1);
  for (let i = 0; i < 23; i++) await db.query("INSERT INTO contact_messages(id,email,content,recipient,created_at,next_attempt_at,message_id) VALUES ($1::uuid,$2,$3,$4,$5,$5,'<contact-message-' || $1::uuid::text || '@example.com>')", [randomUUID(), 'page@example.com', `分页${i}`, 'owner@example.com', at(i)]);
  assert.equal((await listContactRecords('messages', new URLSearchParams({ q: 'page@example.com' }))).items.length, 20);
  assert.equal((await listContactRecords('messages', new URLSearchParams({ q: 'page@example.com', page: '2' }))).items.length, 3);
  process.env.CONTACT_TRUST_PROXY = '0'; assert.equal(contactIp(req('/api', null, { headers: { 'x-real-ip': '1.2.3.4' } })), 'shared');
  process.env.CONTACT_TRUST_PROXY = '1'; assert.equal(contactIp(req('/api', null, { headers: { 'x-real-ip': '1.2.3.4' } })), '1.2.3.4');
  assert.equal(contactIp(req('/api', null, { headers: { 'x-forwarded-for': '1.2.3.4' } })), 'shared');
  await db.query("UPDATE contact_codes SET created_at = $1::timestamptz - interval '31 days'", [clock]);
  await processContactNotifications(async () => {}, clock);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contact_codes')).rows[0].n, 0);
  assert.ok((await db.query('SELECT count(*)::int AS n FROM contact_messages')).rows[0].n > 0);
  const profile = (await db.query("SELECT value FROM cms_sections WHERE section='profile'")).rows[0].value;
  assert.ok('followTitle' in profile && 'communityQr' in profile);
  console.log('PASS same-origin, honeypot/body limits, trusted IP, admin auth, no secret disclosure, search/filter/pagination and retention');

  const dumped = spawnSync(postgresTool('pg_dump'), ['-Fc', '--no-owner', '--no-acl', '-f', keyBackup],
    { encoding: 'utf8', env: postgresEnvironment(url.toString()) });
  assert.equal(dumped.status, 0, dumped.stderr);
  await admin.query(`CREATE DATABASE ${restoredName} OWNER alei_blog`);
  const restoredUrl = new URL(url); restoredUrl.pathname = `/${restoredName}`;
  const recovered = spawnSync(postgresTool('pg_restore'), ['--single-transaction', '--exit-on-error', '--no-owner', '--no-acl', '-d', restoredName, keyBackup],
    { encoding: 'utf8', env: postgresEnvironment(restoredUrl.toString()) });
  assert.equal(recovered.status, 0, recovered.stderr);
  const checked = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "import { readMailSettings } from './lib/contact-mail.ts'; const settings = await readMailSettings(true); if (settings.password !== 'mock-authorization') throw new Error('restored authorization mismatch'); console.log('RESTORED_WITHOUT_ENV_KEY');"],
    { encoding: 'utf8', env: { ...process.env, DATABASE_URL: restoredUrl.toString() } });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(checked.stdout.trim(), 'RESTORED_WITHOUT_ENV_KEY');
  console.log('PASS complete database backup and restore preserves decryption without an environment key');
} finally {
  if (db) await db.end();
  await admin.query(`DROP DATABASE IF EXISTS ${restoredName} WITH (FORCE)`);
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end();
  await unlink(keyBackup).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  process.env.DATABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.MAIL_ENCRYPTION_KEY; else process.env.MAIL_ENCRYPTION_KEY = previousKey;
  if (previousSmtpAuth === undefined) delete process.env.SMTP_AUTH_CODE; else process.env.SMTP_AUTH_CODE = previousSmtpAuth;
  if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousAdminPassword;
}
