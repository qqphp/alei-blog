import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { defaults, footerIconOptions } from '../lib/cms-defaults.ts';
import { adminCollections } from '../lib/admin-sections.ts';
import { postgresTool, postgresEnvironment } from './postgres-tools.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const mediaDirectory = await mkdtemp(join(tmpdir(), 'alei-cms-'));
let server;
try {
  await admin.query(`CREATE DATABASE ${dbName} OWNER alei_blog`);
  const backups = (await readdir(resolve('.local/backups'))).filter((name) => name.startsWith('alei-')).sort();
  const archive = resolve('.local/backups', backups.at(-1), 'database.dump');
  const restored = spawnSync(postgresTool('pg_restore'),
    ['--no-owner', '--no-acl', '-d', dbName, archive],
    { encoding: 'utf8', env: postgresEnvironment(testUrl.toString()) });
  assert.equal(restored.status, 0, restored.stderr);
  const snapshot = async () => {
    const db = new pg.Client({ connectionString: testUrl.toString() });
    await db.connect();
    try {
      const articles = await db.query('SELECT slug, position, published, created_at, cover_url, body, updated_at FROM articles ORDER BY slug');
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
    for (const file of ['0016_ai_skill_categories.sql', '0017_remove_playlist_color.sql', '0018_ai_agent_statuses.sql', '0021_writing_cover_description.sql', '0022_remove_project_year.sql'])
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
    assert.deepEqual(after.occurred_at, entry.section === 'projects' && entry.collection === 'items'
      ? null : entry.occurred_at, '项目采用创建时间，其他内容日期保持不变');
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
      if (entry.section === 'projects' && entry.collection === 'items') {
        delete expected.year;
        delete expected.createdAt;
        delete expected.updatedAt;
      }
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
      const fields = ['coverPrompt', 'projectImagePrompt', 'playlistCoverPrompt', 'filmCoverPrompt',
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
    } else if (section.section === 'profile') {
      assert.deepEqual(actual, { followTitle: defaults.profile.followTitle, followDescription: defaults.profile.followDescription,
        communityName: '', communityDescription: '', communityQr: '', ...section.value }, '关于资料迁移应保留联系方式、二维码和平台');
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
    assert.equal((await testDb.query("SELECT count(*)::int AS n FROM articles WHERE cover_description <> ''")).rows[0].n, 0, '旧文章图片描述初始化为空');
    assert.equal((await testDb.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='projects' AND collection='items' AND payload ? 'year'")).rows[0].n, 0);
    await testDb.query('BEGIN');
    try {
      const migration = await readFile('db/migrations/0021_writing_cover_description.sql', 'utf8');
      for (const [prompt, expected] of [
        ['自定义 {{title}} / {{excerpt}} / {{style}}', '自定义 {{description}} / {{description}} / {{style}}'],
        ['只有风格 {{style}}', '只有风格 {{style}}\n图片描述：{{description}}'],
        [defaults.aiSettings.coverPrompt, defaults.aiSettings.coverPrompt],
      ]) {
        await testDb.query("UPDATE cms_sections SET value=jsonb_set(value,'{coverPrompt}',to_jsonb($1::text)) WHERE section='aiSettings'", [prompt]);
        const before = (await testDb.query("SELECT revision FROM cms_sections WHERE section='aiSettings'")).rows[0].revision;
        await testDb.query(migration);
        const after = (await testDb.query("SELECT value,revision FROM cms_sections WHERE section='aiSettings'")).rows[0];
        assert.equal(after.value.coverPrompt, expected);
        assert.equal(after.revision, before + (prompt === expected ? 0 : 1));
        await testDb.query(migration);
        assert.equal((await testDb.query("SELECT revision FROM cms_sections WHERE section='aiSettings'")).rows[0].revision, after.revision);
      }
      const existing = (await testDb.query("SELECT id,payload,revision,created_at,updated_at FROM cms_entries WHERE section='projects' AND collection='items' LIMIT 1")).rows[0];
      await testDb.query("UPDATE cms_entries SET payload=payload || '{\"year\":\"1999\"}',search_text='stale 1999' WHERE section='projects' AND collection='items' AND id=$1", [existing.id]);
      const removeYear = await readFile('db/migrations/0022_remove_project_year.sql', 'utf8');
      await testDb.query(removeYear);
      const cleaned = (await testDb.query("SELECT payload,revision,search_text,created_at,updated_at FROM cms_entries WHERE section='projects' AND collection='items' AND id=$1", [existing.id])).rows[0];
      assert.deepEqual(cleaned.payload, existing.payload);
      assert.equal(cleaned.revision, existing.revision + 1);
      assert.deepEqual(cleaned.created_at, existing.created_at);
      assert.deepEqual(cleaned.updated_at, existing.updated_at);
      const { recordFields } = await import('../lib/content-record-fields.mjs');
      assert.equal(cleaned.search_text, recordFields(cleaned.payload).search);
      await testDb.query(removeYear);
      assert.equal((await testDb.query("SELECT revision FROM cms_entries WHERE section='projects' AND collection='items' AND id=$1", [existing.id])).rows[0].revision, cleaned.revision);
    } finally { await testDb.query('ROLLBACK'); }
    console.log('PASS writing description migration, custom prompt conversion, project year removal and migration replay');
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
  const port = 8893;
  const origin = `http://localhost:${port}`;
  server = spawn(process.execPath, [resolve('dist/standalone/server.js')], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, DATABASE_URL: testUrl.toString(), HOST: '127.0.0.1', PORT: String(port),
      CMS_MEDIA_DIRECTORY: mediaDirectory, VINEXT_TRUST_PROXY: '1', CONTACT_MAIL_WORKER_ENABLED: '0' },
  });
  let serverError = '';
  // Drain output so the test server cannot block on a full pipe.
  server.stdout.resume();
  server.stderr.on('data', (data) => { serverError += data.toString().slice(0, 3000); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(serverError || '测试服务启动失败');
    try { if ((await fetch(`${origin}/api/admin/session`)).status === 200) { ready = true; break; } }
    catch { /* Still starting. */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  assert.ok(ready, serverError || '测试服务启动超时');
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
  const markdownFields = ['markdownDiagnosePrompt', 'markdownRepairPrompt', 'markdownPolishPrompt'];
  const aiConfig = await request('/api/admin/config/aiSettings/root');
  assert.equal(aiConfig.status, 200);
  for (const field of markdownFields) assert.equal(typeof aiConfig.data.value[field], 'string');
  const customMarkdownPrompts = Object.fromEntries(markdownFields.map(field => [field, `自定义 ${field} 持久化测试`]));
  const savedAiConfig = await request('/api/admin/config/aiSettings/root', 'PUT', {
    value: { ...aiConfig.data.value, ...customMarkdownPrompts }, revision: aiConfig.data.revision,
  });
  assert.equal(savedAiConfig.status, 200, JSON.stringify(savedAiConfig.data));
  const reloadedAiConfig = await request('/api/admin/config/aiSettings/root');
  assert.deepEqual(reloadedAiConfig.data.value, savedAiConfig.data.value);
  assert.equal(reloadedAiConfig.data.revision, savedAiConfig.data.revision);
  for (const field of markdownFields) assert.equal(reloadedAiConfig.data.value[field], customMarkdownPrompts[field]);
  assert.equal((await request('/api/admin/config/aiSettings/root', 'PUT', {
    value: { ...savedAiConfig.data.value, markdownPolishPrompt: '' }, revision: savedAiConfig.data.revision,
  })).status, 400);
  for (const path of ['/missing/galaxy', '/writing/markdown-ai-missing-article', '/invalid-admin-path']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.ok(html.includes('missing-page') && html.includes('返回博客首页'));
    assert.equal(html.includes('missing-document'), path === '/missing/galaxy');
  }
  console.log('PASS Markdown prompt persistence/readback/validation and both themed 404 entries');
  const legacySiteDb = new pg.Client({ connectionString: testUrl.toString() });
  await legacySiteDb.connect();
  try {
    await legacySiteDb.query("UPDATE cms_sections SET value = value - 'footerLinks' - 'footerSocialLinks' - 'footerMotto' WHERE section = 'site'");
  } finally { await legacySiteDb.end(); }
  const site = await request('/api/admin/config/site/root');
  assert.equal(site.data.value.title, 'ISOLATED_GRANULAR_TEST', '测试服务必须连接独立数据库');
  assert.deepEqual(site.data.value.footerLinks, site.data.value.links, '旧配置页脚导航应继承当前主导航');
  assert.deepEqual(site.data.value.footerSocialLinks, []);
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
  const homeBeforeFooter = await request('/api/admin/config/home/root');
  const footerValue = { ...savedNavigation.data.value,
    footerLinks: [{ name: '页脚项目', href: '/projects' }, { name: '页脚写作', href: '/writing' }],
    footerSocialLinks: footerIconOptions.map(({ id: icon }) =>
      ({ name: `社交${icon}`, icon, href: `https://example.com/${icon}` })),
    footerMotto: '页脚短句持久化测试' };
  const savedFooter = await request('/api/admin/config/site/root', 'PUT', {
    value: footerValue, revision: savedNavigation.data.revision,
  });
  assert.equal(savedFooter.status, 200, JSON.stringify(savedFooter.data));
  for (const key of ['name', 'title', 'links', 'sites', 'life'])
    assert.deepEqual(savedFooter.data.value[key], savedNavigation.data.value[key]);
  assert.deepEqual((await request('/api/admin/config/home/root')).data, homeBeforeFooter.data);
  for (const item of [{ name: '非法地址', icon: 'rss', href: 'javascript:alert(1)' },
    { name: '非法图标', icon: 'unknown', href: '/about' }, { name: '空地址', icon: 'rss', href: '' }]) {
    assert.equal((await request('/api/admin/config/site/root', 'PUT', {
      value: { ...footerValue, footerSocialLinks: [item] }, revision: savedFooter.data.revision,
    })).status, 400);
  }
  assert.equal((await request('/api/admin/config/site/root', 'PUT', {
    value: footerValue, revision: savedNavigation.data.revision,
  })).status, 409, '旧版本不能覆盖页脚');
  const footerHtml = await (await fetch(origin + '/projects')).text();
  assert.ok(footerHtml.includes('页脚短句持久化测试'));
  assert.ok(footerHtml.indexOf('页脚项目') < footerHtml.indexOf('页脚写作'));
  for (const item of footerValue.footerSocialLinks) {
    const link = footerHtml.match(new RegExp(`<a\\b[^>]*aria-label="${item.name}"[^>]*>`))?.[0];
    assert.ok(link, `前台缺少 ${item.icon} 社交入口`);
    assert.ok(link.includes('target="_blank"'));
    assert.ok(link.includes('rel="noopener noreferrer"'));
  }
  const clearedFooter = await request('/api/admin/config/site/root', 'PUT', {
    value: { ...footerValue, footerLinks: [], footerSocialLinks: [], footerMotto: '' }, revision: savedFooter.data.revision,
  });
  assert.equal(clearedFooter.status, 200);
  const clearedFooterHtml = await (await fetch(origin + '/')).text();
  for (const text of ['页脚项目', '社交github', '页脚短句持久化测试']) assert.ok(!clearedFooterHtml.includes(text));
  const restoredFooter = await request('/api/admin/config/site/root', 'PUT', {
    value: footerValue, revision: clearedFooter.data.revision,
  });
  assert.equal(restoredFooter.status, 200);
  const reloadedSite = await request('/api/admin/config/site/root');
  assert.deepEqual(reloadedSite.data.value, restoredFooter.data.value);
  assert.equal(reloadedSite.data.revision, restoredFooter.data.revision);
  const settingsDb = new pg.Client({ connectionString: testUrl.toString() });
  await settingsDb.connect();
  try {
    const persisted = await settingsDb.query("SELECT value FROM cms_sections WHERE section='site'");
    assert.deepEqual(persisted.rows[0].value, restoredFooter.data.value);
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
  const playlistDb = new pg.Client({ connectionString: testUrl.toString() });
  await playlistDb.connect();
  try {
    await playlistDb.query("DELETE FROM cms_entries WHERE section='tracks' AND collection='items'");
  } finally { await playlistDb.end(); }
  const playlist = { id: `playlist-${crypto.randomUUID().slice(0, 8)}`, title: '旧颜色歌单',
    description: '', cover: '', coverDescription: '', coverMode: 'upload', coverGeneratedFor: '',
    songs: [{ title: '独立歌曲', artist: '独立作者' }], _published: false, color: '#123456' };
  const playlistCreated = await request(playlistBase, 'POST', { value: playlist });
  assert.equal(playlistCreated.status, 200, JSON.stringify(playlistCreated.data));
  assert.equal(Object.hasOwn(playlistCreated.data.value, 'color'), false);
  const playlistPath = `${playlistBase}/${playlist.id}`;
  assert.deepEqual((await request(playlistPath)).data.value.songs, playlist.songs,
    '没有内容歌曲时也能新增并读取独立歌单');
  const editedSongs = [{ title: '另一首歌曲', artist: '' }, ...playlist.songs];
  const playlistEdited = await request(playlistPath, 'PUT', { value: { ...playlistCreated.data.value,
    songs: editedSongs, color: '#abcdef', description: '编辑后仍不保存颜色' }, revision: 1 });
  assert.equal(playlistEdited.status, 200, JSON.stringify(playlistEdited.data));
  assert.equal(Object.hasOwn(playlistEdited.data.value, 'color'), false);
  assert.deepEqual((await request(playlistPath)).data.value.songs, editedSongs);
  assert.equal((await request(playlistPath, 'PUT', { value: { ...playlistEdited.data.value,
    songs: ['非法字符串歌曲'] }, revision: 2 })).status, 400, '继续拒绝错误歌曲结构');
  const trackBase = '/api/admin/records/tracks/items';
  const trackOptions = (await request('/api/admin/options/tracks')).data;
  const independentTrack = { ...defaults.tracks.items[0], id: `track-${crypto.randomUUID().slice(0, 8)}`,
    title: '独立歌曲', artist: '内容作者', moodId: trackOptions.scenes[0].id, _published: false };
  const trackCreated = await request(trackBase, 'POST', { value: independentTrack });
  assert.equal(trackCreated.status, 200, JSON.stringify(trackCreated.data));
  const independentTrackPath = `${trackBase}/${independentTrack.id}`;
  const trackEdited = await request(independentTrackPath, 'PUT', {
    value: { ...trackCreated.data.value, title: '修改内容歌曲', artist: '修改内容作者' }, revision: 1 });
  assert.equal(trackEdited.status, 200, JSON.stringify(trackEdited.data));
  assert.deepEqual((await request(playlistPath)).data.value.songs, editedSongs,
    '修改内容歌曲不应改变歌单');
  assert.equal((await request(independentTrackPath, 'DELETE', { revision: 2 })).status, 200);
  assert.deepEqual((await request(playlistPath)).data.value.songs, editedSongs,
    '删除内容歌曲不应改变歌单');
  console.log('PASS independent playlist create/edit/readback with no tracks and unchanged songs after track edits/deletion');
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
  const skillSummary = (await request(`${skillBase}?q=${encodeURIComponent(skill.name)}`)).data.items.find((item) => item.id === skill.id);
  assert.equal(skillSummary?.title, skill.name, '技能列表显示名称而非标题');
  assert.equal(skillSummary?.excerpt, skill.href);
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
  const agentSummary = (await request(`${agentBase}?q=${encodeURIComponent(agentWithStatus.name)}`)).data.items.find((item) => item.id === agentWithStatus.id);
  assert.equal(agentSummary?.title, agentWithStatus.name);
  assert.equal(agentSummary?.excerpt, agentWithStatus.href);
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
    coverDescription: '测试文章封面描述', coverGeneratedFor: '', categoryId: newCategory.id, category: newCategory.name,
    _published: false };
  const created = await request('/api/admin/records/writing/articles', 'POST', { value: article });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal((await request('/api/admin/records/writing/articles')).data.items[0].id, article.slug,
    '文章管理继续按创建时间倒序');
  const articlePath = `/api/admin/records/writing/articles/${article.slug}`;
  assert.equal((await request(articlePath)).data.value.coverDescription, article.coverDescription);
  const invalidDescription = await request(articlePath, 'PUT', { value: { ...article, coverDescription: '图'.repeat(5001) }, revision: 1 });
  assert.equal(invalidDescription.status, 400);
  const categoryInUse = await request(newCategoryPath, 'DELETE', { revision: 2 });
  assert.equal(categoryInUse.status, 400);
  const noCover = await request(articlePath, 'PATCH', { published: true, revision: 1 });
  assert.equal(noCover.status, 400);
  const updated = await request(articlePath, 'PUT', { value: { ...article, title: '逐条测试文章已编辑', coverDescription: '已编辑的图片描述' }, revision: 1 });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal((await request(articlePath)).data.value.coverDescription, '已编辑的图片描述');
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
    title: '逐条测试项目', subtitle: '列表项目副标题', _published: false };
  const projectCreated = await request('/api/admin/records/projects/items', 'POST', { value: project });
  assert.equal(projectCreated.status, 200, JSON.stringify(projectCreated.data));
  const projectSummary = (await request(`/api/admin/records/projects/items?q=${encodeURIComponent(project.title)}`)).data.items.find((item) => item.id === project.id);
  assert.equal(projectSummary?.title, project.title);
  assert.equal(projectSummary?.excerpt, project.subtitle);
  assert.equal((await request(`/api/admin/records/projects/items/${project.id}`, 'DELETE',
    { revision: 1 })).status, 200);

  const bookBase = '/api/admin/records/books/items';
  const bookCategories = (await request('/api/admin/options/books')).data.categories;
  const book = { ...defaults.books.items[0], id: `list-book-${crypto.randomUUID().slice(0, 8)}`,
    title: '列表测试书籍', author: '列表书籍作者', categoryId: bookCategories[0].id, _published: false };
  const addedBook = await request(bookBase, 'POST', { value: book });
  assert.equal(addedBook.status, 200, JSON.stringify(addedBook.data));
  const bookSummary = (await request(`${bookBase}?q=${encodeURIComponent(book.title)}`)).data.items.find((item) => item.id === book.id);
  assert.equal(bookSummary?.title, book.title);
  assert.equal(bookSummary?.excerpt, book.author);
  assert.equal((await request(`${bookBase}/${book.id}`, 'PUT', {
    value: { ...addedBook.data.value, author: '' }, revision: 1 })).status, 200);
  const emptyBookSummary = (await request(`${bookBase}?q=${encodeURIComponent(book.title)}`)).data.items.find((item) => item.id === book.id);
  assert.equal(emptyBookSummary?.excerpt, '');
  assert.equal((await request(`${bookBase}/${book.id}`, 'DELETE', { revision: 2 })).status, 200);

  const investmentBase = '/api/admin/records/investing/entries';
  const investmentSections = (await request('/api/admin/options/investing')).data.sections;
  const investment = { ...defaults.investing.sections[0].entries[0],
    id: `list-investment-${crypto.randomUUID().slice(0, 8)}`, title: '列表测试投资',
    description: '列表投资说明', sectionId: investmentSections[0].id, _published: false };
  const addedInvestment = await request(investmentBase, 'POST', { value: investment });
  assert.equal(addedInvestment.status, 200, JSON.stringify(addedInvestment.data));
  const investmentSummary = (await request(`${investmentBase}?q=${encodeURIComponent(investment.title)}`)).data.items.find((item) => item.id === investment.id);
  assert.equal(investmentSummary?.title, investment.title);
  assert.equal(investmentSummary?.excerpt, investment.description);
  assert.equal((await request(`${investmentBase}/${investment.id}`, 'DELETE', { revision: 1 })).status, 200);

  const relayBase = '/api/admin/records/ai/relays';
  const relay = { ...defaults.ai.relays[0], id: `list-relay-${crypto.randomUUID().slice(0, 8)}`,
    name: '列表测试中转站', href: 'https://example.com/relay-summary', _published: false };
  const addedRelay = await request(relayBase, 'POST', { value: relay });
  assert.equal(addedRelay.status, 200, JSON.stringify(addedRelay.data));
  const relaySummary = (await request(`${relayBase}?q=${encodeURIComponent(relay.name)}`)).data.items.find((item) => item.id === relay.id);
  assert.equal(relaySummary?.title, relay.name);
  assert.equal(relaySummary?.excerpt, relay.href);
  assert.equal((await request(`${relayBase}/${relay.id}`, 'DELETE', { revision: 1 })).status, 200);

  for (const [section, field, subtitle] of [
    ['tracks', 'artist', '列表音乐作者'], ['films', 'director', '列表电影导演'],
    ['podcasts', 'host', '列表专辑主播'], ['travel', 'description', '列表旅行说明'],
    ['hobbies', 'description', '列表爱好说明'],
  ]) {
    const base = `/api/admin/records/${section}/items`;
    const options = (await request(`/api/admin/options/${section}`)).data;
    const value = { ...defaults[section].items[0], id: `${section}-${crypto.randomUUID().slice(0, 8)}`,
      title: `列表字段测试${section}`, [field]: subtitle,
      ...(section === 'tracks' ? { moodId: options.scenes[0].id } : { categoryId: options.categories[0].id }),
      ...(['travel', 'hobbies'].includes(section) ? { body: '不应显示在列表中的正文' } : {}),
      _published: false };
    const created = await request(base, 'POST', { value });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const list = await request(`${base}?q=${encodeURIComponent(value.title)}`);
    const summary = list.data.items.find((item) => item.id === value.id);
    assert.equal(summary?.title, value.title);
    assert.equal(summary?.excerpt, subtitle);
    if ('body' in value) assert.equal(JSON.stringify(summary).includes(value.body), false);
    let revision = 1;
    if (section === 'hobbies') {
      const updated = await request(`${base}/${value.id}`, 'PUT', {
        value: { ...created.data.value, description: '' }, revision });
      assert.equal(updated.status, 200, JSON.stringify(updated.data));
      revision++;
      const empty = await request(`${base}?q=${encodeURIComponent(value.title)}`);
      assert.equal(empty.data.items.find((item) => item.id === value.id)?.excerpt, '');
    }
    assert.equal((await request(`${base}/${value.id}`, 'DELETE', { revision })).status, 200);
  }

  for (const section of ['bookmarks', 'friends']) {
    const base = `/api/admin/records/${section}/items`;
    const value = { ...defaults[section].items[0], id: `${section}-${crypto.randomUUID().slice(0, 8)}`,
      name: `测试${section}`, url: `https://example.com/${section}`,
      initials: '新', tags: ['首个标签', '第二标签'], _published: false };
    const added = await request(base, 'POST', { value });
    assert.equal(added.status, 200, JSON.stringify(added.data));
    const summary = (await request(`${base}?q=${encodeURIComponent(value.name)}`)).data.items.find((item) => item.id === value.id);
    assert.equal(summary?.title, value.name);
    assert.equal(summary?.excerpt, value.url);
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
  const legacyHomeDb = new pg.Client({ connectionString: testUrl.toString() });
  await legacyHomeDb.connect();
  try {
    await legacyHomeDb.query("UPDATE cms_sections SET value = value - 'nowBuilding' - 'nowWriting' - 'nowExploring' - 'heroArtTopText' - 'heroArtBottomText' - 'noteArtText' WHERE section = 'home'");
  } finally { await legacyHomeDb.end(); }
  const page = await request('/api/admin/config/home/root');
  for (const field of ['nowBuilding', 'nowWriting', 'nowExploring'])
    assert.equal(page.data.value[field], '', '旧首页配置应合并空近况默认值');
  for (const field of ['heroArtTopText', 'heroArtBottomText', 'noteArtText'])
    assert.equal(page.data.value[field], defaults.home[field]);
  assert.ok(!(await (await fetch(origin + '/')).text()).includes('aria-label="当前近况"'));
  const pageSaved = await request('/api/admin/config/home/root', 'PUT',
    { value: { ...page.data.value, title: '网站设置首页持久化测试', nowBuilding: '开发近况持久化测试',
      nowWriting: '写作近况持久化测试', nowExploring: '探索近况持久化测试',
      heroArtTopText: 'Custom\nBuild', heroArtBottomText: 'Custom\nTomorrow', noteArtText: 'Custom\nArticles' }, revision: page.data.revision });
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
  for (const text of ['网站设置持久化测试', '网站设置页脚测试', '导航持久化测试', '网站设置首页持久化测试',
    '开发近况持久化测试', '写作近况持久化测试', '探索近况持久化测试'])
    assert.ok(homeHtml.includes(text), `前台应读取实际保存的${text}`);
  const partialNow = await request('/api/admin/config/home/root', 'PUT', {
    value: { ...reloadedHome.data.value, nowWriting: '', nowExploring: '   ' }, revision: reloadedHome.data.revision,
  });
  assert.equal(partialNow.status, 200);
  const partialHtml = await (await fetch(origin + '/')).text();
  assert.ok(partialHtml.includes('开发近况持久化测试'));
  assert.ok(!partialHtml.includes('写作近况持久化测试'));
  const clearedNow = await request('/api/admin/config/home/root', 'PUT', {
    value: { ...partialNow.data.value, nowBuilding: '', nowWriting: '', nowExploring: '',
      heroArtTopText: '', heroArtBottomText: '  ', noteArtText: '' }, revision: partialNow.data.revision,
  });
  assert.equal(clearedNow.status, 200);
  assert.equal((await request('/api/admin/config/home/root')).data.value.nowBuilding, '');
  assert.ok(!(await (await fetch(origin + '/')).text()).includes('aria-label="当前近况"'));
  const clearedArtHtml = await (await fetch(origin + '/')).text();
  for (const className of ['home-art-top', 'home-art-bottom', 'home-art-handwriting'])
    assert.ok(!clearedArtHtml.includes(`class="${className}`), '清空后不渲染英文装饰');
  assert.deepEqual((await request('/api/admin/config/site/root')).data, reloadedSite.data);
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
  const emptyHomeDb = new pg.Client({ connectionString: testUrl.toString() });
  await emptyHomeDb.connect();
  try {
    await emptyHomeDb.query('UPDATE articles SET published = false');
    await emptyHomeDb.query("UPDATE cms_entries SET published = false WHERE section = 'projects' AND collection = 'items'");
    const emptyHtml = await (await fetch(origin + '/')).text();
    assert.ok(emptyHtml.includes('还没有已发布的文章。'));
    assert.ok(emptyHtml.includes('还没有已发布的项目。'));
    const article = (await emptyHomeDb.query('SELECT slug FROM articles ORDER BY created_at DESC, slug LIMIT 1')).rows[0];
    await emptyHomeDb.query("UPDATE articles SET published = true, cover_url = '' WHERE slug = $1", [article.slug]);
    const project = (await emptyHomeDb.query("SELECT id FROM cms_entries WHERE section = 'projects' AND collection = 'items' ORDER BY created_at DESC, position, id LIMIT 1")).rows[0];
    await emptyHomeDb.query("UPDATE cms_entries SET published = true, payload = jsonb_set(payload, '{images}', '[]'::jsonb) WHERE section = 'projects' AND collection = 'items' AND id = $1", [project.id]);
    const singleHtml = await (await fetch(origin + '/')).text();
    assert.equal((singleHtml.match(/class="home-article home-article-featured"/g) ?? []).length, 1);
    assert.equal((singleHtml.match(/class="home-project-card"/g) ?? []).length, 1);
    assert.equal((singleHtml.match(/class="home-cover-placeholder"/g) ?? []).length, 2);
    assert.ok(singleHtml.includes(`/writing/${article.slug}`));
    assert.ok(singleHtml.includes(`/projects?project=${project.id}`));
  } finally { await emptyHomeDb.end(); }
  console.log('PASS homepage legacy config, Now persistence/clearing, empty collections and missing covers');
  console.log('PASS isolated PostgreSQL record lists, detail, single-record writes, conflicts, publication, move, delete, category references, config scopes and 1000-row pagination');
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((done) => { server.once('exit', done); setTimeout(done, 3000); });
  }
  await rm(mediaDirectory, { recursive: true, force: true });
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
