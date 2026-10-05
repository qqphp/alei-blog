import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

register('./ui-test-loader.mjs', import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'alei-media-upload-'));
const originalEnvironment = { ...process.env };
try {
  process.env.CMS_MEDIA_DIRECTORY = directory;
  process.env.ADMIN_PASSWORD = crypto.randomUUID();
  const { POST } = await import('../app/api/admin/media/route.ts');
  const { GET } = await import('../app/api/media/[key]/route.ts');
  const { sessionCookie } = await import('../lib/admin-auth.ts');
  const origin = 'http://localhost:3000';
  const cookie = (await sessionCookie(new Request(origin))).split(';')[0];
  const upload = (data, name, type = '', headers = {}) => POST(new Request(`${origin}/api/admin/media`, {
    method: 'POST',
    headers: { origin, cookie, 'X-File-Name': encodeURIComponent(name), 'Content-Type': type, ...headers },
    body: data,
  }));
  const read = (key, headers = {}) => GET(new Request(`${origin}/api/media/${key}`, { headers }),
    { params: Promise.resolve({ key }) });
  for (const [name, data, type] of [
    ['中文文档.pdf', Buffer.from('%PDF-1.7\n%%EOF'), 'application/pdf'],
    ['说明 (最终版).txt', Buffer.from('附件内容'), 'text/plain'],
    ['资料.zip', Buffer.from([80, 75, 3, 4, 0, 0]), 'application/zip'],
    ['报告.docx', Buffer.from([80, 75, 3, 4, 1, 1]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['无类型文件', Buffer.from('binary'), ''],
    ['页面.html', Buffer.from('<script>alert(1)</script>'), 'text/html'],
    ['伪装图片.png', Buffer.from('<script>alert(1)</script>'), 'image/png'],
  ]) {
    const response = await upload(data, name, type);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.name, name);
    const key = result.url.split('/').at(-1);
    assert.match(key, /^[a-f0-9-]+\.file$/);
    assert.deepEqual(await readFile(join(directory, key)), data);
    const downloaded = await read(key);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('Content-Type'), 'application/octet-stream');
    const disposition = downloaded.headers.get('Content-Disposition');
    assert.match(disposition, /^attachment;/);
    assert.equal(decodeURIComponent(disposition.split("filename*=UTF-8''")[1]), name);
    assert.equal(downloaded.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), data);
    const partial = await read(key, { range: 'bytes=0-2' });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('Content-Disposition'), disposition);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), data.subarray(0, 3));
    const cached = await read(key, { 'if-none-match': downloaded.headers.get('etag') });
    assert.equal(cached.status, 304);
  }
  for (const [name, data, type, extension] of [
    ['image.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64'), 'image/png', 'png'],
    ['track.wav', Buffer.from('RIFF0000WAVEdata'), 'audio/wav', 'wav'],
  ]) {
    const response = await upload(data, name, type);
    assert.equal(response.status, 200);
    const result = await response.json();
    const key = result.url.split('/').at(-1);
    assert.equal(key.split('.').at(-1), extension);
    const downloaded = await read(key);
    assert.equal(downloaded.headers.get('Content-Type'), type);
    assert.equal(downloaded.headers.get('Content-Disposition'), null);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), data);
  }
  assert.equal((await upload('x', 'test.txt', '', { cookie: '' })).status, 401);
  assert.equal((await upload('x', 'test.txt', '', { origin: 'http://example.com' })).status, 403);
  assert.equal((await upload('', 'empty.txt')).status, 413);
  assert.equal((await upload(Buffer.alloc(20 * 1024 * 1024 + 1), 'large.zip')).status, 413);
  assert.equal((await read('missing.file')).status, 404);
  assert.equal((await read('../private.file')).status, 404);
  console.log('PASS attachment upload, persisted bytes, original download names, range/cache, inline media, auth and limits');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  assert.equal(dirname(directory), resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
}
