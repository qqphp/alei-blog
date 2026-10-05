import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
register('./film-ai-test-loader.mjs', import.meta.url);
const { defaults } = await import('../lib/cms-defaults.ts');
const settings = {
  ...defaults.aiSettings,
  filmCoverPrompt: 'FILM {{description}} / {{style}}',
  projectImagePrompt: 'PROJECT {{description}} / {{style}}',
  filmCoverStyle: 'PORTRAIT FILM',
  imageModel: 'test-image-model',
  coverSize: '2048x1152',
  projectImageSize: '1920x1088',
  storyImageSize: '1792x1024',
  storyImageStyle: 'STORY DOCUMENTARY',
  storyImagePrompt: 'STORY DESCRIPTION {{description}} / STYLE {{style}}',
  playlistCoverSize: '1280x1280',
  filmCoverSize: '1024x1792',
  podcastCoverSize: '1792x1024',
  travelCoverSize: '2048x1024',
  hobbyCoverSize: '1920x1280',
  bookCoverSize: '1280x1920',
  booklistCoverSize: '1536x864',
};
const stored = [];
const requests = [];
let settingsReads = 0;
const mediaDirectory = await mkdtemp(join(tmpdir(), 'blog-generated-webp-'));
const previousEnvironment = { ...process.env };
process.env.CMS_MEDIA_DIRECTORY = mediaDirectory;
process.env.TEAMOROUTER_KEY = 'test-only-key';
process.env.ADMIN_PASSWORD = 'test-story-password-only';
globalThis.__filmTestSettings = async () => {
  settingsReads++;
  return { value: settings, revision: 1 };
};
const image = sharp({ create: {
  width: 2, height: 2, channels: 4,
  background: { r: 220, g: 30, b: 40, alpha: 0.5 },
} });
const samples = {
  png: await image.clone().png().toBuffer(),
  jpeg: await image.clone().jpeg().toBuffer(),
  webp: await image.clone().webp().toBuffer(),
};
let generatedBytes = samples.png;
const originalFetch = globalThis.fetch;
let fail = false;
let invalidImage = false;
let imageUrl = false;
globalThis.fetch = async (url, init) => {
  const href =
    typeof url === 'string'
      ? url
      : url instanceof URL
        ? url.href
        : url.url;
  if (href === 'https://images.example.com/generated.png')
    return new Response(generatedBytes, { headers: { 'Content-Type': 'image/png' } });
  assert.equal(
    href,
    'https://api.teamorouter.com/v1/images/generations',
  );
  assert.equal(init.headers.Authorization, 'Bearer test-only-key');
  const body = JSON.parse(init.body);
  assert.equal(Object.hasOwn(body, 'output_format'), false);
  assert.equal(Object.hasOwn(body, 'output_compression'), false);
  requests.push(body);
  return fail
    ? Response.json({ error: 'failure' }, { status: 502 })
    : Response.json({ data: [imageUrl
      ? { url: 'https://images.example.com/generated.png' }
      : { b64_json: (invalidImage ? Buffer.from([137, 80, 78, 71]) : generatedBytes).toString('base64') }] });
};
try {
  const provider = await import('../lib/ai-provider.ts');
  const fileCount = async () => (await readdir(mediaDirectory)).filter((name) => name.endsWith('.webp')).length;
  const generateCover = async (input) => {
    const result = await provider.generateCover(input);
    const key = result.url.split('/').at(-1);
    const metadata = JSON.parse(await readFile(join(mediaDirectory, '.metadata', `${key}.json`), 'utf8'));
    stored.push({ key, bytes: await readFile(join(mediaDirectory, key)), contentType: 'image/webp', ...metadata });
    return result;
  };
  const description = '雨夜街道上的红色雨伞';
  const result = await generateCover({ action: 'film-cover', description });
  assert.equal(requests[0].model, 'test-image-model');
  assert.equal(settingsReads, 1, '一次生成只读取一次 AI 设置');
  assert.equal(requests[0].prompt, `FILM ${description} / PORTRAIT FILM`);
  assert.match(result.url, /^\/api\/media\/.+\.webp$/);
  assert.equal(result.generatedFor, JSON.stringify([description]));
  assert.equal(requests[0].size, settings.filmCoverSize);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(stored[0].bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(stored[0].contentType, 'image/webp');
  assert.equal(stored[0].source, 'ai');
  assert.deepEqual(await readFile(join(mediaDirectory, stored[0].key)), stored[0].bytes);
  assert.deepEqual((await sharp(stored[0].bytes).metadata()).width, 2);
  assert.equal((await sharp(stored[0].bytes).metadata()).hasAlpha, true);
  for (const format of ['jpeg', 'webp']) {
    generatedBytes = samples[format];
    const converted = await generateCover({ action: 'film-cover', description });
    assert.match(converted.url, /\.webp$/);
    assert.equal(stored.at(-1).bytes.toString('ascii', 8, 12), 'WEBP');
  }
  generatedBytes = samples.png;
  imageUrl = true;
  assert.match((await generateCover({ action: 'film-cover', description })).url, /\.webp$/);
  imageUrl = false;
  const describedActions = {
    'project-cover': 'projectImage', 'playlist-cover': 'playlistCover',
    'podcast-cover': 'podcastCover', 'travel-cover': 'travelCover',
    'hobby-cover': 'hobbyCover', 'book-cover': 'bookCover',
    'booklist-cover': 'booklistCover',
  };
  for (const [action, prefix] of Object.entries(describedActions)) {
    const generated = await generateCover({ action, description });
    const request = requests.at(-1);
    assert.equal(request.size, settings[`${prefix}Size`]);
    assert.ok(request.prompt.includes(description));
    assert.ok(request.prompt.includes(settings[`${prefix}Style`]));
    assert.ok(!request.prompt.includes('{{'));
    assert.equal(generated.generatedFor, JSON.stringify([description]));
  }
  const savedCount = stored.length;
  fail = true;
  await assert.rejects(() => generateCover({ action: 'film-cover', description }), /502/);
  assert.equal(await fileCount(), savedCount, '失败不得写入或替换图片');
  fail = false;
  invalidImage = true;
  await assert.rejects(() => generateCover({ action: 'film-cover', description }), /转为 WebP 失败/);
  assert.equal(await fileCount(), savedCount, '转换失败不得写入素材');
  invalidImage = false;
  const articleCover = await generateCover({ action: 'cover', description });
  assert.equal(articleCover.generatedFor, JSON.stringify([description]));
  assert.ok(requests.at(-1).prompt.includes(description));
  assert.ok(requests.at(-1).prompt.includes(settings.coverStyle));
  assert.equal(requests.at(-1).size, settings.coverSize);
  await generateCover({ action: 'story-image', description: '湖边清晨的雾与树林' });
  assert.equal(requests.at(-1).size, settings.storyImageSize);
  assert.equal(
    requests.at(-1).prompt,
    'STORY DESCRIPTION 湖边清晨的雾与树林 / STYLE STORY DOCUMENTARY',
  );
  const { POST } = await import('../app/api/admin/ai/route.ts');
  const { sessionCookie } = await import('../lib/admin-auth.ts');
  const cookie = (await sessionCookie(new Request('http://localhost'))).split(';')[0];
  const requestImage = (action, description) => POST(new Request('http://localhost/api/admin/ai', {
    method: 'POST', headers: { origin: 'http://localhost', cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, description, title: '不能传给模型的标题', excerpt: '不能传给模型的正文', director: '不能传给模型的导演' }),
  }));
  const beforeInvalid = requests.length;
  for (const action of ['cover', 'story-image', 'project-cover', 'film-cover', ...Object.keys(describedActions).filter((kind) => kind !== 'project-cover')])
    for (const invalid of [undefined, '', '   ', '图'.repeat(5001)])
      assert.equal((await requestImage(action, invalid)).status, 400);
  assert.equal(requests.length, beforeInvalid, '无效描述不能产生模型请求');
  for (const action of ['cover', 'story-image', 'project-cover', 'film-cover', ...Object.keys(describedActions).filter((kind) => kind !== 'project-cover')]) {
    const response = await requestImage(action, description);
    assert.equal(response.status, 200);
    const prompt = requests.at(-1).prompt;
    assert.ok(prompt.includes(description));
    assert.ok(!prompt.includes('不能传给模型'));
    assert.equal((await response.json()).generatedFor, JSON.stringify([description]));
  }
  assert.equal(requests.length, await fileCount() + 2, '失败只产生一次模型请求，没有自动重试');
  console.log('PASS all image actions, PNG/JPEG/WebP and URL conversion, media persistence, invalid input and no retry');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__filmTestSettings;
  await rm(mediaDirectory, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
  Object.assign(process.env, previousEnvironment);
}
