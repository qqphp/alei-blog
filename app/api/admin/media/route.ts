import {
  authenticated,
  json,
  readLimitedBody,
  sameOrigin,
} from '@/lib/admin-auth';
import { saveLocalMedia } from '@/lib/local-media';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '请求来源无效' }, 403);
  if (!(await authenticated(request))) return json({ error: '请先登录' }, 401);
  let data: Uint8Array;
  try {
    data = await readLimitedBody(request, 20 * 1024 * 1024);
  } catch (error) {
    if (error instanceof RangeError)
      return json({ error: '文件不能超过 20 MB' }, 413);
    throw error;
  }
  if (!data.length || data.length > 20 * 1024 * 1024)
    return json({ error: '文件大小须为 1 字节到 20 MB' }, 413);
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...data.slice(start, end));
  // Recognize inline media from bytes; serve other files only as download attachments.
  let type = 'application/octet-stream';
  let ext = 'file';
  if (
    data[0] === 137 &&
    ascii(1, 4) === 'PNG' &&
    data[4] === 13 &&
    data[5] === 10
  ) {
    type = 'image/png';
    ext = 'png';
  } else if (data[0] === 255 && data[1] === 216 && data[2] === 255) {
    type = 'image/jpeg';
    ext = 'jpg';
  } else if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    type = 'image/gif';
    ext = 'gif';
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    type = 'image/webp';
    ext = 'webp';
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') {
    type = 'audio/wav';
    ext = 'wav';
  } else if (
    ascii(0, 3) === 'ID3' ||
    (data[0] === 255 && (data[1] & 224) === 224)
  ) {
    type = 'audio/mpeg';
    ext = 'mp3';
  }
  let name = '上传素材';
  try {
    name = decodeURIComponent(request.headers.get('x-file-name') || name).slice(
      0,
      200,
    );
  } catch {
    /* Use a safe display name. */
  }
  const key = `${crypto.randomUUID()}.${ext}`;
  try {
    await saveLocalMedia(key, data, { contentType: type, name });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : '保存素材失败' },
      503,
    );
  }
  return json({ url: `/api/media/${key}`, name });
}
