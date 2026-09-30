import { bindings } from './cms-server';

function mediaConfig() {
  const { LOCAL_MEDIA_STORAGE, LOCAL_MEDIA_TOKEN } = bindings();
  if (!LOCAL_MEDIA_STORAGE || !LOCAL_MEDIA_TOKEN)
    throw new Error('本地素材存储未启动，请重启开发服务。');
  return {
    base: LOCAL_MEDIA_STORAGE.replace(/\/$/, ''),
    token: LOCAL_MEDIA_TOKEN,
  };
}

async function mediaRequest(path: string, init: RequestInit = {}) {
  const { base, token } = mediaConfig();
  const headers = new Headers(init.headers);
  headers.set('X-Local-Media-Token', token);
  try {
    return await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new Error('本地素材存储连接失败，请重启开发服务。');
  }
}

export async function saveLocalMedia(
  key: string,
  data: Uint8Array,
  metadata: { contentType: string; name: string; source?: 'ai' | 'upload' },
) {
  const response = await mediaRequest(`/media/${key}`, {
    method: 'PUT',
    headers: {
      'Content-Type': metadata.contentType,
      'X-Media-Name': encodeURIComponent(metadata.name),
      'X-Media-Source': metadata.source || 'upload',
    },
    body: data as BodyInit,
  });
  if (!response.ok) throw new Error('保存文件到本地素材库失败。');
}

export async function convertGeneratedImage(data: Uint8Array, contentType: string) {
  const response = await mediaRequest('/images/webp', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: data as BodyInit,
  });
  if (!response.ok) throw new Error('生成图片转为 WebP 失败。');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new Error('生成图片转为 WebP 后超过大小限制。');
  return bytes;
}

export async function deleteLocalMedia(key: string) {
  const response = await mediaRequest(`/media/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404)
    throw new Error('从本地素材库删除文件失败。');
}

export function readLocalMedia(key: string, requestHeaders: Headers) {
  const headers = new Headers();
  for (const name of ['range', 'if-none-match']) {
    const value = requestHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return mediaRequest(`/media/${key}`, { headers }).then((response) => {
    if (![200, 206, 304, 404, 416].includes(response.status))
      throw new Error('读取本地素材失败。');
    return response;
  });
}
