import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import type { Client } from 'pg';
import { withDatabase } from './postgres';
import { serverConfig } from './server-config';

export type MailSettings = {
  enabled: boolean; smtpHost: string; smtpPort: number; imapHost: string; imapPort: number;
  sender: string; recipient: string;
};
export const mailDefaults: MailSettings = {
  enabled: false, smtpHost: 'smtp.163.com', smtpPort: 465,
  imapHost: 'imap.163.com', imapPort: 993, sender: '', recipient: '',
};
export class ContactError extends Error {
  constructor(message: string, public status = 400, public retryAt?: string) { super(message); }
}
export async function encryptionKey(db: Client): Promise<Buffer> {
  const stored = (await db.query('SELECT key FROM contact_mail_keys WHERE id = true')).rows[0];
  if (stored) return stored.key;
  const ownTransaction = db.getTransactionStatus() === 'I';
  if (ownTransaction) await db.query('BEGIN');
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('contact-mail-key'))");
    const existing = (await db.query('SELECT key FROM contact_mail_keys WHERE id = true')).rows[0];
    let key: Buffer = existing?.key;
    if (!existing) {
      const legacy = serverConfig().MAIL_ENCRYPTION_KEY?.trim();
      const secret = (await db.query('SELECT secret FROM contact_mail_settings WHERE id = true')).rows[0]?.secret;
      const active = (await db.query(`SELECT 1 FROM contact_codes WHERE
        (status = 'sent' AND expires_at > now()) OR
        (status = 'sending' AND created_at > now() - interval '5 minutes') LIMIT 1`)).rowCount;
      if (!legacy && (secret || active)) throw new ContactError('存在旧邮箱数据，请恢复旧密钥后完成迁移', 503);
      key = legacy ? Buffer.from(legacy, 'base64') : randomBytes(32);
      if (key.length !== 32) throw new ContactError('旧密钥无效，无法迁移邮箱密钥', 503);
      if (secret) {
        try { decrypt(secret, key); }
        catch { throw new ContactError('旧密钥无法解密已有授权码，请恢复正确的旧密钥', 503); }
      }
      await db.query('INSERT INTO contact_mail_keys (id, key) VALUES (true, $1)', [key]);
    }
    if (ownTransaction) await db.query('COMMIT');
    return key;
  } catch (error) {
    if (ownTransaction) await db.query('ROLLBACK');
    throw error;
  }
}
function encrypt(value: string, key: Buffer) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decrypt(value: string, key: Buffer) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
}
export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new ContactError('请填写有效邮箱');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))
    throw new ContactError('请填写有效邮箱');
  return email;
}
export async function readMailSettings(includeSecret = false) {
  return withDatabase(async (db) => {
    const { rows } = await db.query('SELECT value, secret, revision FROM contact_mail_settings WHERE id = true');
    const row = rows[0];
    const environmentPassword = serverConfig().SMTP_AUTH_CODE?.trim() ?? '';
    return { value: { ...mailDefaults, ...row?.value } as MailSettings,
      configured: Boolean(environmentPassword || row?.secret), revision: row?.revision ?? 0,
      ...(includeSecret ? { password: environmentPassword || (row?.secret ? decrypt(row.secret, await encryptionKey(db)) : '') } : {}) };
  });
}
export async function saveMailSettings(input: Record<string, unknown>) {
  const source = input.value as Record<string, unknown> | undefined;
  if (!source || typeof source.enabled !== 'boolean') throw new ContactError('邮箱配置无效');
  const value: MailSettings = { ...mailDefaults, enabled: source.enabled };
  for (const field of ['smtpHost', 'imapHost'] as const) {
    const host = source[field];
    if (typeof host !== 'string' || host.length > 253 || !/^[a-z0-9.-]+$/i.test(host)) throw new ContactError('服务器地址无效');
    value[field] = host;
  }
  for (const field of ['smtpPort', 'imapPort'] as const) {
    const port = source[field];
    if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535) throw new ContactError('端口无效');
    value[field] = Number(port);
  }
  value.sender = normalizeEmail(source.sender);
  value.recipient = normalizeEmail(source.recipient);
  if (typeof input.password !== 'string' || input.password.length > 512) throw new ContactError('授权码无效');
  const password = input.password;
  await withDatabase(async (db) => {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('contact-settings'))");
    const old = (await db.query('SELECT secret, revision FROM contact_mail_settings WHERE id = true')).rows[0];
    if ((old?.revision ?? 0) !== input.revision) throw new ContactError('配置已更新，请重新加载', 409);
    const key = await encryptionKey(db);
    const secret = password ? encrypt(password, key) : old?.secret ?? '';
    if (value.enabled && !secret && !serverConfig().SMTP_AUTH_CODE?.trim()) throw new ContactError('请填写授权码');
    await db.query(`INSERT INTO contact_mail_settings (id, value, secret) VALUES (true, $1, $2)
      ON CONFLICT (id) DO UPDATE SET value = $1, secret = $2, revision = contact_mail_settings.revision + 1`, [value, secret]);
    await db.query('COMMIT');
  });
  return readMailSettings();
}
export type ContactMail = { to: string; subject: string; text: string; messageId: string; replyTo?: string };
export type MailSender = (message: ContactMail) => Promise<void>;
function transport(value: MailSettings, password: string) {
  return nodemailer.createTransport({ host: value.smtpHost, port: value.smtpPort, secure: true,
    auth: { user: value.sender, pass: password }, logger: false, debug: false,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
}
export const sendContactMail: MailSender = async (message) => {
  const { value, password } = await readMailSettings(true);
  if (!value.enabled || !password) throw new ContactError('留言服务暂未开启', 503);
  const smtp = transport(value, password);
  try {
    const result = await smtp.sendMail({ ...message, from: value.sender });
    if (!result.accepted?.length) throw new ContactError('邮件发送失败', 502);
  } finally { smtp.close(); }
};
export async function checkMailConnection() {
  const { value, password } = await readMailSettings(true);
  if (!password) throw new ContactError('请先保存邮箱授权码');
  const smtp = transport(value, password);
  try { await smtp.verify(); } finally { smtp.close(); }
  const imap = new ImapFlow({ host: value.imapHost, port: value.imapPort, secure: true,
    auth: { user: value.sender, pass: password }, logger: false,
    clientInfo: { name: 'Alei contact verification', version: '1.0' },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  try { await imap.connect(); } finally { if (imap.usable) await imap.logout(); else imap.close(); }
}
