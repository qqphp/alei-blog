import { serverConfig } from '@/lib/server-config';
import {
  authenticated,
  json,
  sameOrigin,
  readLimitedBody,
} from '@/lib/admin-auth';
import { getDocuments } from '@/lib/cms-server';
import { generateCover, imageActions, providerRequest, type ImageAction } from '@/lib/ai-provider';

export async function GET(request: Request) {
  if (!(await authenticated(request))) return json({ error: '请先登录' }, 401);
  return json({ keyConfigured: Boolean(serverConfig().TEAMOROUTER_KEY?.trim()) });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '请求来源无效' }, 403);
  if (!(await authenticated(request))) return json({ error: '请先登录' }, 401);
  let body: {
    action?: string;
    description?: string;
  };
  try {
    body = JSON.parse(
      new TextDecoder().decode(await readLimitedBody(request, 32000)),
    );
  } catch {
    return json({ error: '请求格式无效' }, 400);
  }
  if (
    !body ||
    !['models', 'test', ...Object.keys(imageActions)].includes(body.action || '')
  )
    return json({ error: '操作无效' }, 400);
  const isImage = Object.hasOwn(imageActions, body.action || '');
  if (isImage &&
    (typeof body.description !== 'string' || !body.description.trim() || body.description.length > 5000))
    return json({ error: '请填写图片描述（最多 5000 字）' }, 400);
  try {
    if (body.action === 'models') {
      const result = await providerRequest('models');
      return json({
        models:
          result.data?.flatMap((item) =>
            typeof item.id === 'string' ? [item.id] : [],
          ) ?? [],
      });
    }
    if (body.action === 'test') {
      const { content } = await getDocuments(['aiSettings']);
      const result = await providerRequest('chat/completions', {
        model: content.aiSettings.textModel,
        messages: [{ role: 'user', content: 'Reply with OK only.' }],
        max_tokens: 16,
      }, content.aiSettings);
      if (!result.choices?.[0]?.message?.content)
        throw new Error('模型未返回文本。');
      return json({ message: '文本模型调用成功。' });
    }
    return json(await generateCover({
      action: body.action as ImageAction,
      description: body.description!,
    }));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'AI 请求失败' },
      502,
    );
  }
}
