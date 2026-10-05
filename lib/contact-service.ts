import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Client } from 'pg';
import { withDatabase } from './postgres';
import { ContactError, encryptionKey, normalizeEmail, readMailSettings, sendContactMail, type MailSender } from './contact-mail';

async function digest(db: Client, challenge: string, email: string, code: string) {
  return createHmac('sha256', await encryptionKey(db)).update(`${challenge}\n${email}\n${code}`).digest('hex');
}
export function shanghaiDay(now: Date) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
function dayEnd(now: Date) {
  return new Date(`${shanghaiDay(now)}T16:00:00Z`);
}
async function transaction<T>(run: (db: Client) => Promise<T>) {
  return withDatabase(async (db) => {
    await db.query('BEGIN');
    // A single short database lock also makes limits and challenge consumption atomic.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('contact-limits'))");
    const result = await run(db);
    await db.query('COMMIT');
    return result;
  });
}
async function incrementLimits(db: Client, limits: [string, number, Date][], now: Date) {
  for (const [bucket, maximum] of limits) {
    const row = (await db.query('SELECT count FROM contact_limits WHERE bucket = $1 AND expires_at > $2', [bucket, now])).rows[0];
    if ((row?.count ?? 0) >= maximum) throw new ContactError('请求过于频繁，请稍后再试', 429);
  }
  for (const [bucket, , expires] of limits) await db.query(`INSERT INTO contact_limits (bucket, count, expires_at) VALUES ($1, 1, $2)
    ON CONFLICT (bucket) DO UPDATE SET count = CASE WHEN contact_limits.expires_at <= $3 THEN 1 ELSE contact_limits.count + 1 END, expires_at = $2`, [bucket, expires, now]);
}
export async function requestContactCode(rawEmail: unknown, ip: string, send: MailSender = sendContactMail, now = new Date()) {
  const email = normalizeEmail(rawEmail);
  const settings = await readMailSettings();
  if (!settings.value.enabled || !settings.configured) throw new ContactError('留言服务暂未开启', 503);
  const id = randomUUID();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const day = shanghaiDay(now), hour = now.toISOString().slice(0, 13);
  await transaction(async (db) => {
    const previous = (await db.query('SELECT created_at FROM contact_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1', [email])).rows[0];
    if (previous && now.getTime() - previous.created_at.getTime() < 60000) throw new ContactError('请等待 60 秒后再发送', 429,
      new Date(previous.created_at.getTime() + 60000).toISOString());
    await incrementLimits(db, [
      [`code:email:${email}:${day}`, 10, dayEnd(now)],
      [`code:ip:${ip}:${hour}`, 20, new Date(new Date(`${hour}:00:00Z`).getTime() + 3600000)],
      [`code:ip:${ip}:${day}`, 100, dayEnd(now)],
      [`code:global:${day}`, 500, dayEnd(now)],
    ], now);
    await db.query('INSERT INTO contact_codes (id, email, digest, status, created_at) VALUES ($1,$2,$3,\'sending\',$4)', [id, email, await digest(db, id, email, code), now]);
  });
  try {
    await send({ to: email, subject: '开发阿雷 · 留言邮箱验证码',
      text: `你的留言验证码是：${code}\n有效期 3 分钟，只能使用一次。如非本人操作，请忽略。`, messageId: `<contact-code-${id}@${settings.value.sender.split('@')[1]}>` });
  } catch {
    await withDatabase((db) => db.query("UPDATE contact_codes SET status = 'failed' WHERE id = $1", [id]));
    throw new ContactError('验证码发送失败，请稍后再试', 502, new Date(now.getTime() + 60000).toISOString());
  }
  // Expiry starts only after SMTP accepted the message. Tests use a controlled clock.
  const acceptedAt = send === sendContactMail ? new Date() : now;
  const expiresAt = new Date(acceptedAt.getTime() + 180000);
  await transaction(async (db) => {
    const newer = (await db.query("SELECT 1 FROM contact_codes WHERE email = $1 AND created_at > $2 AND status IN ('sent','consumed','locked')", [email, now])).rowCount;
    await db.query('UPDATE contact_codes SET status = $2, expires_at = $3 WHERE id = $1', [id, newer ? 'superseded' : 'sent', expiresAt]);
    if (!newer) await db.query("UPDATE contact_codes SET status = 'superseded' WHERE email = $1 AND id <> $2 AND status = 'sent' AND created_at <= $3", [email, id, now]);
  });
  return { challengeId: id, expiresAt: expiresAt.toISOString(), retryAt: new Date(now.getTime() + 60000).toISOString() };
}
export async function submitContactMessage(input: Record<string, unknown>, ip: string, now?: Date) {
  const email = normalizeEmail(input.email);
  if (typeof input.content !== 'string' || !input.content.trim() || Array.from(input.content).length > 3000) throw new ContactError('留言需要 1–3000 字');
  if (Array.from(input.content).some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159);
  })) throw new ContactError('留言包含无效控制字符');
  const content = input.content.trim();
  if (typeof input.challengeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.challengeId) || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new ContactError('请填写 6 位邮箱验证码');
  const settings = await readMailSettings();
  if (!settings.value.enabled || !settings.configured) throw new ContactError('留言服务暂未开启', 503);
  const attemptedAt = now ?? new Date();
  await transaction((db) => incrementLimits(db, [[`submit:${ip}:${Math.floor(attemptedAt.getTime() / 60000)}`, 20,
    new Date((Math.floor(attemptedAt.getTime() / 60000) + 1) * 60000)]], attemptedAt));
  const result = await transaction(async (db) => {
    const checkedAt = now ?? new Date();
    const row = (await db.query('SELECT * FROM contact_codes WHERE id = $1 AND email = $2 FOR UPDATE', [input.challengeId, email])).rows[0];
    if (!row || row.status !== 'sent' || !row.expires_at || row.expires_at <= checkedAt) return { error: '验证码已失效，请重新发送' };
    const candidate = Buffer.from(await digest(db, row.id, email, input.code as string), 'hex');
    if (!timingSafeEqual(candidate, Buffer.from(row.digest, 'hex'))) {
      await db.query("UPDATE contact_codes SET failures = failures + 1, status = CASE WHEN failures + 1 >= 5 THEN 'locked' ELSE status END WHERE id = $1", [row.id]);
      return { error: row.failures + 1 >= 5 ? '验证码错误次数过多，请重新发送' : '验证码不正确' };
    }
    const day = shanghaiDay(checkedAt);
    const count = Number((await db.query(`SELECT count(*) FROM contact_messages WHERE email = $1 AND created_at >= $2 AND created_at < $3`,
      [email, `${day}T00:00:00+08:00`, dayEnd(checkedAt)])).rows[0].count);
    if (count >= 3) return { error: '同一邮箱每天最多留言 3 次', status: 429 };
    const id = randomUUID();
    await db.query("UPDATE contact_codes SET status = 'consumed' WHERE id = $1", [row.id]);
    await db.query('INSERT INTO contact_messages (id,email,content,recipient,created_at,next_attempt_at,message_id) VALUES ($1,$2,$3,$4,$5,$5,$6)',
      [id, email, content, settings.value.recipient, checkedAt, `<contact-message-${id}@${settings.value.sender.split('@')[1]}>`]);
    return { id };
  });
  if (result.error) throw new ContactError(result.error, result.status ?? 400);
  return { id: result.id };
}
const retryMinutes = [1, 5, 15, 60];
export async function processContactNotifications(send: MailSender = sendContactMail, now = new Date()) {
  await withDatabase(async (db) => {
    await db.query("DELETE FROM contact_codes WHERE created_at < $1::timestamptz - interval '30 days'", [now]);
    await db.query('DELETE FROM contact_limits WHERE expires_at <= $1', [now]);
    await db.query("UPDATE contact_codes SET status = 'failed' WHERE status = 'sending' AND created_at < $1::timestamptz - interval '5 minutes'", [now]);
    await db.query("UPDATE contact_messages SET status = 'failed', lease_token = NULL, lease_until = NULL, last_error = '通知任务中断，已达到尝试上限' WHERE status = 'sending' AND attempts >= 5 AND lease_until <= $1", [now]);
  });
  const settings = await readMailSettings();
  if (!settings.value.enabled || !settings.configured) return;
  for (let i = 0; i < 20; i++) {
    const token = randomUUID();
    const claimedAt = send === sendContactMail ? new Date() : now;
    const row = await withDatabase(async (db) => (await db.query(`WITH candidate AS (
      SELECT id FROM contact_messages WHERE status IN ('pending','retry','sending') AND next_attempt_at <= $1
      AND attempts < 5 AND (lease_until IS NULL OR lease_until <= $1) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE contact_messages m SET status = 'sending', attempts = attempts + 1, lease_until = $1::timestamptz + interval '2 minutes', lease_token = $2
      FROM candidate c WHERE m.id = c.id RETURNING m.*`, [claimedAt, token])).rows[0]);
    if (!row) break;
    const attempts = row.attempts;
    let success = false;
    try {
      await send({ to: row.recipient, replyTo: row.email, subject: `开发阿雷 · 新留言 ${row.id}`,
        text: `留言编号：${row.id}\n留言邮箱：${row.email}\n留言时间：${new Date(row.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n${row.content}`,
        messageId: row.message_id });
      success = true;
    } catch { /* Store a generic error; transport errors may contain credentials or personal data. */ }
    const status = success ? 'sent' : attempts >= 5 ? 'failed' : 'retry';
    const finishedAt = send === sendContactMail ? new Date() : now;
    await withDatabase((db) => db.query(`UPDATE contact_messages SET status=$2, attempts=$3, next_attempt_at=$4,
      lease_until=NULL, lease_token=NULL, last_error=$5 WHERE id=$1 AND lease_token=$6`, [row.id, status, attempts,
      new Date(finishedAt.getTime() + (retryMinutes[attempts - 1] ?? 60) * 60000), success ? '' : '邮件通知发送失败', token]));
  }
}
export async function listContactRecords(kind: 'messages' | 'codes', params: URLSearchParams) {
  const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
  const query = (params.get('q') ?? '').slice(0, 200);
  const status = params.get('status') ?? '';
  const id = params.get('id');
  const expression = kind === 'messages' ? 'status' : "CASE WHEN status = 'sent' AND expires_at <= now() THEN 'expired' ELSE status END";
  const fields = kind === 'messages' ? 'id,email,content,recipient,created_at,attempts,next_attempt_at,last_error' : 'id,email,created_at,expires_at,failures';
  return withDatabase(async (db) => {
    const predicate = `email ILIKE $1${kind === 'messages' ? ' OR content ILIKE $1' : ''}`;
    const where = `(${predicate}) AND ($2 = '' OR ${expression} = $2) AND ($3::text IS NULL OR id::text = $3)`;
    const values = [`%${query}%`, status, id];
    const total = Number((await db.query(`SELECT count(*) FROM contact_${kind} WHERE ${where}`, values)).rows[0].count);
    const items = (await db.query(`SELECT ${fields},${expression} AS status FROM contact_${kind} WHERE ${where}
      ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $4`, [...values, (Math.floor(page) - 1) * 20])).rows;
    return { items, total, page: Math.floor(page), size: 20 };
  });
}
