import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
// Vinext declares the root Sharp import as unknown; use Sharp's own typed entry.
import sharp from 'sharp/lib/index.js';

const keyPattern = /^[a-f0-9-]+\.(png|jpg|gif|webp|mp3|wav|file)$/;
const maximum = 20 * 1024 * 1024;
const contentTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  file: 'application/octet-stream',
};

function mediaPaths(key: string) {
  if (!keyPattern.test(key)) throw new Error('无效的素材名称。');
  const directory = resolve(process.env.CMS_MEDIA_DIRECTORY || '.local/media');
  return {
    directory,
    path: resolve(directory, key),
    metadata: resolve(directory, '.metadata', `${key}.json`),
  };
}

export async function saveLocalMedia(
  key: string,
  data: Uint8Array,
  metadata: { contentType: string; name: string; source?: 'ai' | 'upload' },
) {
  const paths = mediaPaths(key);
  if (!data.length || data.length > maximum)
    throw new RangeError('文件超过大小限制。');
  if (metadata.contentType !== contentTypes[key.split('.').at(-1)!])
    throw new Error('素材格式不匹配。');
  await mkdir(resolve(paths.directory, '.metadata'), { recursive: true });
  const temporary = resolve(
    paths.directory,
    `.${key}.${randomBytes(8).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporary, data);
    await rename(temporary, paths.path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  await writeFile(
    paths.metadata,
    JSON.stringify({
      ...metadata,
      name: metadata.name.slice(0, 200),
      source: metadata.source || 'upload',
    }),
  );
}

export async function convertGeneratedImage(
  data: Uint8Array,
  contentType: string,
) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(contentType) ||
    !data.length ||
    data.length > maximum
  )
    throw new Error('生成图片格式或大小无效。');
  let webp: Buffer;
  try {
    webp = await sharp(data).rotate().webp({ quality: 80 }).toBuffer();
  } catch {
    throw new Error('生成图片转为 WebP 失败。');
  }
  if (!webp.length || webp.length > maximum)
    throw new Error('生成图片转为 WebP 后超过大小限制。');
  return new Uint8Array(webp);
}

export async function deleteLocalMedia(key: string) {
  const paths = mediaPaths(key);
  for (const path of [paths.path, paths.metadata]) {
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

function parseRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const suffix = !match[1] ? Number(match[2]) : null;
  if (suffix !== null && (!Number.isSafeInteger(suffix) || suffix <= 0))
    return null;
  const start = suffix !== null ? Math.max(0, size - suffix) : Number(match[1]);
  const end = suffix !== null || !match[2] ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function readLocalMedia(key: string, requestHeaders: Headers) {
  if (!keyPattern.test(key)) return new Response(null, { status: 404 });
  const paths = mediaPaths(key);
  let details;
  try {
    details = await stat(paths.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return new Response(null, { status: 404 });
    throw error;
  }
  if (!details.isFile()) return new Response(null, { status: 404 });
  const extension = key.split('.').at(-1)!;
  const etag = `"${details.size.toString(16)}-${Math.trunc(details.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    'Content-Type': contentTypes[extension],
    'Accept-Ranges': 'bytes',
    ETag: etag,
  });
  if (extension === 'file') {
    const metadata = JSON.parse(await readFile(paths.metadata, 'utf8')) as {
      name: string;
    };
    const filename = encodeURIComponent(metadata.name).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    headers.set(
      'Content-Disposition',
      `attachment; filename="attachment"; filename*=UTF-8''${filename}`,
    );
  }
  if (requestHeaders.get('if-none-match') === etag)
    return new Response(null, { status: 304, headers });
  const data = await readFile(paths.path);
  const rangeHeader = requestHeaders.get('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, data.length);
    if (!range) {
      headers.set('Content-Range', `bytes */${data.length}`);
      return new Response(null, { status: 416, headers });
    }
    const body = new Uint8Array(data.subarray(range.start, range.end + 1));
    headers.set('Content-Length', String(body.length));
    headers.set(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${data.length}`,
    );
    return new Response(body, { status: 206, headers });
  }
  headers.set('Content-Length', String(data.length));
  return new Response(new Uint8Array(data), { headers });
}
