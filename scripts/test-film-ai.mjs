import assert from 'node:assert/strict';
import { register } from 'node:module';
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
globalThis.__filmTestBindings = {
  TEAMOROUTER_KEY: 'test-only-key',
  ADMIN_PASSWORD: 'test-story-password-only',
  LOCAL_MEDIA_STORAGE: 'http://127.0.0.1:3210',
  LOCAL_MEDIA_TOKEN: 'test-media-token',
  DB: {
    prepare: () => ({
      all: async () => {
        settingsReads++;
        return {
        results: [
          { key: 'aiSettings', value: JSON.stringify(settings), revision: 1 },
        ],
        };
      },
    }),
  },
};
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L1sAAAAASUVORK5CYII=';
const originalFetch = globalThis.fetch;
let fail = false;
globalThis.fetch = async (url, init) => {
  const href =
    typeof url === 'string'
      ? url
      : url instanceof URL
        ? url.href
        : url.url;
  if (href.startsWith('http://127.0.0.1:3210/media/')) {
    assert.equal(init.method, 'PUT');
    assert.equal(init.headers.get('X-Local-Media-Token'), 'test-media-token');
    stored.push({
      key: href.split('/').at(-1),
      bytes: Buffer.from(init.body),
      contentType: init.headers.get('Content-Type'),
      source: init.headers.get('X-Media-Source'),
    });
    return new Response(null, { status: 201 });
  }
  assert.equal(
    href,
    'https://api.teamorouter.com/v1/images/generations',
  );
  assert.equal(init.headers.Authorization, 'Bearer test-only-key');
  requests.push(JSON.parse(init.body));
  return fail
    ? Response.json({ error: 'failure' }, { status: 502 })
    : Response.json({ data: [{ b64_json: png }] });
};
try {
  const { generateCover } = await import('../lib/ai-provider.ts');
  const description = '雨夜街道上的红色雨伞';
  const result = await generateCover({ action: 'film-cover', description });
  assert.equal(requests[0].model, 'test-image-model');
  assert.equal(settingsReads, 1, '一次生成只读取一次 AI 设置');
  assert.equal(requests[0].prompt, `FILM ${description} / PORTRAIT FILM`);
  assert.match(result.url, /^\/api\/media\/.+\.png$/);
  assert.equal(result.generatedFor, JSON.stringify([description]));
  assert.equal(requests[0].size, settings.filmCoverSize);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].bytes, Buffer.from(png, 'base64'));
  assert.equal(stored[0].contentType, 'image/png');
  assert.equal(stored[0].source, 'ai');
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
  assert.equal(stored.length, savedCount, '失败不得写入或替换图片');
  fail = false;
  await generateCover({ action: 'cover', title: '文章标题', excerpt: '文章摘要' });
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
  for (const action of ['story-image', 'project-cover', 'film-cover', ...Object.keys(describedActions).filter((kind) => kind !== 'project-cover')])
    for (const invalid of [undefined, '', '   ', '图'.repeat(5001)])
      assert.equal((await requestImage(action, invalid)).status, 400);
  assert.equal(requests.length, beforeInvalid, '无效描述不能产生模型请求');
  for (const action of ['story-image', 'project-cover', 'film-cover', ...Object.keys(describedActions).filter((kind) => kind !== 'project-cover')]) {
    const response = await requestImage(action, description);
    assert.equal(response.status, 200);
    const prompt = requests.at(-1).prompt;
    assert.ok(prompt.includes(description));
    assert.ok(!prompt.includes('不能传给模型'));
    assert.equal((await response.json()).generatedFor, JSON.stringify([description]));
  }
  assert.equal(requests.length, stored.length + 1, '失败只产生一次模型请求，没有自动重试');
  console.log('PASS eight description-driven categories, story, unchanged article, sizes, media persistence, invalid input and no retry');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__filmTestBindings;
}
