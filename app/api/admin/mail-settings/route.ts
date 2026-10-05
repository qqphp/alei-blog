import { authenticated, json } from '@/lib/admin-auth';
import { contactBody, contactFailure } from '@/lib/contact-http';
import { readMailSettings, saveMailSettings } from '@/lib/contact-mail';
export async function GET(request: Request) {
  if (!await authenticated(request)) return json({ error: '请先登录' }, 401);
  try { return json(await readMailSettings()); } catch (error) { return contactFailure(error); }
}
export async function PUT(request: Request) {
  try { return json(await saveMailSettings(await contactBody(request, true))); }
  catch (error) { return contactFailure(error); }
}
