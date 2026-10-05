import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
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
export function encryptionKey() {
  const key = Buffer.from(serverConfig().MAIL_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new ContactError('请先配置 MAIL_ENCRYPTION_KEY 并重启服务', 503);
  return key;
}
function encrypt(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decrypt(value: string) {
  const bytes = Buffer.from(value, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
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
      ...(includeSecret ? { password: environmentPassword || (row?.secret ? decrypt(row.secret) : '') } : {}) };
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
  encryptionKey();
  await withDatabase(async (db) => {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('contact-settings'))");
    const old = (await db.query('SELECT secret, revision FROM contact_mail_settings WHERE id = true')).rows[0];
    if ((old?.revision ?? 0) !== input.revision) throw new ContactError('配置已更新，请重新加载', 409);
    const secret = password ? encrypt(password) : old?.secret ?? '';
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
