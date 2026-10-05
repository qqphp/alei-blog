import { isIP } from 'node:net';
import { authenticated, json, readLimitedBody, sameOrigin } from './admin-auth';
import { ContactError } from './contact-mail';

export async function contactBody(request: Request, admin = false) {
  if (admin && !await authenticated(request)) throw new ContactError('请先登录', 401);
  if (!sameOrigin(request)) throw new ContactError('请求来源无效', 403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ContactError('需要 JSON 请求', 415);
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedBody(request, 16000))); }
  catch (error) { throw new ContactError(error instanceof RangeError ? '请求内容过大' : '请求内容无效', error instanceof RangeError ? 413 : 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContactError('请求内容无效');
  const body = input as Record<string, unknown>;
  if (!admin && (typeof body.website !== 'string' || body.website !== '')) throw new ContactError('请求无效');
  return body;
}
export function contactIp(request: Request) {
  // Only enable behind a proxy that overwrites X-Real-IP. Never trust client X-Forwarded-For.
  const ip = request.headers.get('x-real-ip') ?? '';
  return process.env.CONTACT_TRUST_PROXY === '1' && isIP(ip) ? ip : 'shared';
}
export function contactFailure(error: unknown) {
  return error instanceof ContactError ? json({ error: error.message, ...(error.retryAt ? { retryAt: error.retryAt } : {}) }, error.status)
    : json({ error: '服务暂时不可用，请稍后再试' }, 503);
}
