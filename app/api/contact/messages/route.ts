import { json } from '@/lib/admin-auth';
import { contactBody, contactFailure, contactIp } from '@/lib/contact-http';
import { submitContactMessage } from '@/lib/contact-service';
export async function POST(request: Request) {
  try { return json(await submitContactMessage(await contactBody(request), contactIp(request)), 201); }
  catch (error) { return contactFailure(error); }
}
