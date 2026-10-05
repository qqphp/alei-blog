import { authenticated, json } from '@/lib/admin-auth';
import { contactFailure } from '@/lib/contact-http';
import { listContactRecords } from '@/lib/contact-service';
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  if (!await authenticated(request)) return json({ error: '请先登录' }, 401);
  const { kind } = await context.params;
  if (kind !== 'messages' && kind !== 'codes') return json({ error: '列表不存在' }, 404);
  try { return json(await listContactRecords(kind, new URL(request.url).searchParams)); }
  catch (error) { return contactFailure(error); }
}
