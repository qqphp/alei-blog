import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { defaults } from '../lib/cms-defaults.ts';
import { adminCollections } from '../lib/admin-sections.ts';
import { restrictSecretFile } from './secret-permissions.mjs';

if (!process.env.DATABASE_URL || !process.env.ADMIN_PASSWORD)
  throw new Error('测试需要本地数据库和后台密码');
const sourceUrl = new URL(process.env.DATABASE_URL);
const dbName = `alei_granular_test_${Date.now()}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${dbName}`;
const adminPassword = (await readFile(resolve('.local/postgres18/admin-password'), 'utf8')).trim();
const admin = new pg.Client({ host: sourceUrl.hostname, port: Number(sourceUrl.port),
  user: 'postgres', password: adminPassword, database: 'postgres' });
await admin.connect();
let worker;
try {
  await admin.query(`CREATE DATABASE ${dbName} OWNER alei_blog`);
  const backups = (await readdir(resolve('.local/backups'))).filter((name) => name.startsWith('alei-')).sort();
  const archive = resolve('.local/backups', backups.at(-1), 'database.dump');
  const restored = spawnSync(resolve('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe'),
    ['--no-owner', '--no-privileges', '-h', sourceUrl.hostname, '-p', sourceUrl.port,
      '-U', decodeURIComponent(sourceUrl.username), '-d', dbName, archive],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: decodeURIComponent(sourceUrl.password) } });
  assert.equal(restored.status, 0, restored.stderr);
  const snapshot = async () => {
    const db = new pg.Client({ connectionString: testUrl.toString() });
    await db.connect();
    try {
      const articles = await db.query('SELECT slug, position, published, cover_url, body, updated_at FROM articles ORDER BY slug');
      const categories = await db.query('SELECT id, position, parent_id FROM article_categories ORDER BY id');
      const entries = await db.query('SELECT section, collection, id, position, published, payload, updated_at FROM cms_entries ORDER BY section, collection, id');
      const sections = await db.query('SELECT section, value FROM cms_sections ORDER BY section');
      return { articles: articles.rows, categories: categories.rows,
        entries: entries.rows, sections: sections.rows };
    } finally { await db.end(); }
  };
  const original = await snapshot();
  for (const task of [
    { name: 'migration', args: ['scripts/migrate-postgres.mjs'] },
    { name: 'default section seed', args: ['--import', 'tsx', 'scripts/seed-missing-sections.mjs'] },
  ]) {
    const run = spawnSync(process.execPath, task.args, { encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: testUrl.toString() } });
    assert.equal(run.status, 0, `${task.name}: ${run.stderr}`);
  }
  const migrated = await snapshot();
  assert.deepEqual(migrated.articles, original.articles, '迁移应保留文章顺序、发布状态与媒体');
  assert.deepEqual(migrated.categories, original.categories, '迁移应保留分类及顺序');
  for (const entry of original.entries) {
    const after = migrated.entries.find((item) => item.section === entry.section &&
      item.collection === entry.collection && item.id === entry.id);
    assert.ok(after, `迁移后缺少 ${entry.section}/${entry.collection}/${entry.id}`);
    assert.equal(after.position, entry.position);
    assert.equal(after.published, entry.published);
    if (entry.section === 'slides' && !Object.hasOwn(entry.payload, 'id')) {
      const { id: _id, ...payload } = after.payload;
      assert.deepEqual(payload, entry.payload);
      assert.equal(after.payload.id, entry.id);
    } else {
      const renamed = entry.section === 'investing' && entry.collection === 'sections'
        ? ({ trends: ['趋势分析', '技术分析'], indicators: ['策略指标', '技术指标'] })[entry.id] : null;
      assert.deepEqual(after.payload, renamed && entry.payload.title === renamed[0]
        ? { ...entry.payload, title: renamed[1] } : entry.payload);
    }
    assert.deepEqual(after.updated_at, entry.updated_at, '迁移不能改变历史更新时间');
  }
  const expectedSections = original.sections.filter((section) => !['pageSettings', 'copy'].includes(section.section));
  for (const section of expectedSections.filter((item) => item.section !== 'investing'))
    assert.deepEqual(migrated.sections.find((item) => item.section === section.section)?.value,
      section.value, `${section.section} 其余设置应保留`);
  const media = (state) => new Set(JSON.stringify(state).match(/\/api\/media\/[a-f0-9-]+\.(?:png|jpg|gif|webp|mp3|wav)/g) ?? []);
  for (const url of media({ ...original, sections: expectedSections })) assert.ok(media(migrated).has(url), `迁移后缺少素材引用 ${url}`);
  assert.equal(migrated.entries.filter((item) => item.section === 'investing' &&
    item.collection === 'sections').length, defaults.investing.sections.length);
  assert.equal(migrated.entries.filter((item) => item.section === 'investing' &&
    item.collection === 'entries').length,
  defaults.investing.sections.reduce((count, item) => count + item.entries.length, 0));
  const testDb = new pg.Client({ connectionString: testUrl.toString() });
  await testDb.connect();
  try {
    assert.equal((await testDb.query("SELECT count(*)::int AS n FROM cms_sections WHERE section IN ('pageSettings','copy')")).rows[0].n, 0, '迁移和初始化不能恢复已删除配置');
    assert.equal((await testDb.query("SELECT to_regclass('public.cms_section_parts')")).rows[0].to_regclass, null);
    assert.equal((await testDb.query('SELECT count(*)::int AS n FROM articles WHERE created_at IS NOT NULL')).rows[0].n, 0);
    assert.equal((await testDb.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='investing' AND collection='entries' AND created_at IS NOT NULL")).rows[0].n, 0);
    for (const item of original.entries.filter((row) => row.section === 'projects' && row.collection === 'items')) {
      const date = (await testDb.query("SELECT created_at FROM cms_entries WHERE section='projects' AND collection='items' AND id=$1", [item.id])).rows[0].created_at;
      assert.equal(date?.toISOString() ?? null, item.payload.createdAt ? new Date(item.payload.createdAt).toISOString() : null);
    }
    await testDb.query(`INSERT INTO cms_sections (section, value)
      VALUES ('site', '{"title":"ISOLATED_GRANULAR_TEST"}'::jsonb)
      ON CONFLICT (section) DO UPDATE SET value = jsonb_set(cms_sections.value,
        '{title}', '"ISOLATED_GRANULAR_TEST"'::jsonb)`);
  } finally { await testDb.end(); }
  const secrets = await readFile(resolve('.dev.vars'), 'utf8');
  assert.match(secrets, /^DATABASE_URL=.*$/m);
  await writeFile(resolve('dist/server/.dev.vars'),
    secrets.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${testUrl.toString()}"`));
  restrictSecretFile(resolve('dist/server/.dev.vars'));
  const port = 8893;
  const origin = `http://localhost:${port}`;
  worker = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'),
    'dev', '--config', resolve('dist/server/wrangler.json'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: testUrl.toString(),
      MINIFLARE_REGISTRY_PATH: resolve('.local/granular-test-registry') } });
  let workerError = '';
  // Wrangler logs every request; an unread pipe eventually blocks the test server.
  worker.stdout.resume();
  worker.stderr.on('data', (data) => { workerError += data.toString().slice(0, 3000); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (worker.exitCode !== null) throw new Error(workerError || '测试服务启动失败');
    try { if ((await fetch(`${origin}/api/admin/session`)).status === 200) { ready = true; break; } }
    catch { /* Still starting. */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  assert.ok(ready, workerError || '测试服务启动超时');
  const login = await fetch(`${origin}/api/admin/session`, { method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const request = async (path, method = 'GET', body) => {
    const init = { method, headers: { cookie, origin,
      ...(body ? { 'content-type': 'application/json' } : {}) } };
    if (body) init.body = JSON.stringify(body);
    try {
      const response = await fetch(origin + path, { ...init, signal: AbortSignal.timeout(30000) });
      return { status: response.status, data: await response.json() };
    } catch (error) {
      throw new Error(`测试请求失败：${method} ${path}`, { cause: error });
    }
  };
  const site = await request('/api/admin/config/site/root');
  assert.equal(site.data.value.title, 'ISOLATED_GRANULAR_TEST', '测试服务必须连接独立数据库');
  const savedSite = await request('/api/admin/config/site/root', 'PUT', {
    value: { ...site.data.value, name: '网站设置持久化测试', footer: '网站设置页脚测试' },
    revision: site.data.revision,
  });
  assert.equal(savedSite.status, 200, JSON.stringify(savedSite.data));
  for (const key of ['links', 'sites', 'life'])
    assert.deepEqual(savedSite.data.value[key], site.data.value[key], '站点保存必须保留导航');
  const savedNavigation = await request('/api/admin/config/site/root', 'PUT', {
    value: { ...savedSite.data.value, links: [...savedSite.data.value.links,
      { name: '导航持久化测试', href: '/about#profile-contact' }] },
    revision: savedSite.data.revision,
  });
  assert.equal(savedNavigation.status, 200, JSON.stringify(savedNavigation.data));
  assert.equal(savedNavigation.data.value.name, '网站设置持久化测试');
  assert.equal(savedNavigation.data.value.footer, '网站设置页脚测试');
  const staleSite = await request('/api/admin/config/site/root', 'PUT', {
    value: savedSite.data.value, revision: savedSite.data.revision,
  });
  assert.equal(staleSite.status, 409, '站点和导航共用版本，旧版本不能覆盖新导航');
  const reloadedSite = await request('/api/admin/config/site/root');
  assert.deepEqual(reloadedSite.data.value, savedNavigation.data.value);
  assert.equal(reloadedSite.data.revision, savedNavigation.data.revision);
  const settingsDb = new pg.Client({ connectionString: testUrl.toString() });
  await settingsDb.connect();
  try {
    const persisted = await settingsDb.query("SELECT value FROM cms_sections WHERE section='site'");
    assert.deepEqual(persisted.rows[0].value, savedNavigation.data.value);
  } finally { await settingsDb.end(); }
  for (const path of [
    ...['writing', 'projects', 'films', 'podcasts', 'travel', 'hobbies', 'investing', 'aiCover', 'travelCover', 'root'].map((scope) => `/api/admin/config/pageSettings/${scope}`),
    ...['home', 'writing', 'projects', 'stories', 'about', 'bookmarks', 'friends', 'books', 'life', 'player', 'navigation', 'ai', 'investing', 'root'].map((scope) => `/api/admin/config/copy/${scope}`),
  ]) {
    assert.equal((await request(path)).status, 400);
    assert.equal((await request(path, 'PUT', { value: {}, revision: 0 })).status, 400);
  }
  for (const [section, collections] of Object.entries(adminCollections))
    for (const collection of collections) {
      const list = await request(`/api/admin/records/${section}/${collection}?size=1`);
      assert.equal(list.status, 200, `${section}/${collection}: ${JSON.stringify(list.data)}`);
      assert.ok(list.data.items.length <= 1);
      if (!list.data.items.length) continue;
      const id = list.data.items[0].id;
      const path = `/api/admin/records/${section}/${collection}/${encodeURIComponent(id)}`;
      const detail = await request(path);
      assert.equal(detail.status, 200, `${section}/${collection} detail`);
      const saved = await request(path, 'PUT', { value: detail.data.value, revision: detail.data.revision });
      assert.equal(saved.status, 200, `${section}/${collection}: ${JSON.stringify(saved.data)}`);
      const stale = await request(path, 'PUT', { value: detail.data.value, revision: detail.data.revision });
      assert.equal(stale.status, 409, `${section}/${collection} stale write`);
    }
  const categories = await request('/api/admin/options/writing');
  const categoryId = categories.data.categories[0].id;
  const newCategory = { id: `granular-category-${crypto.randomUUID().slice(0, 8)}`,
    name: '逐条测试分类', description: '', parentId: '' };
  const categoryCreated = await request('/api/admin/records/writing/categories', 'POST',
    { value: newCategory });
  assert.equal(categoryCreated.status, 200, JSON.stringify(categoryCreated.data));
  const newCategoryPath = `/api/admin/records/writing/categories/${newCategory.id}`;
  const categoryChanged = await request(newCategoryPath, 'PUT', {
    value: { ...newCategory, description: '已修改' }, revision: 1 });
  assert.equal(categoryChanged.status, 200);
  const article = { ...defaults.writing[0], slug: `granular-${crypto.randomUUID().slice(0, 8)}`,
    title: '逐条测试文章', body: '', excerpt: '', cover: '', coverMode: 'upload',
    coverGeneratedFor: '', categoryId: newCategory.id, category: newCategory.name,
    _published: false };
  const created = await request('/api/admin/records/writing/articles', 'POST', { value: article });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const articlePath = `/api/admin/records/writing/articles/${article.slug}`;
  const categoryInUse = await request(newCategoryPath, 'DELETE', { revision: 2 });
  assert.equal(categoryInUse.status, 400);
  const noCover = await request(articlePath, 'PATCH', { published: true, revision: 1 });
  assert.equal(noCover.status, 400);
  const updated = await request(articlePath, 'PUT', { value: { ...article, title: '逐条测试文章已编辑' }, revision: 1 });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  const published = await request(articlePath, 'PUT', { value: { ...article,
    title: '逐条测试文章已编辑', cover: '/notes/paper-v2.png', _published: true }, revision: 2 });
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const removed = await request(articlePath, 'DELETE', { revision: 3 });
  assert.equal(removed.status, 200);
  assert.equal((await request(articlePath)).status, 404);
  assert.equal((await request(newCategoryPath, 'DELETE', { revision: 2 })).status, 200);

  const firstStory = { ...defaults.stories[0], id: `granular-story-${crypto.randomUUID().slice(0, 8)}`,
    text: '逐条测试说说', images: [], _published: false };
  const secondStory = { ...firstStory, id: `granular-story-${crypto.randomUUID().slice(0, 8)}`,
    text: '第二条测试说说' };
  const storyPath = (story) => `/api/admin/records/stories/root/${story.id}`;
  assert.equal((await request('/api/admin/records/stories/root', 'POST', { value: firstStory })).status, 200);
  assert.equal((await request('/api/admin/records/stories/root', 'POST', { value: secondStory })).status, 200);
  const firstPublished = await request(storyPath(firstStory), 'PATCH', { published: true, revision: 1 });
  assert.equal(firstPublished.status, 200, JSON.stringify(firstPublished.data));
  const moved = await request(`${storyPath(secondStory)}/move`, 'POST', { direction: -1, revision: 1 });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal((await request(storyPath(firstStory), 'DELETE', { revision: 3 })).status, 200);
  assert.equal((await request(storyPath(secondStory), 'DELETE', { revision: 2 })).status, 200);

  const project = { ...defaults.projects.items[0], id: `granular-project-${crypto.randomUUID().slice(0, 8)}`,
    title: '逐条测试项目', _published: false };
  const projectCreated = await request('/api/admin/records/projects/items', 'POST', { value: project });
  assert.equal(projectCreated.status, 200, JSON.stringify(projectCreated.data));
  assert.equal((await request(`/api/admin/records/projects/items/${project.id}`, 'DELETE',
    { revision: 1 })).status, 200);

  const largeDb = new pg.Client({ connectionString: testUrl.toString() });
  await largeDb.connect();
  try {
    await largeDb.query(`INSERT INTO cms_entries (section,collection,id,position,published,title,
      occurred_at,payload,search_text)
      SELECT 'stories','root','load-' || n,1000 + n,false,'负载测试',now(),
        jsonb_build_object('id','load-' || n,'date','2026-09-08T12:34:56+08:00',
          'text','负载测试','topics','[]'::jsonb,'images','[]'::jsonb,'_published',false),
        '负载测试' FROM generate_series(1,1000) AS n`);
  } finally { await largeDb.end(); }
  const largeList = await request('/api/admin/records/stories/root?size=20&page=2&q=负载测试');
  assert.equal(largeList.status, 200);
  assert.equal(largeList.data.total, 1000);
  assert.equal(largeList.data.items.length, 20);
  const page = await request('/api/admin/config/home/root');
  const pageSaved = await request('/api/admin/config/home/root', 'PUT',
    { value: { ...page.data.value, title: '网站设置首页持久化测试' }, revision: page.data.revision });
  assert.equal(pageSaved.status, 200, JSON.stringify(pageSaved.data));
  const pageStale = await request('/api/admin/config/home/root', 'PUT',
    { value: page.data.value, revision: page.data.revision });
  assert.equal(pageStale.status, 409);
  const reloadedHome = await request('/api/admin/config/home/root');
  assert.deepEqual(reloadedHome.data.value, pageSaved.data.value);
  assert.equal(reloadedHome.data.revision, pageSaved.data.revision);
  assert.deepEqual((await request('/api/admin/config/site/root')).data, reloadedSite.data,
    '首页保存不能改变站点和导航');
  const homeHtml = await (await fetch(origin + '/')).text();
  for (const text of ['网站设置持久化测试', '网站设置页脚测试', '导航持久化测试', '网站设置首页持久化测试'])
    assert.ok(homeHtml.includes(text), `前台应读取实际保存的${text}`);
  const categoryPath = '/api/admin/records/writing/categories/' + categoryId;
  const currentCategory = await request(categoryPath);
  const blocked = await request(categoryPath,
    'DELETE', { revision: currentCategory.data.revision });
  assert.equal(blocked.status, 400);
  const oldBulk = await fetch(`${origin}/api/admin/content`, { method: 'PUT',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ key: 'home', value: defaults.home, revision: 1 }) });
  assert.notEqual(oldBulk.status, 200, '旧整栏目写入接口必须停用');
  assert.equal(oldBulk.status, 404);
  assert.equal((await oldBulk.json()).error, '接口不存在');
  assert.equal((await request('/api/admin/config/site/root')).status, 200,
    '带正文的不存在接口请求不能阻塞后续有效请求');
  const { checkContentManagement } = await import('./test-content-management.mjs');
  await checkContentManagement({ request, origin, testUrl, defaults });
  console.log('PASS isolated PostgreSQL record lists, detail, single-record writes, conflicts, publication, move, delete, category references, config scopes and 1000-row pagination');
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill();
    await new Promise((done) => { worker.once('exit', done); setTimeout(done, 3000); });
  }
  await copyFile(resolve('.dev.vars'), resolve('dist/server/.dev.vars'));
  restrictSecretFile(resolve('dist/server/.dev.vars'));
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
