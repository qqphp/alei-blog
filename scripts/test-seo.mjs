import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import pg from 'pg';
import { Window } from 'happy-dom';
import { defaults } from '../lib/cms-defaults.ts';
import { publicPages } from '../lib/seo.ts';
import { articleDescription, automaticDescription } from '../lib/seo-text.ts';
import { seoEnvironment } from '../lib/seo-environment.mjs';
import { saveLocalMedia } from '../lib/local-media.ts';
import sharp from 'sharp';

assert.equal(seoEnvironment({}).indexable, false);
assert.deepEqual(seoEnvironment({ SITE_URL: 'https://blog.example.test/', SEO_INDEXABLE: '1' }), { siteUrl: 'https://blog.example.test', indexable: true });
for (const SITE_URL of ['', 'http://blog.example.test', 'https://localhost', 'https://localhost.', 'https://127.1', 'https://[::1]', 'https://[::ffff:127.0.0.2]', 'https://blog.example.test/child', 'https://u:p@blog.example.test', 'https://blog.example.test?x=1', 'https://blog.example.test#', 'https://blog.example.test/a/../'])
  assert.throws(() => seoEnvironment({ SITE_URL, SEO_INDEXABLE: '1' }), /SITE_URL/);
assert.throws(() => seoEnvironment({ SEO_INDEXABLE: 'true' }), /SEO_INDEXABLE/);
assert.equal(automaticDescription('  A\n\tB  '), 'A B');
assert.equal(Array.from(automaticDescription('😀'.repeat(161))).length, 160);
assert.equal(articleDescription({ excerpt: '', body: '# 标题\n\n**正文** [链接](https://example.com)', seoDescription: '' }), '标题 正文 链接');
assert.equal(articleDescription({ excerpt: '', body: '', seoDescription: ' 保留\n 自定义 ' }), ' 保留\n 自定义 ');
console.log('PASS SEO configuration validation, Unicode truncation, Markdown fallback and untouched custom descriptions');

if (!process.env.DATABASE_URL) throw new Error('SEO 检查需要本地 DATABASE_URL 和已完成的生产构建');
const source = new URL(process.env.DATABASE_URL);
const dbName = `alei_seo_test_${Date.now()}`;
const target = new URL(source); target.pathname = `/${dbName}`;
const admin = new pg.Client(process.env.PG_ADMIN_URL ? { connectionString: process.env.PG_ADMIN_URL } : {
  host: source.hostname, port: Number(source.port), database: 'postgres', user: 'postgres',
  password: (await readFile('.local/postgres18/admin-password', 'utf8')).trim(),
});
const directory = await mkdtemp(join(tmpdir(), 'alei-seo-'));
const password = randomUUID();
const adminPath = `seo-${randomUUID().replaceAll('-', '')}`;
const base = 'http://127.0.0.1:8896';
const formal = 'https://blog.example.test';
const env = { ...process.env, DATABASE_URL: target.href, CMS_MEDIA_DIRECTORY: directory, ADMIN_PASSWORD: password,
  ADMIN_PATH: adminPath, CONTACT_MAIL_WORKER_ENABLED: '0', HOST: '127.0.0.1', PORT: '8896', VINEXT_TRUST_PROXY: '0', SITE_URL: formal, SEO_INDEXABLE: '0' };
let server, cookie;
const db = new pg.Client({ connectionString: target.href });
const run = (script) => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts', script)], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${script}: ${result.stderr}`);
};
const stop = async () => {
  if (server?.exitCode === null && server.signalCode === null) {
    const exited = new Promise((done) => server.once('exit', done)); server.kill(); await exited;
  }
  server = undefined;
};
const start = async (flag, siteUrl = formal) => {
  server = spawn(process.execPath, ['scripts/start-production.mjs'], { env: { ...env, SEO_INDEXABLE: flag, SITE_URL: siteUrl }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; server.stderr.on('data', (data) => { errors += data.toString(); });
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(errors || 'SEO server exited');
    try { if ((await fetch(`${base}/api/admin/session`)).ok) return; } catch { /* Starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(errors || 'SEO server timeout');
};
const api = async (path, options = {}) => {
  const response = await fetch(base + path, { ...options, headers: { cookie: cookie ?? '', origin: base, 'Content-Type': 'application/json', ...options.headers } });
  const value = await response.json(); assert.equal(response.status, options.status ?? 200, value.error); return value;
};
const put = (path, value, revision, status = 200) => api(path, { method: 'PUT', body: JSON.stringify({ value, revision }), status });
const html = async (path, agent = 'Mozilla/5.0') => {
  const response = await fetch(base + path, { headers: { 'User-Agent': agent }, redirect: 'manual' });
  const text = await response.text();
  const window = new Window({ url: base + path, settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } }); window.document.write(text);
  await window.happyDOM.abort();
  return { response, text, document: window.document };
};
const meta = (document, name) => document.head.querySelector(`meta[name="${name}"],meta[property="${name}"]`)?.getAttribute('content');
const canonical = (document) => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const structured = (document) => [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => JSON.parse(node.textContent));
const homeCounts = async (articles, projects, stories) => {
  const { response, document } = await html('/');
  assert.equal(response.status, 200);
  const region = document.querySelector('[aria-label="已发布内容统计"]');
  assert.ok(region);
  assert.equal(region.querySelector('.home-now-label').textContent, '积累');
  assert.deepEqual([...region.querySelectorAll('.home-now-item > div > span')].map((node) => node.textContent), ['笔墨成篇', '匠心成作', '随心札记']);
  assert.deepEqual([...region.querySelectorAll('.home-now-item p')].map((node) => node.textContent), [`${articles} 篇文章`, `${projects} 个项目`, `${stories} 则说说`]);
  assert.equal(region.querySelector('a'), null);
};
const sitemap = async () => {
  const { response, text, document } = await html('/sitemap.xml');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /xml/);
  assert.match(text, /^<\?xml/); assert.match(text, /<urlset/);
  return { text, urls: [...document.querySelectorAll('loc')].map((node) => node.textContent), entries: [...document.querySelectorAll('url')] };
};
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName} OWNER "${source.username.replaceAll('"', '""')}"`);
  run('migrate-postgres.mjs'); run('seed-missing-sections.mjs');
  await db.connect();
  await db.query('DELETE FROM articles');
  await db.query("DELETE FROM cms_entries WHERE section='projects' AND collection='items'");
  const articleCategory = defaults.categories[0].id;
  for (let i = 0; i < 18; i++) {
    await db.query(`INSERT INTO articles(slug,title,excerpt,body,category_id,published,created_at,updated_at,position)
      VALUES($1,$2,$3,$4,$5,$6,'2026-01-02T03:04:05Z','2026-02-03T04:05:06Z',$7)`,
    [`seo-article-${i}`, `文章 ${i}`, i === 1 ? '' : `摘要 ${i}`, `## 正文 ${i}\n\n**内容** 独立文章 ${i}。`, articleCategory, i !== 17, i]);
  }
  for (let i = 0; i < 8; i++) {
    const payload = { ...defaults.projects.items[0], id: `seo-project-${i}`, title: `项目 ${i}`, description: `项目简介 ${i}`,
      body: `## 项目正文 ${i}\n\n目标项目独立说明 ${i}。`, _published: i !== 7 };
    await db.query(`INSERT INTO cms_entries(section,collection,id,position,title,category_id,status_id,published,payload,created_at,updated_at)
      VALUES('projects','items',$1,$2,$3,$4,$5,$6,$7::jsonb,'2026-01-02T03:04:05Z','2026-02-03T04:05:06Z')`,
    [payload.id, i, payload.title, payload.categoryId, payload.statusId, payload._published, JSON.stringify(payload)]);
  }
  await db.query("DELETE FROM cms_entries WHERE section='stories' AND collection='root'");
  for (let i = 0; i < 10; i++) {
    const payload = { ...defaults.stories[0], id: `seo-story-${i}`, text: `统计说说 ${i}`, images: [], topics: [],
      date: i % 2 ? '2024-01-02T03:04:05+08:00' : '2026-09-01T03:04:05+08:00', _published: i !== 9 };
    await db.query(`INSERT INTO cms_entries(section,collection,id,position,published,payload,occurred_at)
      VALUES('stories','root',$1,$2,$3,$4::jsonb,$5)`, [payload.id, i, payload._published, JSON.stringify(payload), payload.date]);
  }
  await db.query(`INSERT INTO cms_entries(section,collection,id,position,published,payload)
    VALUES('stories','covers','seo-story-cover',0,true,'{}')`);
  // Simulate the old schema in the isolated database, and prove migration/replay preserve every old column.
  await db.query('ALTER TABLE articles DROP COLUMN seo_title, DROP COLUMN seo_description');
  await db.query("DELETE FROM schema_migrations WHERE version='0026_article_seo.sql'");
  const before = (await db.query('SELECT * FROM articles ORDER BY slug')).rows;
  run('migrate-postgres.mjs'); run('migrate-postgres.mjs');
  const after = (await db.query('SELECT * FROM articles ORDER BY slug')).rows;
  assert.deepEqual(after.map(({ seo_title, seo_description, ...row }) => { assert.equal(seo_title, ''); assert.equal(seo_description, ''); return row; }), before);
  console.log('PASS old-schema migration and replay preserve every existing article field');
  process.env.CMS_MEDIA_DIRECTORY = directory;
  const shared = '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
  await saveLocalMedia(shared.split('/').at(-1), await readFile('public/notes/paper-v2.png'), { contentType: 'image/png', name: 'SEO shared image' });
  await db.query('UPDATE articles SET cover_url=$1 WHERE slug=$2', [shared, 'seo-article-0']);
  await start('0');
  const resized = await fetch(`${base}/_next/image?${new URLSearchParams({ url: shared, w: '128', q: '75' })}`);
  assert.equal(resized.status, 200); assert.equal(resized.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(await resized.arrayBuffer())).metadata()).width, 128);
  assert.equal((await fetch(`${base}/_next/image?${new URLSearchParams({ url: shared, w: '999', q: '75' })}`)).status, 400);
  assert.equal((await fetch(`${base}/_next/image?${new URLSearchParams({ url: 'https://attacker.example/image.png', w: '128', q: '75' })}`)).status, 400);
  assert.equal((await fetch(`${base}/_next/image?${new URLSearchParams({ url: '/api/media/bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.png', w: '128', q: '75' })}`)).status, 404);
  const login = await fetch(`${base}/api/admin/session`, { method: 'POST', headers: { origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
  let config = await api('/api/admin/config/site/root');
  assert.deepEqual(config.seoEnvironment, { siteUrl: formal, indexable: false });
  config = await put('/api/admin/config/site/root', { ...config.value, defaultShareImage: shared, defaultShareImageAlt: '默认分享图说明' }, config.revision);
  const originalHomeTitle = config.value.title, originalHomeDescription = config.value.description;
  for (const path of Object.keys(publicPages)) {
    const { response, document } = await html(path);
    assert.equal(response.status, 200, path); assert.equal(canonical(document), formal + (path === '/' ? '/' : path));
    assert.match(meta(document, 'robots'), /noindex/); assert.ok(meta(document, 'description'), path);
    assert.ok(meta(document, 'og:title')); assert.ok(meta(document, 'twitter:title')); assert.equal(meta(document, 'og:url'), canonical(document));
    if (path === '/') { assert.equal(document.title, originalHomeTitle); assert.equal(meta(document, 'description'), originalHomeDescription); assert.equal(structured(document)[0]['@type'], 'WebSite'); }
    else assert.notEqual(document.title, originalHomeTitle);
  }
  assert.equal((await sitemap()).urls.length, 0);
  let robots = await (await fetch(base + '/robots.txt')).text();
  assert.match(robots, /Allow: \/api\/media\//); assert.doesNotMatch(robots, /Sitemap:|Disallow: \/\s/); assert.ok(!robots.includes(adminPath));
  console.log('PASS all public columns, homepage settings, default sharing, noindex environment and crawlable media rules');
  await homeCounts(17, 7, 9);

  const recordPath = '/api/admin/records/writing/articles/seo-article-0';
  let record = await api(recordPath);
  record = await put(recordPath, { ...record.value, seoTitle: '搜索专用标题', seoDescription: ' 独立描述\n 第二行 ' }, record.revision);
  assert.equal((await api(recordPath)).value.seoTitle, '搜索专用标题');
  let page = await html('/writing/seo-article-0');
  assert.match(page.document.title, /^搜索专用标题 · /); assert.equal(meta(page.document, 'description'), ' 独立描述\n 第二行 ');
  assert.equal(canonical(page.document), formal + '/writing/seo-article-0');
  const oldRequest = { ...record.value }; delete oldRequest.seoTitle; delete oldRequest.seoDescription;
  record = await put(recordPath, oldRequest, record.revision); assert.equal(record.value.seoTitle, '搜索专用标题');
  await put(recordPath, { ...record.value, seoTitle: '冲突输入' }, record.revision - 1, 409);
  await put(recordPath, { ...record.value, seoTitle: 'x'.repeat(201) }, record.revision, 400);
  await put(recordPath, { ...record.value, seoDescription: 'x'.repeat(1001) }, record.revision, 400);
  await stop(); await start('0');
  assert.equal((await api(recordPath)).value.seoDescription, ' 独立描述\n 第二行 ');
  record = await put(recordPath, { ...record.value, seoTitle: '', seoDescription: '' }, record.revision);
  page = await html('/writing/seo-article-0'); assert.match(page.document.title, /^文章 0 · /); assert.equal(meta(page.document, 'description'), '摘要 0');
  const legacy = { ...defaults.writing[0], slug: 'legacy-client', title: '旧客户端文章', cover: '', categoryId: articleCategory, _published: false };
  delete legacy.seoTitle; delete legacy.seoDescription;
  const created = await api('/api/admin/records/writing/articles', { method: 'POST', body: JSON.stringify({ value: legacy }) });
  assert.equal(created.value.seoTitle, ''); assert.equal(created.value.seoDescription, '');
  config = await api('/api/admin/config/site/root');
  await put('/api/admin/config/site/root', { ...config.value, defaultShareImage: '', name: '测试新品牌' }, config.revision);
  assert.equal((await fetch(base + shared)).status, 200, 'Replacing a shared default image must retain the article image');
  assert.match((await html('/ai')).document.title, /测试新品牌$/);
  assert.equal(meta((await html('/ai')).document, 'og:image'), undefined);
  const excerptFallback = await html('/writing/seo-article-1'); assert.equal(meta(excerptFallback.document, 'description'), '正文 1 内容 独立文章 1。');
  console.log('PASS overrides, old POST/PUT semantics, clearing, conflicts, limits, restart persistence, brand changes and shared-image retention');

  page = await html('/writing?page=2'); assert.equal(canonical(page.document), formal + '/writing?page=2');
  assert.equal(page.document.querySelectorAll('.writing-list-item').length, 8);
  assert.equal(page.document.querySelector('nav[aria-label="文章分页"] a:last-child').getAttribute('href'), '/writing?page=3');
  assert.equal(page.document.querySelector('nav[aria-label="文章分页"] a:first-child').getAttribute('href'), '/writing');
  assert.ok(page.document.querySelector('.writing-category-tree a[href]'));
  page = await html('/writing?q=独立文章+16'); assert.equal(page.document.querySelectorAll('.writing-list-item').length, 1); assert.match(meta(page.document, 'robots'), /noindex/);
  assert.notEqual(canonical(page.document), formal + '/writing');
  page = await html(`/writing?group=${articleCategory}`); assert.match(meta(page.document, 'robots'), /noindex/);
  for (const [path, destination] of [['/writing?page=999', '/writing?page=3'], ['/projects?page=999', '/projects?page=2'], ['/writing?page=0', '/writing'], ['/projects?page=-1', '/projects'], ['/writing?page=abc', '/writing']]) {
    const response = await fetch(base + path, { redirect: 'manual' }); assert.equal(response.status, 307); assert.equal(new URL(response.headers.get('location'), base).pathname + new URL(response.headers.get('location'), base).search, destination);
  }
  page = await html('/projects?page=2'); assert.equal(page.document.querySelectorAll('.folio-project').length, 1); assert.equal(canonical(page.document), formal + '/projects?page=2');
  assert.equal(page.document.querySelector('.folio-project').getAttribute('href'), '/projects?project=seo-project-6&page=2');
  for (const path of ['/projects?project=seo-project-6', '/projects?project=seo-project-6&page=1&category=missing']) {
    page = await html(path); assert.equal(page.response.status, 200); assert.match(page.text, /目标项目独立说明 6/); assert.match(page.document.title, /^项目 6 · 测试新品牌$/); assert.equal(canonical(page.document), formal + '/projects?project=seo-project-6');
  }
  for (const path of ['/writing/absent', '/writing/seo-article-17', '/projects?project=absent', '/projects?project=seo-project-7', '/absent']) {
    page = await html(path); assert.equal(page.response.status, 404, path); assert.match(meta(page.document, 'robots'), /noindex/);
  }
  console.log('PASS raw SSR pagination, real links, filtered search, contextual project details, temporary redirects and actual 404s');

  const injection = '</script><script id="seo-injected">bad()</script>';
  record = await api(recordPath); record = await put(recordPath, { ...record.value, title: injection }, record.revision);
  page = await html('/writing/seo-article-0'); assert.equal(page.document.querySelector('#seo-injected'), null);
  const posting = structured(page.document).find((item) => item['@type'] === 'BlogPosting');
  assert.equal(posting.headline, injection); assert.equal(posting.dateCreated, '2026-01-02T03:04:05.000Z'); assert.ok(posting.dateModified); assert.equal(posting.datePublished, undefined);
  assert.equal(posting.image, formal + shared); assert.equal(posting.author.name, defaults.profile.name); assert.equal(posting.author.url, formal + '/about');
  assert.equal(structured(page.document).find((item) => item['@type'] === 'BreadcrumbList').itemListElement.at(-1).name, injection);
  record = await put(recordPath, { ...record.value, title: '文章 0' }, record.revision);
  await stop(); await start('1');
  for (const agent of ['Mozilla/5.0', 'Googlebot', 'Bingbot', 'Baiduspider', '']) {
    for (const path of ['/', '/writing/seo-article-0', '/writing/seo-article-1', '/projects?project=seo-project-6']) {
      page = await html(path, agent); assert.equal(page.response.status, 200); assert.doesNotMatch(meta(page.document, 'robots'), /noindex/);
      assert.ok(canonical(page.document)?.startsWith(formal)); assert.equal(meta(page.document, 'og:url'), canonical(page.document)); assert.ok(meta(page.document, 'description'));
      assert.equal(page.document.head.querySelector('title')?.textContent, page.document.title);
    }
  }
  page = await html('/writing?q=test'); assert.match(meta(page.document, 'robots'), /noindex/);
  page = await html('/projects?category=test'); assert.match(meta(page.document, 'robots'), /noindex/);
  page = await html(`/${adminPath}`); assert.match(meta(page.document, 'robots'), /noindex/);
  const first = (await html('/writing/seo-article-0')).document, second = (await html('/writing/seo-article-1')).document;
  assert.notEqual(first.title, second.title); assert.notEqual(meta(first, 'description'), meta(second, 'description')); assert.notEqual(canonical(first), canonical(second));
  const spoofed = await new Promise((done, reject) => {
    httpRequest(base + '/writing/seo-article-0', { headers: { Host: 'attacker.example' } }, (response) => {
      let result = ''; response.on('data', (chunk) => { result += chunk; }); response.on('end', () => done(result));
    }).on('error', reject).end();
  });
  const window = new Window({ url: base, settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } }); window.document.write(spoofed); assert.equal(canonical(window.document), formal + '/writing/seo-article-0');
  await window.happyDOM.abort();
  robots = await (await fetch(base + '/robots.txt')).text(); assert.match(robots, /Sitemap: https:\/\/blog.example.test\/sitemap.xml/); assert.ok(!robots.includes(adminPath));
  const map = await sitemap(); assert.equal(map.urls.length, 42); // 15 roots + 3 pagination + 17 articles + 7 projects.
  assert.equal(new Set(map.urls).size, map.urls.length); assert.ok(map.urls.includes(formal + '/writing?page=3')); assert.ok(map.urls.includes(formal + '/projects?page=2'));
  assert.ok(map.urls.every((url) => !url.includes('seo-article-17') && !url.includes('seo-project-7') && !/[?&](q|category|group)=/.test(url) && !url.includes(adminPath)));
  for (const entry of map.entries) {
    const lastmod = entry.querySelector('lastmod')?.textContent;
    if (lastmod) assert.ok(Number.isFinite(Date.parse(lastmod)));
    else assert.ok(Object.keys(publicPages).some((path) => entry.querySelector('loc').textContent === formal + path) || entry.querySelector('loc').textContent.includes('?page='));
  }
  const draftPath = '/api/admin/records/writing/articles/seo-article-17';
  let draft = await api(draftPath); draft = await put(draftPath, { ...draft.value, cover: '/notes/paper-v2.png', _published: true }, draft.revision);
  assert.ok((await sitemap()).urls.includes(formal + '/writing/seo-article-17'));
  await homeCounts(18, 7, 9);
  draft = await put(draftPath, { ...draft.value, _published: false }, draft.revision); assert.ok(!(await sitemap()).urls.includes(formal + '/writing/seo-article-17'));
  await homeCounts(17, 7, 9);
  draft = await put(draftPath, { ...draft.value, _published: true }, draft.revision);
  await homeCounts(18, 7, 9);
  await api(draftPath, { method: 'DELETE', body: JSON.stringify({ revision: draft.revision }) });
  await homeCounts(17, 7, 9);
  const projectPath = '/api/admin/records/projects/items/seo-project-7';
  let project = await api(projectPath); project = await put(projectPath, { ...project.value, _published: true }, project.revision);
  assert.ok((await sitemap()).urls.includes(formal + '/projects?project=seo-project-7'));
  await homeCounts(17, 8, 9);
  project = await put(projectPath, { ...project.value, _published: false }, project.revision);
  await homeCounts(17, 7, 9);
  project = await put(projectPath, { ...project.value, _published: true }, project.revision);
  await homeCounts(17, 8, 9);
  await api(projectPath, { method: 'DELETE', body: JSON.stringify({ revision: project.revision }) });
  assert.ok(!(await sitemap()).urls.includes(formal + '/projects?project=seo-project-7'));
  await homeCounts(17, 7, 9);
  const storyPath = '/api/admin/records/stories/root/seo-story-9';
  let story = await api(storyPath); story = await put(storyPath, { ...story.value, _published: true }, story.revision);
  await homeCounts(17, 7, 10);
  story = await put(storyPath, { ...story.value, _published: false }, story.revision);
  await homeCounts(17, 7, 9);
  story = await put(storyPath, { ...story.value, _published: true }, story.revision);
  await api(storyPath, { method: 'DELETE', body: JSON.stringify({ revision: story.revision }) });
  await homeCounts(17, 7, 9);
  console.log('PASS crawler HTML, canonical Host isolation, safe JSON-LD, real dates, full dynamic sitemap and publication/removal changes');
  await stop(); await start('0', '');
  for (const path of ['/', '/writing/seo-article-0', '/projects?project=seo-project-6']) {
    page = await html(path); assert.equal(page.response.status, 200); assert.match(meta(page.document, 'robots'), /noindex/); assert.equal(canonical(page.document), undefined);
  }
  await db.query('UPDATE articles SET published=false');
  await homeCounts(0, 7, 9);
  await db.query("UPDATE cms_entries SET published=false WHERE section='projects' AND collection='items'");
  await homeCounts(0, 0, 9);
  await db.query("UPDATE cms_entries SET published=false WHERE section='stories' AND collection='root'");
  await homeCounts(0, 0, 0);
  await db.query("DELETE FROM cms_sections WHERE section='writing'");
  const defaultArticles = defaults.writing.filter((item) => item._published).length;
  await homeCounts(defaultArticles, 0, 0);
  await db.query("DELETE FROM cms_sections WHERE section IN ('projects','stories')");
  await homeCounts(defaultArticles, defaults.projects.items.filter((item) => item._published).length, defaults.stories.filter((item) => item._published).length);
  console.log('PASS published homepage counts, all-page/year totals, publication/withdrawal/deletion, zero states and per-section defaults');
  await stop();
  const invalid = spawnSync(process.execPath, ['scripts/start-production.mjs'], { env: { ...env, SEO_INDEXABLE: '1', SITE_URL: 'http://localhost' }, encoding: 'utf8', windowsHide: true });
  assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /SITE_URL/);
  const invalidDev = spawnSync(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], {
    env: { ...env, SEO_INDEXABLE: '1', SITE_URL: 'http://localhost' }, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  assert.notEqual(invalidDev.status, 0); assert.match(invalidDev.stderr + invalidDev.stdout, /SITE_URL/);
  console.log('PASS optimized media responses, preview without a formal URL and invalid production configuration fails before startup');
} finally {
  await stop(); await db.end().catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  assert.equal(dirname(directory), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
}
