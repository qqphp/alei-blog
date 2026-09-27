import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./film-ai-test-loader.mjs', import.meta.url);
const { defaults } = await import('../lib/cms-defaults.ts');
const settings = {
  ...defaults.aiSettings,
  filmCoverPrompt: 'FILM {{title}} / {{director}} / {{style}}',
  filmCoverStyle: 'PORTRAIT FILM',
  imageModel: 'test-image-model',
  coverSize: '2048x1152',
  projectImageSize: '1920x1088',
  storyImageSize: '1792x1024',
  storyImageStyle: 'STORY DOCUMENTARY',
  storyImagePrompt: 'STORY TOPICS {{title}} / TEXT {{excerpt}} / STYLE {{style}}',
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
  const result = await generateCover(
    '影片名称',
    '',
    undefined,
    false,
    '导演姓名',
  );
  assert.equal(requests[0].model, 'test-image-model');
  assert.equal(settingsReads, 1, '一次生成只读取一次 AI 设置');
  assert.equal(requests[0].prompt, 'FILM 影片名称 / 导演姓名 / PORTRAIT FILM');
  assert.match(result.url, /^\/api\/media\/.+\.png$/);
  assert.equal(
    result.generatedFor,
    JSON.stringify(['影片名称', '导演姓名', '9:16']),
  );
  assert.equal(requests[0].size, settings.filmCoverSize);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].bytes, Buffer.from(png, 'base64'));
  assert.equal(stored[0].contentType, 'image/png');
  assert.equal(stored[0].source, 'ai');
  const playlist = await generateCover(
    '歌单名称',
    '夜晚听的音乐',
    undefined,
    false,
    undefined,
    true,
  );
  assert.equal(requests[1].size, settings.playlistCoverSize);
  assert.ok(requests[1].prompt.includes('歌单名称'));
  assert.ok(requests[1].prompt.includes('夜晚听的音乐'));
  assert.equal(
    playlist.generatedFor,
    JSON.stringify(['歌单名称', '夜晚听的音乐', '1:1']),
  );
  const podcast = await generateCover(
    '播客标题',
    '节目简介',
    undefined,
    false,
    undefined,
    false,
    '主播姓名',
  );
  assert.equal(requests[2].size, settings.podcastCoverSize);
  for (const value of [
    '播客标题',
    '节目简介',
    '主播姓名',
    settings.podcastCoverStyle,
  ])
    assert.ok(requests[2].prompt.includes(value));
  assert.equal(
    podcast.generatedFor,
    JSON.stringify(['播客标题', '节目简介', '主播姓名', '3:2']),
  );
  fail = true;
  await assert.rejects(
    () => generateCover('影片名称', '故事简介', undefined, false, '导演姓名'),
    /502/,
  );
  assert.equal(stored.length, 3, 'Failure must not write or replace image');
  assert.equal(requests.length, 4, 'No automatic retries');
  fail = false;
  for (const kind of ['travel', 'hobby', 'book', 'booklist']) {
    const result = await generateCover('测试标题', kind === 'book' ? '' : '测试简介', undefined, false, undefined, false, undefined, { kind, author: '测试作者' });
    const request = requests.at(-1);
    assert.equal(request.size, settings[`${kind}CoverSize`]);
    assert.ok(request.prompt.includes('测试标题'));
    assert.ok(request.prompt.includes(kind === 'book' ? '测试作者' : '测试简介'));
    assert.ok(request.prompt.includes(settings[`${kind}CoverStyle`]));
    assert.ok(!request.prompt.includes('{{'));
    assert.match(result.url, /^\/api\/media\/.+\.png$/);
  }
  await generateCover('仅书名', '', undefined, false, undefined, false, undefined, { kind: 'book' });
  assert.ok(requests.at(-1).prompt.includes('仅书名'));
  assert.ok(!requests.at(-1).prompt.includes('undefined'));
  await generateCover('文章标题', '文章摘要');
  assert.equal(requests.at(-1).size, settings.coverSize);
  await generateCover('项目名称', '项目摘要', '项目副标题');
  assert.equal(requests.at(-1).size, settings.projectImageSize);
  await generateCover('话题一、话题二', '说说文字内容', undefined, true);
  assert.equal(requests.at(-1).size, settings.storyImageSize);
  assert.equal(
    requests.at(-1).prompt,
    'STORY TOPICS 话题一、话题二 / TEXT 说说文字内容 / STYLE STORY DOCUMENTARY',
  );
  console.log('PASS every configured image category uses its independent size');
  console.log('PASS travel/hobby/book prompts, optional author, image sizes and media storage');
  console.log(
    'PASS film cover settings, film title/director and playlist title/synopsis prompts with 9:16 and 1:1 sizes, model request, PNG storage and failed generation without retries (no paid calls)',
  );
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__filmTestBindings;
}
