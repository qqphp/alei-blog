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
      const articles = await db.query('SELECT slug, position, published, published_on, cover_url, body, updated_at FROM articles ORDER BY slug');
      const categories = await db.query('SELECT id, position, parent_id FROM article_categories ORDER BY id');
      const entries = await db.query('SELECT section, collection, id, position, published, occurred_at, payload, updated_at FROM cms_entries ORDER BY section, collection, id');
      const sections = await db.query('SELECT section, value FROM cms_sections ORDER BY section');
      return { articles: articles.rows, categories: categories.rows,
        entries: entries.rows, sections: sections.rows };
    } finally { await db.end(); }
  };
  const original = await snapshot();
  const timeDb = new pg.Client({ connectionString: testUrl.toString() });
  await timeDb.connect();
  const historicalArticles = (await timeDb.query('SELECT slug, created_at FROM articles')).rows;
  const historicalEntries = (await timeDb.query('SELECT section, collection, id, created_at FROM cms_entries')).rows;
  await timeDb.end();
  for (const task of [
    { name: 'migration', args: ['scripts/migrate-postgres.mjs'] },
    { name: 'default section seed', args: ['--import', 'tsx', 'scripts/seed-missing-sections.mjs'] },
  ]) {
    const run = spawnSync(process.execPath, task.args, { encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: testUrl.toString() } });
    assert.equal(run.status, 0, `${task.name}: ${run.stderr}`);
  }
  const migrated = await snapshot();
  const replay = new pg.Client({ connectionString: testUrl.toString() });
  await replay.connect();
  try {
    for (const file of ['0016_ai_skill_categories.sql', '0017_remove_playlist_color.sql', '0018_ai_agent_statuses.sql'])
      await replay.query(await readFile(resolve('db/migrations', file), 'utf8'));
  }
  finally { await replay.end(); }
  assert.deepEqual(await snapshot(), migrated, '分类和歌单迁移重复执行不能覆盖已迁移数据');
  assert.deepEqual(migrated.articles, original.articles, '迁移应保留文章顺序、发布状态与媒体');
  assert.deepEqual(migrated.categories, original.categories, '迁移应保留分类及顺序');
  for (const entry of original.entries) {
    const after = migrated.entries.find((item) => item.section === entry.section &&
      item.collection === entry.collection && item.id === entry.id);
    assert.ok(after, `迁移后缺少 ${entry.section}/${entry.collection}/${entry.id}`);
    assert.equal(after.position, entry.position);
    assert.equal(after.published, entry.published);
    assert.deepEqual(after.occurred_at, entry.occurred_at, '迁移不能改变说说日期或其他内容日期');
    if (entry.section === 'slides' && !Object.hasOwn(entry.payload, 'id')) {
      const { id: _id, ...payload } = after.payload;
      assert.deepEqual(payload, entry.payload);
      assert.equal(after.payload.id, entry.id);
    } else {
      const renamed = entry.section === 'investing' && entry.collection === 'sections'
        ? ({ trends: ['趋势分析', '技术分析'], indicators: ['策略指标', '技术指标'] })[entry.id] : null;
      const coverDescriptionRecord = [
        ['tracks', 'playlists'], ['films', 'items'], ['podcasts', 'items'],
        ['travel', 'items'], ['hobbies', 'items'], ['books', 'items'], ['books', 'lists'],
      ].some(([section, collection]) => entry.section === section && entry.collection === collection);
      const expected = renamed && entry.payload.title === renamed[0]
        ? { ...entry.payload, title: renamed[1] } : { ...entry.payload };
      const historicalSkill = entry.section === 'ai' && entry.collection === 'skills' &&
        (Object.hasOwn(expected, 'category') || Object.hasOwn(expected, 'subcategory') || !Object.hasOwn(expected, 'categoryId'));
      if (historicalSkill) {
        delete expected.category;
        delete expected.subcategory;
        expected.categoryId = '';
      }
      if (entry.section === 'tracks' && entry.collection === 'playlists') delete expected.color;
      assert.deepEqual(after.payload, coverDescriptionRecord && !('coverDescription' in expected)
        ? { ...expected, coverDescription: '' } : expected);
    }
    if (!((entry.section === 'ai' && entry.collection === 'skills') ||
      (entry.section === 'tracks' && entry.collection === 'playlists' && Object.hasOwn(entry.payload, 'color'))))
      assert.deepEqual(after.updated_at, entry.updated_at, '迁移不能改变历史更新时间');
  }
  const expectedSections = original.sections.filter((section) => !['pageSettings', 'copy'].includes(section.section));
  for (const section of expectedSections.filter((item) => item.section !== 'investing')) {
    const actual = migrated.sections.find((item) => item.section === section.section)?.value;
    if (section.section === 'aiSettings') {
      const fields = ['projectImagePrompt', 'playlistCoverPrompt', 'filmCoverPrompt',
        'podcastCoverPrompt', 'travelCoverPrompt', 'hobbyCoverPrompt', 'bookCoverPrompt',
        'booklistCoverPrompt'];
      for (const field of fields) {
        assert.ok(actual[field].includes('{{description}}'), `${field} 应使用图片描述`);
        assert.doesNotMatch(actual[field], /\{\{(?:title|subtitle|excerpt|director|host|author)\}\}/);
      }
      const { storyImagePrompt: _oldStory, ...previous } = section.value;
      const { storyImagePrompt: _newStory, ...current } = actual;
      for (const field of fields) { delete previous[field]; delete current[field]; }
      assert.deepEqual(current, previous, '其余 AI 设置应保留');
    } else assert.deepEqual(actual, section.value, `${section.section} 其余设置应保留`);
  }
  const media = (state) => new Set(JSON.stringify(state).match(/\/api\/media\/[a-f0-9-]+\.(?:png|jpg|gif|webp|mp3|wav)/g) ?? []);
  for (const url of media({ ...original, sections: expectedSections })) assert.ok(media(migrated).has(url), `迁移后缺少素材引用 ${url}`);
  for (const collection of ['sections', 'entries'])
    assert.ok(migrated.entries.filter((item) => item.section === 'investing' &&
      item.collection === collection).length >= original.entries.filter((item) =>
      item.section === 'investing' && item.collection === collection).length,
    `迁移不能删除已有投资${collection}`);
  const testDb = new pg.Client({ connectionString: testUrl.toString() });
  await testDb.connect();
  try {
    assert.equal((await testDb.query("SELECT count(*)::int AS n FROM cms_sections WHERE section IN ('pageSettings','copy')")).rows[0].n, 0, '迁移和初始化不能恢复已删除配置');
    assert.equal((await testDb.query("SELECT to_regclass('public.cms_section_parts')")).rows[0].to_regclass, null);
    const backfill = '2026-01-01T00:00:00.000Z';
    for (const item of historicalArticles) {
      const date = (await testDb.query('SELECT created_at FROM articles WHERE slug=$1', [item.slug])).rows[0].created_at;
      assert.equal(date.toISOString(), item.created_at?.toISOString() ?? backfill);
    }
    for (const item of historicalEntries) {
      const date = (await testDb.query('SELECT created_at FROM cms_entries WHERE section=$1 AND collection=$2 AND id=$3',
        [item.section, item.collection, item.id])).rows[0].created_at;
      assert.equal(date.toISOString(), item.created_at?.toISOString() ?? backfill);
    }
    const firstSettings = (await testDb.query("SELECT value,revision,updated_at FROM cms_sections WHERE section='aiSettings'")).rows;
    await testDb.query(await readFile(resolve('db/migrations/0013_creation_dates_and_story_images.sql'), 'utf8'));
    await testDb.query(await readFile(resolve('db/migrations/0014_description_driven_images.sql'), 'utf8'));
    await testDb.query(await readFile(resolve('db/migrations/0015_booklist_cover_description.sql'), 'utf8'));
    assert.deepEqual((await testDb.query("SELECT value,revision,updated_at FROM cms_sections WHERE section='aiSettings'")).rows,
      firstSettings, '重复执行迁移不得修改提示词、版本或更新时间');
    assert.deepEqual(await snapshot(), migrated, '迁移重复执行不得修改内容或其他时间');
    await testDb.query(`UPDATE cms_sections SET value = jsonb_set(jsonb_set(value, '{filmCoverPrompt}',
      to_jsonb('自定义胶片光影。电影：{{title}}。导演：{{director}}。风格：{{style}}。'::text)),
      '{booklistCoverPrompt}', to_jsonb('自定义书单插画。名称：{{title}}。简介：{{excerpt}}。'::text))
      WHERE section = 'aiSettings'`);
    await testDb.query(await readFile(resolve('db/migrations/0014_description_driven_images.sql'), 'utf8'));
    await testDb.query(await readFile(resolve('db/migrations/0015_booklist_cover_description.sql'), 'utf8'));
    const customSettings = (await testDb.query("SELECT value,revision,updated_at FROM cms_sections WHERE section='aiSettings'")).rows;
    assert.ok(customSettings[0].value.filmCoverPrompt.startsWith('自定义胶片光影。'));
    assert.ok(customSettings[0].value.filmCoverPrompt.includes('{{description}}'));
    assert.doesNotMatch(customSettings[0].value.filmCoverPrompt, /\{\{(?:title|director)\}\}/);
    assert.ok(customSettings[0].value.booklistCoverPrompt.startsWith('自定义书单插画。'));
    assert.ok(customSettings[0].value.booklistCoverPrompt.includes('{{description}}'));
    assert.doesNotMatch(customSettings[0].value.booklistCoverPrompt, /\{\{(?:title|excerpt)\}\}/);
    await testDb.query(await readFile(resolve('db/migrations/0014_description_driven_images.sql'), 'utf8'));
    await testDb.query(await readFile(resolve('db/migrations/0015_booklist_cover_description.sql'), 'utf8'));
    assert.deepEqual((await testDb.query("SELECT value,revision,updated_at FROM cms_sections WHERE section='aiSettings'")).rows,
      customSettings, '自定义提示词转换后重复执行不得修改');
    console.log('PASS historical creation-time backfill, preserved timestamps/content and idempotent image prompt migrations');
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
  const playlistBase = '/api/admin/records/tracks/playlists';
  const playlist = { id: `playlist-${crypto.randomUUID().slice(0, 8)}`, title: '旧颜色歌单',
    description: '', cover: '', coverDescription: '', coverMode: 'upload', coverGeneratedFor: '',
    songs: [], _published: false, color: '#123456' };
  const playlistCreated = await request(playlistBase, 'POST', { value: playlist });
  assert.equal(playlistCreated.status, 200, JSON.stringify(playlistCreated.data));
  assert.equal(Object.hasOwn(playlistCreated.data.value, 'color'), false);
  const playlistPath = `${playlistBase}/${playlist.id}`;
  const playlistEdited = await request(playlistPath, 'PUT', { value: { ...playlistCreated.data.value,
    color: '#abcdef', description: '编辑后仍不保存颜色' }, revision: 1 });
  assert.equal(playlistEdited.status, 200, JSON.stringify(playlistEdited.data));
  assert.equal(Object.hasOwn(playlistEdited.data.value, 'color'), false);
  assert.equal((await request(playlistPath, 'DELETE', { revision: 2 })).status, 200);
  const skillCategoryBase = '/api/admin/records/ai/skillCategories';
  const skillBase = '/api/admin/records/ai/skills';
  const skillParent = { id: `skill-parent-${crypto.randomUUID().slice(0, 8)}`, name: '测试父类', parentId: '' };
  const skillChild = { id: `skill-child-${crypto.randomUUID().slice(0, 8)}`, name: '测试子类', parentId: skillParent.id };
  const skillCategoryPath = (item) => `${skillCategoryBase}/${item.id}`;
  assert.equal((await request(skillCategoryBase, 'POST', { value: skillParent })).status, 200);
  assert.equal((await request(skillCategoryBase, 'POST', { value: skillChild })).status, 200);
  assert.equal((await request(skillCategoryBase, 'POST', { value: { ...skillChild,
    id: `third-${crypto.randomUUID().slice(0, 8)}`, parentId: skillChild.id } })).status, 400);
  assert.equal((await request(skillCategoryBase, 'POST', { value: { ...skillChild,
    id: `duplicate-${crypto.randomUUID().slice(0, 8)}` } })).status, 400);
  assert.equal((await request(skillCategoryPath(skillParent), 'PUT', { value: { ...skillParent, parentId: skillChild.id }, revision: 1 })).status, 400);
  assert.equal((await request(skillCategoryPath(skillParent), 'DELETE', { revision: 1 })).status, 400);
  const skill = { ...defaults.ai.skills[0], id: `test-skill-${crypto.randomUUID().slice(0, 8)}`,
    name: 'test-skill', title: '测试技能', categoryId: skillChild.id, _published: false };
  assert.equal((await request(skillBase, 'POST', { value: { ...skill, categoryId: '' } })).status, 400);
  assert.equal((await request(skillBase, 'POST', { value: { ...skill, categoryId: 'missing' } })).status, 400);
  assert.equal((await request(skillBase, 'POST', { value: skill })).status, 200);
  assert.equal((await request(skillCategoryPath(skillChild), 'DELETE', { revision: 1 })).status, 400);
  const skillDetail = await request(`${skillBase}/${skill.id}`);
  assert.equal((await request(`${skillBase}/${skill.id}`, 'PUT', { value: { ...skillDetail.data.value,
    category: '旧分类', subcategory: '旧子类', categoryId: '' }, revision: skillDetail.data.revision })).status, 200,
    '历史技能带旧字段仍可编辑，并清空分类');
  const savedSkill = await request(`${skillBase}/${skill.id}`);
  assert.equal(savedSkill.data.value.categoryId, '');
  assert.equal(Object.hasOwn(savedSkill.data.value, 'category'), false);
  const movedChild = await request(`${skillCategoryPath(skillChild)}/move`, 'POST', { direction: 1, revision: 1 });
  assert.equal(movedChild.status, 200, JSON.stringify(movedChild.data));
  assert.equal((await request(skillCategoryBase)).data.items[0].id, skillParent.id);
  const childDetail = await request(skillCategoryPath(skillChild));
  assert.equal((await request(skillCategoryPath(skillChild), 'DELETE', { revision: childDetail.data.revision })).status, 200);
  const parentDetail = await request(skillCategoryPath(skillParent));
  assert.equal((await request(skillCategoryPath(skillParent), 'DELETE', { revision: parentDetail.data.revision })).status, 200);
  const skillAfter = await request(`${skillBase}/${skill.id}`);
  assert.equal((await request(`${skillBase}/${skill.id}`, 'DELETE', { revision: skillAfter.data.revision })).status, 200);
  const statusBase = '/api/admin/records/ai/agentStatuses';
  const seededStatuses = (await request('/api/admin/options/ai')).data.agentStatuses;
  assert.deepEqual(seededStatuses.map(({ id, name }) => [id, name]),
    [['active', '已上线'], ['beta', '公测中'], ['coming', '即将推出']]);
  const agentStatus = { id: `test-status-${crypto.randomUUID().slice(0, 8)}`, name: '维护中' };
  assert.equal((await request(statusBase, 'POST', { value: agentStatus })).status, 200);
  assert.equal((await request(statusBase, 'POST', { value: { ...agentStatus,
    id: `duplicate-${crypto.randomUUID().slice(0, 8)}` } })).status, 400);
  const statusPath = `${statusBase}/${agentStatus.id}`;
  assert.equal((await request(statusPath, 'PUT', { value: { ...agentStatus, name: '维护完成' }, revision: 1 })).status, 200);
  assert.equal((await request(`${statusPath}/move`, 'POST', { direction: 1, revision: 2 })).status, 200);
  const orderedStatuses = (await request('/api/admin/options/ai')).data.agentStatuses;
  assert.equal(orderedStatuses[1].name, '维护完成');
  const agentWithStatus = { ...defaults.ai.agents[0], id: `test-agent-${crypto.randomUUID().slice(0, 8)}`,
    name: '状态验证智能体', status: agentStatus.id };
  const agentBase = '/api/admin/records/ai/agents';
  assert.equal((await request(agentBase, 'POST', { value: { ...agentWithStatus, status: '' } })).status, 400);
  assert.equal((await request(agentBase, 'POST', { value: agentWithStatus })).status, 200);
  const aiPage = await (await fetch(`${origin}/ai`)).text();
  assert.ok(aiPage.includes('状态验证智能体') && aiPage.includes('维护完成'),
    '前台应接收智能体及其自定义状态名称');
  assert.equal((await request(statusPath, 'DELETE', { revision: 3 })).status, 400);
  assert.equal((await request(`${agentBase}/${agentWithStatus.id}`, 'DELETE', { revision: 1 })).status, 200);
  assert.equal((await request(statusPath, 'DELETE', { revision: 3 })).status, 200);
  const positions = async (table, filter = '') => {
    const db = new pg.Client({ connectionString: testUrl.toString() });
    await db.connect();
    try {
      return (await db.query(`SELECT id,position,revision,${table === 'article_categories' ? 'null::timestamptz AS updated_at' : 'updated_at'} FROM ${table} ${filter} ORDER BY position,id`)).rows;
    } finally { await db.end(); }
  };
  const originalSlides = await positions('cms_entries', "WHERE section='slides' AND collection='root'");
  const slide = { ...defaults.slides[0], id: `granular-slide-${crypto.randomUUID().slice(0, 8)}`,
    title: '逐条测试封面 A', alt: '山间晨雾' };
  const newerSlide = { ...slide, id: `granular-slide-${crypto.randomUUID().slice(0, 8)}`,
    title: '逐条测试封面 B' };
  const slideCreated = await request('/api/admin/records/slides/root', 'POST', { value: slide });
  assert.equal(slideCreated.status, 200, JSON.stringify(slideCreated.data));
  assert.equal((await request('/api/admin/records/slides/root', 'POST', { value: newerSlide })).status, 200);
  const slideList = await request('/api/admin/records/slides/root');
  const savedSlide = slideList.data.items.find((item) => item.id === slide.id);
  assert.equal(savedSlide?.title, slide.title);
  assert.equal(savedSlide?.excerpt, slide.alt);
  assert.deepEqual(slideList.data.items.slice(0, 2).map(({ id }) => id), [newerSlide.id, slide.id]);
  const slidePage = await request('/api/admin/records/slides/root?size=1&page=2');
  assert.equal(slidePage.data.items[0].id, slide.id);
  const shiftedSlides = await positions('cms_entries', "WHERE section='slides' AND collection='root'");
  assert.deepEqual(shiftedSlides.slice(2).map(({ id, position, revision, updated_at }) =>
    [id, position, revision, updated_at]), originalSlides.map(({ id, position, revision, updated_at }) =>
    [id, position + 2, revision, updated_at]));
  const notesHtml = await (await fetch(`${origin}/notes`)).text();
  assert.ok(notesHtml.indexOf('切换到逐条测试封面 B') < notesHtml.indexOf('切换到逐条测试封面 A'),
    '前台封面应与后台位置顺序一致');
  assert.equal((await request(`/api/admin/records/slides/root/${newerSlide.id}/move`, 'POST',
    { direction: 1, revision: 1 })).status, 200);
  assert.deepEqual((await request('/api/admin/records/slides/root')).data.items.slice(0, 2).map(({ id }) => id),
    [slide.id, newerSlide.id]);
  const categories = await request('/api/admin/options/writing');
  const categoryId = categories.data.categories[0].id;
  const originalCategories = await positions('article_categories');
  const newCategory = { id: `granular-category-${crypto.randomUUID().slice(0, 8)}`,
    name: '逐条测试分类', description: '', parentId: '' };
  const newerCategory = { ...newCategory, id: `granular-category-${crypto.randomUUID().slice(0, 8)}`,
    name: '较新测试分类' };
  const categoryCreated = await request('/api/admin/records/writing/categories', 'POST',
    { value: newCategory });
  assert.equal(categoryCreated.status, 200, JSON.stringify(categoryCreated.data));
  assert.equal((await request('/api/admin/records/writing/categories', 'POST',
    { value: newerCategory })).status, 200);
  assert.deepEqual((await request('/api/admin/records/writing/categories')).data.items.slice(0, 2)
    .map(({ id }) => id), [newerCategory.id, newCategory.id]);
  assert.deepEqual((await request('/api/admin/options/writing')).data.categories.slice(0, 2)
    .map(({ id }) => id), [newerCategory.id, newCategory.id]);
  const shiftedCategories = await positions('article_categories');
  assert.deepEqual(shiftedCategories.slice(2).map(({ id, position, revision }) => [id, position, revision]),
    originalCategories.map(({ id, position, revision }) => [id, position + 2, revision]));
  const duplicateCategory = await request('/api/admin/records/writing/categories', 'POST',
    { value: { ...newCategory, name: '重复标识测试' } });
  assert.notEqual(duplicateCategory.status, 200);
  assert.deepEqual(await positions('article_categories'), shiftedCategories,
    '新增失败时位置顺延必须回滚');
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
  assert.equal((await request('/api/admin/records/writing/articles')).data.items[0].id, article.slug,
    '文章管理继续按创建时间倒序');
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
  assert.equal((await request(`/api/admin/records/writing/categories/${newerCategory.id}`, 'DELETE',
    { revision: 1 })).status, 200);

  const firstStory = { ...defaults.stories[0], id: `granular-story-${crypto.randomUUID().slice(0, 8)}`,
    text: '逐条测试说说', images: [], _published: false };
  const secondStory = { ...firstStory, id: `granular-story-${crypto.randomUUID().slice(0, 8)}`,
    text: '第二条测试说说', date: '2000-01-01T00:00:00+08:00' };
  const storyPath = (story) => `/api/admin/records/stories/root/${story.id}`;
  assert.equal((await request('/api/admin/records/stories/root', 'POST', { value: firstStory })).status, 200);
  assert.equal((await request('/api/admin/records/stories/root', 'POST', { value: secondStory })).status, 200);
  const storyOrder = (await request('/api/admin/records/stories/root')).data.items.map(({ id }) => id);
  assert.ok(storyOrder.indexOf(firstStory.id) < storyOrder.indexOf(secondStory.id),
    '说说继续按内容日期排序，补录过去日期不会置顶');
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

  for (const section of ['bookmarks', 'friends']) {
    const base = `/api/admin/records/${section}/items`;
    const value = { ...defaults[section].items[0], id: `${section}-${crypto.randomUUID().slice(0, 8)}`,
      name: `测试${section}`, url: `https://example.com/${section}`,
      initials: '新', tags: ['首个标签', '第二标签'], _published: false };
    const added = await request(base, 'POST', { value });
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const path = `${base}/${value.id}`;
    const detail = await request(path);
    assert.equal(detail.data.value.initials, '新');
    assert.deepEqual(detail.data.value.tags, ['首个标签', '第二标签']);
    const edited = await request(path, 'PUT', { value: { ...detail.data.value,
      initials: '改', tags: ['第二标签'] }, revision: 1 });
    assert.equal(edited.status, 200, JSON.stringify(edited.data));
    const reopened = await request(path);
    assert.equal(reopened.data.value.initials, '改');
    assert.deepEqual(reopened.data.value.tags, ['第二标签']);
    assert.equal((await request(path, 'DELETE', { revision: 2 })).status, 200);
  }

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
