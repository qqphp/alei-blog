import { serverConfig } from './server-config';

const cookieName = 'alei_admin';
const encoder = new TextEncoder();
const maxAge = 60 * 60 * 8;
export const noCache = { 'Cache-Control': 'no-store' };
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: noCache });
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
export async function readLimitedBody(
  request: Pick<Request, 'headers' | 'body'>,
  maximum: number,
) {
  if (Number(request.headers.get('content-length')) > maximum)
    throw new RangeError('请求内容过大');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new RangeError('请求内容过大');
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
async function signature(message: string) {
  const password = serverConfig().ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('请先运行 npm run admin:password 并重启开发服务');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function authenticated(request: Request) {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!token || !serverConfig().ADMIN_PASSWORD) return false;
  const [expires, nonce, sig] = token.split('.');
  if (
    !expires ||
    !nonce ||
    !sig ||
    Number(expires) <= Date.now() ||
    Number(expires) > Date.now() + maxAge * 1000
  )
    return false;
  return equal(sig, await signature(`${expires}.${nonce}`));
}
export async function checkPassword(password: string) {
  return equal(
    await signature(`password:${password}`),
    await signature(`password:${serverConfig().ADMIN_PASSWORD}`),
  );
}
export async function sessionCookie(request: Request, clear = false) {
  const message = `${Date.now() + maxAge * 1000}.${crypto.randomUUID()}`;
  const token = clear ? '' : `${message}.${await signature(message)}`;
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
