import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { startLocalMediaStorage } from './local-media-storage.mjs';

register('./ui-test-loader.mjs', import.meta.url);
const sourceUrl = new URL(process.env.DATABASE_URL);
const dbName = `alei_audit_test_${Date.now()}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${dbName}`;
const mediaDirectory = resolve('.local', dbName);
const admin = new pg.Client({ host: sourceUrl.hostname, port: Number(sourceUrl.port),
  user: 'postgres', database: 'postgres',
  password: (await readFile('.local/postgres18/admin-password', 'utf8')).trim() });
await admin.connect();
let db, storage, releaseWrite, creating, deleting;
const originalQuery = Reflect.get(pg.Client.prototype, 'query');
const originalEnvironment = { ...process.env };
const run = (args) => {
  const result = spawnSync(process.execPath, args, { windowsHide: true, encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: testUrl.toString() } });
  assert.equal(result.status, 0, result.stderr);
};

try {
  await admin.query(`CREATE DATABASE ${dbName} OWNER alei_blog`);
  process.env.DATABASE_URL = testUrl.toString();
  run(['scripts/migrate-postgres.mjs']);
  run(['--import', 'tsx', 'scripts/seed-missing-sections.mjs']);
  db = new pg.Client({ connectionString: testUrl.toString() });
  await db.connect();
  const { defaults } = await import('../lib/cms-defaults.ts');
  const expected = defaults.investing.sections.reduce((count, group) => count + group.entries.length, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='investing' AND collection='entries'")).rows[0].n, expected);
  const seedSnapshot = (await db.query('SELECT section,collection,id,position,payload FROM cms_entries ORDER BY section,collection,id')).rows;
  run(['--import', 'tsx', 'scripts/seed-missing-sections.mjs']);
  assert.deepEqual((await db.query('SELECT section,collection,id,position,payload FROM cms_entries ORDER BY section,collection,id')).rows, seedSnapshot);
  console.log('PASS fresh migrations, complete investment seed and repeated seed');

  await db.query('TRUNCATE cms_sections,cms_entries,articles,article_categories,aa_language_model_snapshots,api_integration_keys CASCADE');
  run(['scripts/import-d1.mjs']);
  const imported = (await db.query("SELECT section,collection,id,payload,revision,updated_at FROM cms_entries ORDER BY section,collection,id")).rows;
  assert.ok(imported.length > 0, '使用真实旧 D1 数据验证导入');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_entries WHERE btrim(search_text)='' AND (payload ? 'title' OR payload ? 'name' OR payload ? 'text')")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='tracks' AND collection='items' AND category_id IS DISTINCT FROM payload->>'moodId'")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='projects' AND collection='items' AND status_id IS DISTINCT FROM payload->>'statusId'")).rows[0].n, 0);
  await db.query("UPDATE cms_entries SET search_text='',category_id=NULL,status_id=NULL WHERE section IN ('tracks','projects')");
  await db.query(await readFile('db/migrations/0012_restore_record_query_fields.sql', 'utf8'));
  assert.deepEqual((await db.query('SELECT section,collection,id,payload,revision,updated_at FROM cms_entries ORDER BY section,collection,id')).rows, imported, '回填不能改变内容、版本与历史更新时间');
  run(['--import', 'tsx', 'scripts/seed-missing-sections.mjs']);
  const { createAdminRecord, deleteAdminRecord, getAdminRecord, listAdminRecords, updateAdminRecord } = await import('../lib/admin-records.ts');
  const { getDocuments, getRecentProjects } = await import('../lib/cms-server.ts');
  const listInput = { page: 1, size: 20, q: '', status: 'all', categoryId: '', statusId: '' };
  const slideRow = (await db.query("SELECT id FROM cms_entries WHERE section='slides' AND collection='root' LIMIT 1")).rows[0];
  if (slideRow) {
    const slideKey = { section: 'slides', collection: 'root', id: slideRow.id };
    const slide = await getAdminRecord(slideKey);
    assert.equal(slide.value.id, slideKey.id);
    await updateAdminRecord(slideKey, slide.value, slide.revision);
  }
  for (const [section, field] of [['tracks', 'categoryId'], ['projects', 'statusId']]) {
    const row = (await db.query('SELECT payload,category_id,status_id FROM cms_entries WHERE section=$1 AND collection=$2 LIMIT 1', [section, 'items'])).rows[0];
    if (!row) continue;
    const filtered = await listAdminRecords(section, 'items', { ...listInput,
      [field]: field === 'categoryId' ? row.category_id : row.status_id, q: row.payload.title });
    assert.ok(filtered.items.some((item) => item.id === row.payload.id));
  }
  console.log('PASS actual D1 import, search/scene/status filters and non-destructive query-field repair');

  const optionKey = { section: 'bookmarks', collection: 'categories', id: 'audit-category' };
  await createAdminRecord(optionKey.section, optionKey.collection, { id: optionKey.id, name: '并发检查分类' });
  let categoryRead;
  const validated = new Promise((done) => { categoryRead = done; });
  const gate = new Promise((done) => { releaseWrite = done; });
  let paused = false;
  pg.Client.prototype.query = function (sql, values, ...rest) {
    const result = originalQuery.call(this, sql, values, ...rest);
    if (!paused && String(sql).startsWith('SELECT payload FROM cms_entries') && values?.[0] === 'bookmarks' && values?.[1] === 'categories') {
      paused = true;
      return result.then(async (rows) => { categoryRead(); await gate; return rows; });
    }
    return result;
  };
  creating = createAdminRecord('bookmarks', 'items', { ...defaults.bookmarks.items[0], id: 'audit-bookmark', categoryId: optionKey.id });
  creating.catch(() => undefined);
  await validated;
  deleting = deleteAdminRecord(optionKey, 1).catch((error) => error);
  let waiting = false;
  for (let i = 0; i < 100; i++) {
    waiting = (await db.query("SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=$1 AND l.locktype='advisory' AND NOT l.granted", [dbName])).rows[0].n > 0;
    if (waiting) break;
    await new Promise((done) => setTimeout(done, 20));
  }
  assert.ok(waiting, '删除关联分类必须等待正在保存的同栏目内容');
  releaseWrite();
  await creating;
  assert.match(String(await deleting), /仍被内容使用/);
  pg.Client.prototype.query = originalQuery;
  assert.ok(await getAdminRecord(optionKey));
  console.log('PASS concurrent content creation and option deletion preserve references');

  const project = (await getDocuments(['projects'])).content.projects.items[0];
  for (const [collection, id, name] of [['statuses', project.statusId, '已改名状态'], ['categories', project.categoryId, '已改名分类']]) {
    const key = { section: 'projects', collection, id };
    const current = await getAdminRecord(key);
    await updateAdminRecord(key, { ...current.value, name }, current.revision);
  }
  const homeProject = (await getRecentProjects(100)).find((item) => item.id === project.id);
  assert.equal(homeProject.status, '已改名状态');
  assert.equal(homeProject.category, '已改名分类');
  console.log('PASS homepage project labels resolve current option names');

  process.env.CMS_MEDIA_DIRECTORY = mediaDirectory;
  storage = await startLocalMediaStorage();
  Object.assign(process.env, storage.vars);
  const { saveLocalMedia, readLocalMedia } = await import('../lib/local-media.ts');
  const key = `${crypto.randomUUID()}.png`;
  const url = `/api/media/${key}`;
  await saveLocalMedia(key, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64'), { contentType: 'image/png', name: '回归测试图片' });
  const article = { ...defaults.writing[0], cover: '', _published: false, body: `正文图片 ![图](${url})` };
  for (const slug of ['audit-media-one', 'audit-media-two'])
    await createAdminRecord('writing', 'articles', { ...article, slug });
  await deleteAdminRecord({ section: 'writing', collection: 'articles', id: 'audit-media-one' }, 1);
  assert.equal((await readLocalMedia(key, new Headers())).status, 200, '仍被另一正文引用时不能删除');
  await deleteAdminRecord({ section: 'writing', collection: 'articles', id: 'audit-media-two' }, 1);
  assert.equal((await readLocalMedia(key, new Headers())).status, 404, '最后一篇正文删除后清理素材');
  console.log('PASS Markdown media cleanup and shared-reference retention');
} finally {
  releaseWrite?.();
  await Promise.allSettled([Promise.resolve(creating), Promise.resolve(deleting)]);
  pg.Client.prototype.query = originalQuery;
  if (storage) await storage.close();
  if (db) await db.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
  assert.equal(dirname(mediaDirectory), resolve('.local'));
  await rm(mediaDirectory, { recursive: true, force: true });
}
