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
  assert.equal((await db.query('SELECT count(*)::int AS n FROM articles WHERE created_at IS NULL')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cms_entries WHERE created_at IS NULL')).rows[0].n, 0);
  assert.equal((await db.query('SELECT created_at FROM articles LIMIT 1')).rows[0].created_at.toISOString(),
    '2026-01-01T00:00:00.000Z');
  const seedSnapshot = (await db.query('SELECT section,collection,id,position,payload FROM cms_entries ORDER BY section,collection,id')).rows;
  run(['--import', 'tsx', 'scripts/seed-missing-sections.mjs']);
  assert.deepEqual((await db.query('SELECT section,collection,id,position,payload FROM cms_entries ORDER BY section,collection,id')).rows, seedSnapshot);
  console.log('PASS fresh migrations, complete investment seed and repeated seed');

  await db.query('TRUNCATE cms_sections,cms_entries,articles,article_categories,aa_language_model_snapshots,api_integration_keys CASCADE');
  run(['scripts/import-d1.mjs']);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM articles WHERE created_at IS NULL')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cms_entries WHERE created_at IS NULL')).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='projects' AND collection='items' AND payload ? 'year'")).rows[0].n, 0, '旧数据导入不能恢复项目年份');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM articles WHERE cover_description IS NULL')).rows[0].n, 0);
  const writingPrompt = (await db.query("SELECT value->>'coverPrompt' AS prompt FROM cms_sections WHERE section='aiSettings'")).rows[0]?.prompt;
  assert.ok(writingPrompt?.includes('{{description}}'));
  assert.doesNotMatch(writingPrompt, /\{\{(?:title|excerpt)\}\}/);
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
  const attachmentKey = `${crypto.randomUUID()}.file`;
  await saveLocalMedia(attachmentKey, Buffer.from('附件正文'), { contentType: 'application/octet-stream', name: '回归测试附件.txt' });
  const article = { ...defaults.writing[0], cover: '', _published: false, body: `正文图片 ![图](${url})\n\n[附件](/api/media/${attachmentKey})` };
  for (const slug of ['audit-media-one', 'audit-media-two'])
    await createAdminRecord('writing', 'articles', { ...article, slug });
  await deleteAdminRecord({ section: 'writing', collection: 'articles', id: 'audit-media-one' }, 1);
  assert.equal((await readLocalMedia(key, new Headers())).status, 200, '仍被另一正文引用时不能删除');
  assert.equal((await readLocalMedia(attachmentKey, new Headers())).status, 200, '仍被另一正文引用时不能删除附件');
  await deleteAdminRecord({ section: 'writing', collection: 'articles', id: 'audit-media-two' }, 1);
  assert.equal((await readLocalMedia(key, new Headers())).status, 404, '最后一篇正文删除后清理素材');
  assert.equal((await readLocalMedia(attachmentKey, new Headers())).status, 404, '最后一篇正文删除后清理附件');
  console.log('PASS Markdown media cleanup and shared-reference retention');

  const waitForBlockedWriter = async () => {
    for (let i = 0; i < 100; i++) {
      const count = (await db.query("SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=$1 AND l.locktype='advisory' AND NOT l.granted", [dbName])).rows[0].n;
      if (count) return;
      await new Promise((done) => setTimeout(done,20));
    }
    throw new Error('Expected a writer waiting for the media lock');
  };
  const raceKey = `${crypto.randomUUID()}.png`;
  const raceUrl = `/api/media/${raceKey}`;
  await saveLocalMedia(raceKey, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB','base64'), {contentType:'image/png',name:'并发测试'});
  await createAdminRecord('writing','articles',{...article,slug:'audit-race-source',body:raceUrl});
  let mediaChecked;
  const checked = new Promise((done)=>{mediaChecked=done;});
  const cleanupGate = new Promise((done)=>{releaseWrite=done;});
  let heldCleanup = false;
  pg.Client.prototype.query = function (sql,values,...rest) {
    const result = originalQuery.call(this,sql,values,...rest);
    if (!heldCleanup && String(sql).includes('AS used') && values?.[0]===raceUrl) {
      heldCleanup=true;
      return result.then(async (rows)=>{mediaChecked();await cleanupGate;return rows;});
    }
    return result;
  };
  deleting=deleteAdminRecord({section:'writing',collection:'articles',id:'audit-race-source'},1);
  await checked;
  creating=createAdminRecord('slides','root',{...defaults.slides[0],id:'audit-race-slide',src:raceUrl}).catch((error)=>error);
  await waitForBlockedWriter();
  releaseWrite();
  await deleting;
  assert.match(String(await creating),/素材已不存在/,'new references cannot be committed after collection');
  assert.equal(await getAdminRecord({section:'slides',collection:'root',id:'audit-race-slide'}),null);
  pg.Client.prototype.query=originalQuery;

  await saveLocalMedia(raceKey, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB','base64'), {contentType:'image/png',name:'并发测试'});
  await createAdminRecord('writing','articles',{...article,slug:'audit-race-source',body:raceUrl});
  let inserted;
  const written=new Promise((done)=>{inserted=done;});
  const writeGate=new Promise((done)=>{releaseWrite=done;});
  let heldInsert=false;
  pg.Client.prototype.query=function(sql,values,...rest) {
    const result=originalQuery.call(this,sql,values,...rest);
    if(!heldInsert && String(sql).startsWith('INSERT INTO cms_entries') && values?.[2]==='audit-race-slide') {
      heldInsert=true;
      return result.then(async(rows)=>{inserted();await writeGate;return rows;});
    }
    return result;
  };
  creating=createAdminRecord('slides','root',{...defaults.slides[0],id:'audit-race-slide',src:raceUrl});
  await written;
  // A different section must be able to commit while this writer is paused.
  await createAdminRecord('ai','agentStatuses',{id:'audit-parallel-status',name:'跨栏目并发测试'});
  deleting=deleteAdminRecord({section:'writing',collection:'articles',id:'audit-race-source'},1);
  await waitForBlockedWriter();
  releaseWrite();
  await creating; await deleting;
  pg.Client.prototype.query=originalQuery;
  assert.equal((await readLocalMedia(raceKey,new Headers())).status,200,'cleanup must see the concurrently committed reference');
  await deleteAdminRecord({section:'slides',collection:'root',id:'audit-race-slide'},1);
  assert.equal((await readLocalMedia(raceKey,new Headers())).status,404);
  console.log('PASS both media race orders, rejected dangling references and parallel writes across sections');

  const backupClient=new pg.Client({connectionString:testUrl.toString()});
  await backupClient.connect();
  try {
    await backupClient.query("SELECT pg_advisory_lock(hashtext('cms-backup'))");
    creating=createAdminRecord('ai','agentStatuses',{id:'audit-backup-status',name:'备份锁测试'});
    await waitForBlockedWriter();
    await backupClient.query("SELECT pg_advisory_unlock(hashtext('cms-backup'))");
    await creating;
  } finally { await backupClient.end(); }
  console.log('PASS backup exclusive lock still blocks content writers');

  const { publicCollectionSizes }=await import('../lib/public-collections.ts');
  const { getPublicPage,getPublicSection }=await import('../lib/public-records.ts');
  const { recordFields,recordPayload }=await import('../lib/content-record-fields.mjs');
  const { musicSample }=await import('../lib/music-content.ts');
  const { bookSample }=await import('../lib/book-content.ts');
  const { filmSample }=await import('../lib/film-content.ts');
  const { podcastSample }=await import('../lib/podcast-content.ts');
  const { activitySample }=await import('../lib/activity-content.ts');
  const { getPublicPlaybackContent,getWritingArchive,getStoryArchive }=await import('../lib/cms-server.ts');
  for(const [name,size] of Object.entries(publicCollectionSizes)) {
    const [section,collection]=name.split('.');
    const document=defaults[section];
    const templates={tracks:musicSample,books:bookSample,films:filmSample,podcasts:podcastSample,travel:activitySample,hobbies:activitySample};
    const sample=section==='investing' ? document.sections.flatMap((group)=>group.entries)[0] : document[collection][0] ?? templates[section]?.[collection]?.[0];
    const optionCollection=section==='investing'?'sections':name==='ai.skills'?'skillCategories':section==='tracks'?'scenes':'categories';
    const optionId=(await db.query('SELECT id FROM cms_entries WHERE section=$1 AND collection=$2 ORDER BY position LIMIT 1',[section,optionCollection])).rows[0]?.id ?? '';
    await db.query('DELETE FROM cms_entries WHERE section=$1 AND collection=$2',[section,collection]);
    for(let i=0;i<31;i++) {
      const value={...structuredClone(sample),id:`audit-public-${i}`,_published:i<30};
      for(const field of ['name','title','artist','author','director','host']) if(field in value) value[field]=i===29?'needle':`item-${i}`;
      if('categoryId' in value)value.categoryId=optionId;
      if('moodId' in value)value.moodId=optionId;
      if(section==='investing')value.sectionId=optionId;
      const fields=recordFields(value,section);
      await db.query(`INSERT INTO cms_entries(section,collection,id,position,published,title,category_id,status_id,occurred_at,payload,search_text,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,[section,collection,value.id,i,fields.published,fields.title,fields.categoryId,fields.statusId,
          fields.occurredAt,JSON.stringify(recordPayload(value,section,collection)),fields.search,new Date(Date.UTC(2026,0,1,0,0,i))]);
    }
    const first=await getPublicPage(name);
    assert.equal(first.items.length,Math.min(size,30),`${name} initial page is bounded`);
    assert.equal(first.total,30);
    assert.equal(first.allCount,30);
    assert.ok(first.items.every((item)=>item.id!=='audit-public-30' && !Object.hasOwn(item,'_published')));
    const second=await getPublicPage(name,{page:2});
    assert.ok(second.items.every((item)=>!first.items.some((old)=>old.id===item.id)),`${name} pages do not overlap`);
    const last=await getPublicPage(name,{page:10000});
    assert.equal(last.page,Math.ceil(30/size));
    assert.ok(last.items.length>0,`${name} shrunk/out-of-range pages remain usable`);
    if(!['ai','investing','projects'].includes(section)) {
      const search=await getPublicPage(name,{q:'needle'});
      assert.equal(search.total,1,`${name} searches the entire collection`);
      assert.equal(search.items[0].id,'audit-public-29');
    }
    if(optionId && (collection==='items'||name==='ai.skills'||section==='investing'))
      assert.equal((await getPublicPage(name,{category:optionId})).total,30);
  }
  const selectedProject=await getPublicPage('projects.items',{id:'audit-public-0'});
  assert.equal(selectedProject.page,5);
  assert.ok(selectedProject.items.some((item)=>item.id==='audit-public-0'));
  const publicSection=await getPublicSection(['ai','projects','investing','tracks','books','films','podcasts','travel','hobbies','bookmarks','friends']);
  for(const [name,size] of Object.entries(publicCollectionSizes)) {
    const [section,collection]=name.split('.');
    const items=name==='investing.entries' ? publicSection.content.investing.sections.flatMap((group)=>group.entries)
      : publicSection.content[section][collection];
    assert.ok(items.length<=size,`${name} RSC payload is bounded`);
  }
  const recentProjects=await getRecentProjects(2);
  assert.deepEqual(recentProjects.map((item)=>item.id),['audit-public-29','audit-public-28']);
  assert.equal(recentProjects[0].createdAt,'2026-01-01T00:00:29.000Z');
  assert.equal((await getPublicPlaybackContent()).items.length,30,'complete published playback queue remains available');
  const adminPage=await listAdminRecords('projects','items',{...listInput,page:10000});
  assert.equal(adminPage.page,2); assert.equal(adminPage.items.length,11);
  assert.equal((await getWritingArchive('','',10000)).page,Math.max(1,Math.ceil((await getWritingArchive()).total/8)));
  assert.ok((await getStoryArchive(10000)).page>=1);
  const redundant=(await db.query("SELECT indexname FROM pg_indexes WHERE indexname IN ('articles_position_idx','cms_entries_order_idx','cms_entries_admin_order_idx')")).rows;
  assert.equal(redundant.length,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cms_entries WHERE section='projects' AND collection='items' AND (occurred_at IS NOT NULL OR payload ? 'createdAt' OR payload ? 'updatedAt')")).rows[0].n,0);
  console.log('PASS all 15 public collections: database pagination/search/counts/draft filtering, deep links, bounded page payloads, playback queue, canonical project timestamps and reduced indexes');
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
