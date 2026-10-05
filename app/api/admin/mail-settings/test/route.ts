import { randomUUID } from 'node:crypto';
import { json } from '@/lib/admin-auth';
import { contactBody, contactFailure } from '@/lib/contact-http';
import { checkMailConnection, ContactError, readMailSettings, sendContactMail } from '@/lib/contact-mail';
export async function POST(request: Request) {
  try {
    const body = await contactBody(request, true);
    if (body.action === 'connection') {
      await checkMailConnection();
      return json({ message: 'SMTP 与 IMAP 连接及认证成功；请发送测试邮件确认送达。' });
    }
    if (body.action !== 'mail') throw new ContactError('测试操作无效');
    const { value } = await readMailSettings();
    await sendContactMail({ to: value.recipient, subject: '开发阿雷 · 邮箱设置测试',
      text: '这是一封邮箱设置测试邮件。请在收信邮箱确认送达。', messageId: `<contact-test-${randomUUID()}@${value.sender.split('@')[1]}>` });
    return json({ message: 'SMTP 已接受测试邮件，请在收信邮箱确认送达。' });
  } catch (error) { return contactFailure(error); }
}
