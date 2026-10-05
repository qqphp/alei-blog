import { json } from '@/lib/admin-auth';
import { contactBody, contactFailure, contactIp } from '@/lib/contact-http';
import { requestContactCode } from '@/lib/contact-service';
export async function POST(request: Request) {
  try {
    const body = await contactBody(request);
    return json(await requestContactCode(body.email, contactIp(request)));
  } catch (error) { return contactFailure(error); }
}
