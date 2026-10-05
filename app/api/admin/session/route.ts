import {
  authenticated,
  checkPassword,
  json,
  noCache,
  readLimitedBody,
  sameOrigin,
  sessionCookie,
} from '@/lib/admin-auth';
import { serverConfig } from '@/lib/server-config';
import { queryOne, withDatabase } from '@/lib/postgres';

export async function GET(request: Request) {
  return json({
    authenticated: await authenticated(request),
    configured: (serverConfig().ADMIN_PASSWORD?.length ?? 0) >= 12,
  });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '请求来源无效' }, 403);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return json({ error: '需要 JSON 请求' }, 415);
  if ((serverConfig().ADMIN_PASSWORD?.length ?? 0) < 12)
    return json(
      { error: '请运行 npm run admin:password，并重启开发服务。' },
      503,
    );
  if (Number(request.headers.get('content-length')) > 4096)
    return json({ error: '请求过大' }, 413);
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedBody(request, 4096)),
    );
  } catch (error) {
    return json(
      { error: '请求格式无效或内容过大' },
      error instanceof RangeError ? 413 : 400,
    );
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return json({ error: '请求格式无效' }, 400);
  const body = input as Record<string, unknown>;
  if (typeof body.password !== 'string' || !body.password.length || body.password.length > 256)
    return json({ error: '请输入有效密码' }, 400);
  const now = Date.now();
  // Single administrator: a durable global window also covers local requests without an IP header.
  const attempt = await queryOne<{ count: number }>(
    'INSERT INTO cms_login_attempts (key, count, expires) VALUES ($1, 1, $2) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN cms_login_attempts.expires <= $3 THEN 1 ELSE cms_login_attempts.count + 1 END, expires = CASE WHEN cms_login_attempts.expires <= $3 THEN excluded.expires ELSE cms_login_attempts.expires END RETURNING count',
    ['admin', now + 60000, now],
  );
  if ((attempt?.count ?? 99) > 10)
    return json({ error: '尝试次数过多，请一分钟后重试。' }, 429);
  if (!(await checkPassword(body.password)))
    return json({ error: '密码不正确' }, 401);
  await withDatabase((db) => db.query('DELETE FROM cms_login_attempts WHERE key = $1', ['admin']).then(() => undefined));
  return Response.json(
    { ok: true },
    { headers: { ...noCache, 'Set-Cookie': await sessionCookie(request) } },
  );
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: '请求来源无效' }, 403);
  return Response.json(
    { ok: true },
    {
      headers: { ...noCache, 'Set-Cookie': await sessionCookie(request, true) },
    },
  );
}
