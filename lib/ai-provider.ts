import { bindings, getDocuments } from './cms-server';
import { readLimitedBody } from './admin-auth';
import { validateProviderUrl } from './cms-validation';
import { coverInput } from './article-categories';
import { saveLocalMedia } from './local-media';
import type { Content } from './cms-defaults';

function aiFetch(url: string | URL, init: RequestInit) {
  const { LOCAL_AI_TRANSPORT, LOCAL_AI_TOKEN } = bindings();
  if (!LOCAL_AI_TRANSPORT || !LOCAL_AI_TOKEN) return fetch(url, init);
  const headers = new Headers(init.headers);
  headers.set('X-Local-Ai-Token', LOCAL_AI_TOKEN);
  headers.set('X-Local-Ai-Target', String(url));
  return fetch(LOCAL_AI_TRANSPORT, { ...init, headers });
}

export async function providerRequest(path: string, body?: unknown, settings?: Content['aiSettings']) {
  settings ??= (await getDocuments(['aiSettings'])).content.aiSettings;
  const key = bindings().TEAMOROUTER_KEY?.trim();
  if (!key)
    throw new Error('未配置 TEAMOROUTER_KEY，请填写 .dev.vars 并重启服务。');
  const base = validateProviderUrl(settings.baseUrl).href.replace(
    /\/$/,
    '',
  );
  let response: Response;
  try {
    response = await aiFetch(`${base}/${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(
        path === 'images/generations' ? 300000 : 45000,
      ),
    });
  } catch {
    throw new Error(
      '中转站连接失败或超时，请检查网络和 API 地址。图片生成不自动重试，以免重复计费。',
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `中转站返回 ${response.status}。${[401, 403].includes(response.status) ? '请检查密钥和模型权限。' : response.status === 429 ? '请求受限或额度不足，请检查中转站账户。' : '请检查模型名称、服务状态和账户额度。'}`,
    );
  }
  return JSON.parse(
    new TextDecoder().decode(await readLimitedBody(response, 30 * 1024 * 1024)),
  ) as {
    data?: { id?: string; b64_json?: string; url?: string }[];
    choices?: { message?: { content?: string } }[];
  };
}

export function buildCoverPrompt(template: string, input: {
  title?: string; excerpt?: string; style: string; description?: string;
}) {
  const values: Record<string, string> = {
    title: input.title?.trim() ?? '',
    excerpt: input.excerpt?.trim() ?? '',
    style: input.style,
    description: input.description?.trim() ?? '',
  };
  return template.replace(
    /\{\{(title|excerpt|style|description)\}\}/g,
    (_, key: string) => values[key],
  );
}

export const imageActions = {
  cover: ['coverPrompt', 'coverStyle', 'coverSize'],
  'project-cover': ['projectImagePrompt', 'projectImageStyle', 'projectImageSize'],
  'story-image': ['storyImagePrompt', 'storyImageStyle', 'storyImageSize'],
  'playlist-cover': ['playlistCoverPrompt', 'playlistCoverStyle', 'playlistCoverSize'],
  'film-cover': ['filmCoverPrompt', 'filmCoverStyle', 'filmCoverSize'],
  'podcast-cover': ['podcastCoverPrompt', 'podcastCoverStyle', 'podcastCoverSize'],
  'travel-cover': ['travelCoverPrompt', 'travelCoverStyle', 'travelCoverSize'],
  'hobby-cover': ['hobbyCoverPrompt', 'hobbyCoverStyle', 'hobbyCoverSize'],
  'book-cover': ['bookCoverPrompt', 'bookCoverStyle', 'bookCoverSize'],
  'booklist-cover': ['booklistCoverPrompt', 'booklistCoverStyle', 'booklistCoverSize'],
} as const;
export type ImageAction = keyof typeof imageActions;

export async function generateCover(input: {
  action: ImageAction; title?: string; excerpt?: string; description?: string;
}) {
  const { content } = await getDocuments(['aiSettings']);
  const settings = content.aiSettings;
  const [promptField, styleField, sizeField] = imageActions[input.action];
  const prompt = buildCoverPrompt(settings[promptField], {
    title: input.title, excerpt: input.excerpt,
    style: settings[styleField], description: input.description,
  });
  const size = settings[sizeField];
  const result = await providerRequest('images/generations', {
    model: settings.imageModel,
    prompt,
    n: 1,
    output_format: settings.imageOutputFormat,
    ...(settings.imageOutputFormat !== 'png'
      ? { output_compression: settings.imageCompression }
      : {}),
    ...(size ? { size } : {}),
  }, settings);
  const first = result.data?.[0];
  let bytes: Uint8Array;
  if (first?.b64_json) {
    if (
      first.b64_json.length > 28 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/=\r\n]+$/.test(first.b64_json)
    )
      throw new Error('图片数据无效或超过 20 MB。');
    try {
      bytes = Uint8Array.from(atob(first.b64_json), (char) =>
        char.charCodeAt(0),
      );
    } catch {
      throw new Error('图片编码无效。');
    }
  } else if (first?.url) {
    const url = validateProviderUrl(first.url, true);
    const response = await aiFetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error('生成成功，但下载图片失败，请稍后重试。');
    bytes = await readLimitedBody(response, 20 * 1024 * 1024);
  } else
    throw new Error(
      '中转站未返回图片，请确认所选模型支持 images/generations。',
    );
  if (!bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new Error('生成图片超过大小限制。');
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const format =
    bytes[0] === 137 && ascii(1, 4) === 'PNG'
      ? ['png', 'image/png']
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? ['jpg', 'image/jpeg']
        : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
          ? ['webp', 'image/webp']
          : null;
  if (!format)
    throw new Error('模型返回的图片格式不受支持，请使用 PNG、JPEG 或 WebP。');
  const key = `${crypto.randomUUID()}.${format[0]}`;
  await saveLocalMedia(key, bytes, {
    contentType: format[1],
    name: `${(input.description ?? input.title ?? '').slice(0, 80)} · AI${input.action === 'story-image' || input.action === 'project-cover' ? '配图' : '封面'}`,
    source: 'ai',
  });
  return {
    url: `/api/media/${key}`,
    generatedFor: input.description !== undefined
      ? JSON.stringify([input.description.trim()])
      : coverInput(input.title ?? '', input.excerpt ?? ''),
  };
}
