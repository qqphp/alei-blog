import type { Client } from 'pg';
import { withDatabase, withReadDatabase } from './postgres';
import { defaults, siteWithFooter, type Section } from './cms-defaults';
import { validateContent } from './cms-validation';
import { adminCollections, configKeys, sectionMetadata, validCollection } from './admin-sections';
import { deleteLocalMedia, readLocalMedia } from './local-media';
import { articleCreationDate, recordTimes } from './content-times';
import { recordFields, recordPayload } from './content-record-fields.mjs';

type Item = Record<string, unknown>;
type RecordKey = { section: Section; collection: string; id: string };
type ListOptions = { page: number; size: number; q: string; status: string; categoryId: string; statusId: string };
export class AdminConflict extends Error {}
export class AdminNotFound extends Error {}

function recordInput(section: Section, collection: string, value: Item, createdAt: string | null) {
  if (section === 'writing' && collection === 'categories') return value;
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = value;
  if (section === 'ai' && collection === 'skills') {
    const skill = { ...fields };
    delete skill.category;
    delete skill.subcategory;
    if (typeof skill.categoryId !== 'string') skill.categoryId = '';
    return skill;
  }
  if (section === 'tracks' && collection === 'playlists') {
    const playlist = { ...fields };
    delete playlist.color;
    return playlist;
  }
  if (section === 'writing' && collection === 'articles')
    return { ...fields, date: articleCreationDate(createdAt ?? '2026-01-01T08:00:00+08:00') };
  return section === 'projects' && collection === 'items' ? { ...fields, createdAt: createdAt ?? '' } : fields;
}

function assertCollection(section: Section, collection: string) {
  if (!validCollection(section, collection)) throw new Error('栏目或列表无效');
}
function itemId(section: Section, collection: string, value: Item) {
  const id = section === 'writing' && collection === 'articles' ? value.slug : value.id;
  if (typeof id !== 'string' || !id.trim() || !/^[a-zA-Z0-9_-]+$/.test(id))
    throw new Error('记录标识无效');
  return id;
}
// Related records and their options must be checked and written in the same order.
async function lockSection(db: Client, section: Section) {
  await db.query("SELECT pg_advisory_xact_lock_shared(hashtext('cms-backup'))");
  await db.query("SELECT pg_advisory_xact_lock_shared(hashtext('cms-media'))");
  await db.query("SELECT pg_advisory_xact_lock(hashtext('cms-records'), hashtext($1))", [section]);
}
function payloadValue(section: Section, collection: string, value: Item) {
  if (section === 'investing' && collection === 'entries') {
    const { sectionId: _sectionId, ...entry } = value;
    return entry;
  }
  if (section === 'investing' && collection === 'sections') {
    const { entries: _entries, ...sectionValue } = value;
    return sectionValue;
  }
  return recordPayload(value,section,collection);
}

export async function listAdminRecords(section: Section, collection: string, input: ListOptions) {
  assertCollection(section, collection);
  const page = Math.max(1, Math.trunc(input.page) || 1);
  const size = Math.min(50, Math.max(1, Math.trunc(input.size) || 20));
  const q = input.q.trim();
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  return withReadDatabase(async (db) => {
    if (section === 'writing' && collection === 'articles') {
      const where = `($1 = '' OR (a.title || ' ' || a.excerpt || ' ' || a.body) ILIKE $2 ESCAPE '\\')
        AND ($3 = 'all' OR a.published = ($3 = 'published'))
        AND ($4 = '' OR a.category_id = $4)`;
      const params = [q, pattern, input.status, input.categoryId];
      const total = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM articles a WHERE ${where}`, params);
      const currentPage = Math.min(page, Math.max(1, Math.ceil(total.rows[0].count / size)));
      const rows = await db.query(`SELECT a.slug AS id, a.title, a.excerpt, a.category_id AS "categoryId",
        c.name AS category, a.published, to_char(a.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY.MM.DD') AS date,
        a.position, a.revision, a.created_at AS "createdAt", a.updated_at AS "updatedAt" FROM articles a JOIN article_categories c ON c.id = a.category_id
        WHERE ${where} ORDER BY a.created_at DESC, a.slug LIMIT $5 OFFSET $6`,
      [...params, size, (currentPage - 1) * size]);
      return { items: rows.rows.map((row) => ({ ...row, ...recordTimes(row) })), total: total.rows[0].count, page: currentPage, size };
    }
    if (section === 'writing' && collection === 'categories') {
      const where = `($1 = '' OR name ILIKE $2 ESCAPE '\\')`;
      const total = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM article_categories WHERE ${where}`, [q, pattern]);
      const currentPage = Math.min(page, Math.max(1, Math.ceil(total.rows[0].count / size)));
      const rows = await db.query(`SELECT id, name AS title, parent_id AS "parentId", position, revision
        FROM article_categories WHERE ${where} ORDER BY position, id LIMIT $3 OFFSET $4`,
      [q, pattern, size, (currentPage - 1) * size]);
      return { items: rows.rows, total: total.rows[0].count, page: currentPage, size };
    }
    const where = `section = $1 AND collection = $2 AND ($3 = '' OR search_text ILIKE $4 ESCAPE '\\')
      AND ($5 = 'all' OR published = ($5 = 'published')) AND ($6 = '' OR category_id = $6)
      AND ($7 = '' OR status_id = $7)`;
    const params = [section, collection, q, pattern, input.status, input.categoryId, input.statusId];
    const total = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM cms_entries WHERE ${where}`, params);
    const currentPage = Math.min(page, Math.max(1, Math.ceil(total.rows[0].count / size)));
    const order = section === 'investing' && collection === 'entries'
      ? 'created_at DESC NULLS LAST, position, id'
      : section === 'stories' ? 'occurred_at DESC NULLS LAST, position, id' : 'position, id';
    const listSubtitleFields: Record<string, string> = {
      'travel.items': 'description', 'hobbies.items': 'description',
      'podcasts.items': 'host', 'films.items': 'director', 'tracks.items': 'artist',
      'bookmarks.items': 'url', 'friends.items': 'url', 'books.items': 'author',
      'investing.entries': 'description', 'projects.items': 'subtitle',
      'ai.agents': 'href', 'ai.skills': 'href', 'ai.relays': 'href',
    };
    const listSubtitleField = listSubtitleFields[`${section}.${collection}`];
    const excerpt = listSubtitleField ? `left(payload->>'${listSubtitleField}', 160)`
      : section === 'stories' ? "left(payload->>'text', 160)"
        : section === 'slides' ? "left(payload->>'alt', 160)" : 'left(search_text, 160)';
    const title = section === 'ai' && collection === 'skills' ? "payload->>'name'" : 'title';
    const rows = await db.query(`SELECT id, ${title} AS title, ${excerpt} AS excerpt,
      category_id AS "categoryId", published, occurred_at AS date, position, revision,
      created_at AS "createdAt", updated_at AS "updatedAt"
      FROM cms_entries WHERE ${where} ORDER BY ${order} LIMIT $8 OFFSET $9`,
    [...params, size, (currentPage - 1) * size]);
    return { items: rows.rows.map((row) => ({ ...row, ...recordTimes(row) })), total: total.rows[0].count, page: currentPage, size };
  });
}

async function readRecord(db: Client, key: RecordKey) {
  const { section, collection, id } = key;
  if (section === 'writing' && collection === 'articles') {
    const row = await db.query(`SELECT a.slug, a.title, a.excerpt, a.body,
      a.category_id AS "categoryId", c.name AS category,
      to_char(a.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY.MM.DD') AS date, a.published AS "_published",
      a.cover_url AS cover, a.cover_mode AS "coverMode", a.cover_description AS "coverDescription",
      a.cover_generated_for AS "coverGeneratedFor", a.revision,
      a.created_at AS "createdAt", a.updated_at AS "updatedAt"
      FROM articles a JOIN article_categories c ON c.id = a.category_id WHERE a.slug = $1`, [id]);
    if (!row.rowCount) return null;
    const { revision, ...value } = row.rows[0];
    return { value: { ...value, ...recordTimes(value) }, revision: Number(revision) };
  }
  if (section === 'writing' && collection === 'categories') {
    const row = await db.query(`SELECT id, name, description, coalesce(parent_id, '') AS "parentId", revision
      FROM article_categories WHERE id = $1`, [id]);
    if (!row.rowCount) return null;
    const { revision, ...value } = row.rows[0];
    return { value, revision: Number(revision) };
  }
  const row = await db.query<{ payload: Item; category_id: string | null; revision: number; createdAt: Date | null; updatedAt: Date }>(
    'SELECT payload, category_id, revision, created_at AS "createdAt", updated_at AS "updatedAt" FROM cms_entries WHERE section = $1 AND collection = $2 AND id = $3',
    [section, collection, id]);
  if (!row.rowCount) return null;
  const result = row.rows[0];
  return {
    value: { ...result.payload,
      ...(section === 'investing' && collection === 'entries' ? { sectionId: result.category_id } : {}),
      ...recordTimes(result),
    },
    revision: result.revision,
  };
}

export async function getAdminRecord(key: RecordKey) {
  assertCollection(key.section, key.collection);
  return withDatabase((db) => readRecord(db, key));
}

export async function getAdminOptions(section: Section) {
  const collections = adminCollections[section] ?? [];
  const optionCollections = collections.filter((name) =>
    ['categories', 'statuses', 'scenes', 'sections', 'agentStatuses', 'skillCategories'].includes(name) &&
    name !== 'items');
  if (section === 'writing') return withDatabase(async (db) => {
    const rows = await db.query('SELECT id, name, description, coalesce(parent_id, \'\') AS "parentId" FROM article_categories ORDER BY position');
    return { categories: rows.rows };
  });
  return withDatabase(async (db) => {
    const rows = await db.query<{ collection: string; payload: Item }>(
      'SELECT collection, payload FROM cms_entries WHERE section = $1 AND collection = ANY($2::text[]) ORDER BY collection, position',
      [section, optionCollections]);
    return Object.fromEntries(optionCollections.map((collection) =>
      [collection, rows.rows.filter((row) => row.collection === collection).map((row) => row.payload)]));
  });
}

function defaultConfig(section: Section): Item {
  const value = defaults[section];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const collections = adminCollections[section] ?? [];
  return Object.fromEntries(Object.entries(value).filter(([key]) => !collections.includes(key)));
}

function savedConfig(section: Section, value: Item | undefined) {
  const fallback = defaultConfig(section);
  const allowed = new Set(Object.keys(fallback));
  const saved = Object.fromEntries(Object.entries(value ?? (section === 'site' ? {} : fallback))
    .filter(([key]) => allowed.has(key)));
  return section === 'site' ? siteWithFooter(saved as Partial<typeof defaults.site>) : saved;
}

export async function getAdminConfig(section: Section, scope: string) {
  if (!configKeys(section, scope)) throw new Error('设置范围无效');
  return withDatabase(async (db) => {
    const row = await db.query<{ value: Item; revision: number }>(
      'SELECT value, revision FROM cms_sections WHERE section = $1', [section]);
    const base = defaultConfig(section);
    const saved = savedConfig(section, row.rows[0]?.value);
    return { value: { ...base, ...saved }, revision: row.rows[0]?.revision ?? 0 };
  });
}

export async function saveAdminConfig(section: Section, scope: string, value: Item, revision: number) {
  if (!configKeys(section, scope)) throw new Error('设置范围无效');
  if (!Number.isInteger(revision) || revision < 0) throw new Error('版本无效');
  const saved = await withDatabase(async (db) => {
    await db.query('BEGIN');
    try {
      await lockSection(db, section);
      const row = await db.query<{ value: Item; revision: number }>(
        'SELECT value, revision FROM cms_sections WHERE section = $1 FOR UPDATE', [section]);
      const previous = savedConfig(section, row.rows[0]?.value);
      if (adminCollections[section]?.some((name) => Object.hasOwn(value, name)))
        throw new Error('列表内容须逐条提交');
      const allowed = new Set(configKeys(section, scope) ?? []);
      const incoming = Object.fromEntries(Object.entries(value).filter(([key]) => allowed.has(key)));
      const next = { ...previous, ...incoming };
      const sample = defaults[section];
      const full = sample && typeof sample === 'object' && !Array.isArray(sample)
        ? { ...sample, ...next } : next;
      validateContent(section, full);
      await validateMediaReferences(next, previous);
      if ((row.rows[0]?.revision ?? 0) !== revision) throw new AdminConflict('此设置已在另一窗口修改');
      const updated = await db.query<{ revision: number }>(`INSERT INTO cms_sections (section, value, revision)
        VALUES ($1, $2::jsonb, 1) ON CONFLICT (section) DO UPDATE SET
        value = excluded.value, revision = cms_sections.revision + 1, updated_at = now()
        RETURNING revision`, [section, JSON.stringify(next)]);
      await db.query('COMMIT');
      return { value: next, revision: updated.rows[0].revision, previous };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  const failedMedia = await cleanupUnreferencedMedia(saved.previous, saved.value);
  return { value: saved.value, revision: saved.revision, failedMedia };
}

async function validateRecord(db: Client, key: Omit<RecordKey, 'id'>, value: Item, oldId?: string) {
  const { section, collection } = key;
  itemId(section, collection, value);
  if (section === 'writing' && collection === 'articles') {
    validateContent('writing', [value]);
    const category = await db.query('SELECT 1 FROM article_categories WHERE id = $1', [value.categoryId]);
    if (!category.rowCount) throw new Error('所选文章分类不存在');
    return;
  }
  if (section === 'writing' && collection === 'categories') {
    const rows = await db.query<{ id: string; name: string; description: string; parentId: string }>(
      `SELECT id, name, description, coalesce(parent_id, '') AS "parentId"
       FROM article_categories WHERE id <> $1`, [oldId ?? '']);
    validateContent('categories', [...rows.rows, value]);
    return;
  }
  if (section === 'ai' && (collection === 'skills' || collection === 'skillCategories')) {
    const rows = await db.query<{ payload: { id: string; name: string; parentId: string } }>(
      "SELECT payload FROM cms_entries WHERE section='ai' AND collection='skillCategories' AND id <> $1 ORDER BY position",
      [collection === 'skillCategories' ? oldId ?? '' : '']);
    const skillCategories = rows.rows.map((row) => row.payload);
    if (collection === 'skills') {
      if (!oldId && !value.categoryId) throw new Error('新增 Skills 时请选择分类');
      validateContent('ai', { ...defaults.ai, skills: [value], skillCategories });
    } else {
      validateContent('ai', { ...defaults.ai, skills: [], skillCategories: [...skillCategories, value] });
    }
    return;
  }
  if (section === 'investing') {
    if (collection === 'sections') {
      if (Array.isArray(value.entries) && value.entries.length) throw new Error('研究条目须逐条提交');
      validateContent('investing', {
        ...defaults.investing,
        sections: [{ ...value, entries: [] }],
      });
    } else {
      if (typeof value.sectionId !== 'string') throw new Error('请选择栏目');
      const parent = await db.query('SELECT 1 FROM cms_entries WHERE section = $1 AND collection = $2 AND id = $3',
        ['investing', 'sections', value.sectionId]);
      if (!parent.rowCount) throw new Error('栏目不存在');
      const { sectionId: _sectionId, ...entry } = value;
      validateContent('investing', {
        ...defaults.investing,
        sections: [{ ...defaults.investing.sections[0], entries: [entry] }],
      });
    }
    return;
  }
  if (['stories', 'slides'].includes(section)) {
    validateContent(section, [value]);
    return;
  }
  const sample = defaults[section];
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) throw new Error('栏目不支持逐条编辑');
  const collections = adminCollections[section] ?? [];
  const doc: Item = { ...sample };
  for (const name of collections) doc[name] = name === collection ? [value] : [];
  for (const name of collections.filter((name) =>
    ['categories', 'statuses', 'scenes', 'agentStatuses'].includes(name) && name !== collection)) {
    const rows = await db.query<{ payload: Item }>(
      'SELECT payload FROM cms_entries WHERE section = $1 AND collection = $2 ORDER BY position',
      [section, name]);
    doc[name] = rows.rows.map((row) => row.payload);
  }
  if (section === 'tracks' && collection === 'items') {
    const scenes = doc.scenes as { id: string; name: string }[] | undefined;
    const scene = scenes?.find((item) => item.id === value.moodId);
    if (scene) value.mood = scene.name;
  }
  validateContent(section, doc);
  if (['categories', 'statuses', 'scenes', 'agentStatuses'].includes(collection)) {
    const existing = await db.query<{ payload: Item }>(
      'SELECT payload FROM cms_entries WHERE section = $1 AND collection = $2 AND id <> $3',
      [section, collection, oldId ?? '']);
    const names = [...existing.rows.map((row) => row.payload.name), value.name]
      .map((name) => String(name).trim());
    if (new Set(names).size !== names.length || names.includes('全部'))
      throw new Error('名称不能重复或命名为“全部”');
  }
}

function mediaKeys(value: unknown) {
  const keys = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(/(?:^|[^A-Za-z0-9/._-])\/api\/media\/([a-f0-9-]+\.(?:png|jpg|gif|webp|mp3|wav|file))(?=$|[^A-Za-z0-9/._-])/g))
        keys.add(match[1]);
    } else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return keys;
}

async function validateMediaReferences(value: unknown, previous?: unknown) {
  const existing = mediaKeys(previous);
  for (const key of mediaKeys(value)) {
    if (existing.has(key)) continue;
    const response = await readLocalMedia(key, new Headers({ Range: 'bytes=0-0' }));
    await response.body?.cancel();
    if (response.status !== 200 && response.status !== 206)
      throw new Error('引用的本地素材已不存在，请重新上传后提交。');
  }
}

async function cleanupUnreferencedMedia(before: unknown, after: unknown) {
  const remaining = mediaKeys(after);
  const failedMedia: string[] = [];
  for (const key of mediaKeys(before)) {
    if (remaining.has(key)) continue;
    const url = `/api/media/${key}`;
    try {
      await withDatabase(async (db) => {
        await db.query('BEGIN');
        try {
          await db.query("SELECT pg_advisory_xact_lock_shared(hashtext('cms-backup'))");
          await db.query("SELECT pg_advisory_xact_lock(hashtext('cms-media'))");
          const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const pattern = `(^|[^A-Za-z0-9/._-])${escaped}($|[^A-Za-z0-9/._-])`;
          const rows = await db.query<{ used: boolean }>(`SELECT
            EXISTS (SELECT 1 FROM articles WHERE cover_url = $1 OR body ~ $2) OR
            EXISTS (SELECT 1 FROM cms_entries WHERE payload::text ~ $2) OR
            EXISTS (SELECT 1 FROM cms_sections WHERE value::text ~ $2) AS used`, [url, pattern]);
          if (!rows.rows[0].used) await deleteLocalMedia(key);
          await db.query('COMMIT');
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      });
    } catch { failedMedia.push(key); }
  }
  return failedMedia;
}

function articleParams(value: Item) {
  return [value.slug, value.title, value.excerpt, value.body, value.categoryId,
    value._published, value.cover, value.coverMode, value.coverGeneratedFor, value.coverDescription];
}

export async function createAdminRecord(section: Section, collection: string, value: Item) {
  assertCollection(section, collection);
  const id = itemId(section, collection, value);
  return withDatabase(async (db) => {
    await db.query('BEGIN');
    try {
      await lockSection(db, section);
      const clock = await db.query<{ now: Date }>('SELECT now()');
      value = recordInput(section, collection, value, clock.rows[0].now.toISOString());
      await validateRecord(db, { section, collection }, value);
      await validateMediaReferences(value);
      if (section === 'writing' && collection === 'articles') {
        await db.query(`INSERT INTO articles (slug, title, excerpt, body, category_id,
          published, cover_url, cover_mode, cover_generated_for, cover_description, position)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            (SELECT coalesce(max(position) + 1, 0) FROM articles))`, articleParams(value));
      } else if (section === 'writing' && collection === 'categories') {
        await db.query('UPDATE article_categories SET position = position + 1');
        await db.query(`INSERT INTO article_categories (id, name, description, parent_id, position)
          VALUES ($1,$2,$3,nullif($4, ''),0)`,
        [id, value.name, value.description, value.parentId]);
      } else {
        const dateOrdered = (section === 'stories' && collection === 'root') ||
          (section === 'investing' && collection === 'entries');
        if (!dateOrdered)
          await db.query('UPDATE cms_entries SET position = position + 1 WHERE section = $1 AND collection = $2',
            [section, collection]);
        const fields = recordFields(value,section);
        const position = dateOrdered
          ? '(SELECT coalesce(max(position) + 1, 0) FROM cms_entries WHERE section = $1 AND collection = $2)'
          : '0';
        await db.query(`INSERT INTO cms_entries (section, collection, id, position, published,
          title, category_id, status_id, occurred_at, payload, search_text)
          VALUES ($1,$2,$3,${position},$4,$5,$6,$7,$8,$9::jsonb,$10)`,
        [section, collection, id, fields.published, fields.title, fields.categoryId, fields.statusId,
          fields.occurredAt, JSON.stringify(payloadValue(section, collection, value)), fields.search]);
      }
      await db.query(`INSERT INTO cms_sections (section, value) VALUES ($1, $2::jsonb)
        ON CONFLICT DO NOTHING`, [section, JSON.stringify(sectionMetadata(section))]);
      const saved = await readRecord(db, { section, collection, id });
      await db.query('COMMIT');
      return { id, ...saved! };
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new AdminConflict('标识或名称已存在');
      throw error;
    }
  });
}

export async function updateAdminRecord(key: RecordKey, value: Item, revision: number) {
  assertCollection(key.section, key.collection);
  if (!Number.isInteger(revision) || revision < 1) throw new Error('版本无效');
  const id = itemId(key.section, key.collection, value);
  if (!(key.section === 'writing' && key.collection === 'articles') && id !== key.id)
    throw new Error('记录标识不能修改');
  const before = await withDatabase(async (db) => {
    await db.query('BEGIN');
    try {
      await lockSection(db, key.section);
      const previous = await readRecord(db, key);
      if (!previous) throw new AdminNotFound('记录不存在');
      if (previous.revision !== revision) throw new AdminConflict('此记录已在另一窗口修改');
      value = recordInput(key.section, key.collection, value, previous.value.createdAt as string | null);
      await validateRecord(db, key, value, key.id);
      await validateMediaReferences(value, previous.value);
      let updated;
      if (key.section === 'writing' && key.collection === 'articles') {
        updated = await db.query(`UPDATE articles SET slug=$1,title=$2,excerpt=$3,body=$4,
          category_id=$5,published=$6,cover_url=$7,
          cover_mode=$8,cover_generated_for=$9,cover_description=$10,revision=revision+1,updated_at=now()
          WHERE slug=$11 AND revision=$12`, [...articleParams(value), key.id, revision]);
      } else if (key.section === 'writing' && key.collection === 'categories') {
        updated = await db.query(`UPDATE article_categories SET name=$1,description=$2,
          parent_id=nullif($3,''),revision=revision+1 WHERE id=$4 AND revision=$5`,
        [value.name, value.description, value.parentId, key.id, revision]);
      } else {
        const fields = recordFields(value,key.section);
        updated = await db.query(`UPDATE cms_entries SET published=$1,title=$2,category_id=$3,
          status_id=$4,occurred_at=$5,payload=$6::jsonb,search_text=$7,revision=revision+1,
          updated_at=now() WHERE section=$8 AND collection=$9 AND id=$10 AND revision=$11`,
        [fields.published, fields.title, fields.categoryId, fields.statusId, fields.occurredAt,
          JSON.stringify(payloadValue(key.section, key.collection, value)), fields.search,
          key.section, key.collection, key.id, revision]);
      }
      if (!updated.rowCount) throw new AdminConflict('此记录已在另一窗口修改');
      const saved = await readRecord(db, { ...key, id });
      await db.query('COMMIT');
      return { previous: previous.value, saved: saved! };
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new AdminConflict('标识或名称已存在');
      throw error;
    }
  });
  const failedMedia = await cleanupUnreferencedMedia(before.previous, value);
  return { id, ...before.saved, failedMedia };
}

export async function deleteAdminRecord(key: RecordKey, revision: number) {
  assertCollection(key.section, key.collection);
  if (!Number.isInteger(revision) || revision < 1) throw new Error('版本无效');
  const previous = await withDatabase(async (db) => {
    await db.query('BEGIN');
    try {
      await lockSection(db, key.section);
      const before = await readRecord(db, key);
      if (!before) throw new AdminNotFound('记录不存在');
      if (before.revision !== revision) throw new AdminConflict('此记录已在另一窗口修改');
      if (key.section === 'writing' && key.collection === 'categories') {
        const used = await db.query(`SELECT
          EXISTS (SELECT 1 FROM articles WHERE category_id = $1) OR
          EXISTS (SELECT 1 FROM article_categories WHERE parent_id = $1) AS used`, [key.id]);
        if (used.rows[0].used) throw new Error('分类仍被文章或子分类使用');
      } else if (key.section === 'ai' && key.collection === 'agentStatuses') {
        const used = await db.query(`SELECT 1 FROM cms_entries WHERE section='ai' AND
          collection='agents' AND payload->>'status'=$1 LIMIT 1`, [key.id]);
        if (used.rowCount) throw new Error('状态仍被智能体使用');
      } else if (key.section === 'ai' && key.collection === 'skillCategories') {
        const used = await db.query(`SELECT 1 FROM cms_entries WHERE section='ai' AND
          ((collection='skillCategories' AND payload->>'parentId'=$1) OR
           (collection='skills' AND payload->>'categoryId'=$1)) LIMIT 1`, [key.id]);
        if (used.rowCount) throw new Error('分类仍被技能或子分类使用');
      } else if (['categories', 'statuses', 'scenes', 'sections'].includes(key.collection)) {
        const field = key.collection === 'statuses' ? 'statusId'
          : key.collection === 'scenes' ? 'moodId' : 'categoryId';
        const used = await db.query(`SELECT 1 FROM cms_entries WHERE section=$1 AND
          ((collection='items' AND payload->>$2=$3) OR
           (collection='entries' AND category_id=$3)) LIMIT 1`, [key.section, field, key.id]);
        if (used.rowCount) throw new Error('此选项仍被内容使用');
      }
      let deleted;
      if (key.section === 'writing' && key.collection === 'articles')
        deleted = await db.query('DELETE FROM articles WHERE slug=$1 AND revision=$2', [key.id, revision]);
      else if (key.section === 'writing' && key.collection === 'categories')
        deleted = await db.query('DELETE FROM article_categories WHERE id=$1 AND revision=$2', [key.id, revision]);
      else deleted = await db.query('DELETE FROM cms_entries WHERE section=$1 AND collection=$2 AND id=$3 AND revision=$4',
        [key.section, key.collection, key.id, revision]);
      if (!deleted.rowCount) throw new AdminConflict('此记录已在另一窗口修改');
      await db.query('COMMIT');
      return before.value;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  const failedMedia = await cleanupUnreferencedMedia(previous, null);
  return { deleted: true, failedMedia };
}

export async function setAdminPublication(key: RecordKey, published: boolean, revision: number) {
  if (typeof published !== 'boolean') throw new Error('发布状态无效');
  const current = await getAdminRecord(key);
  if (!current) throw new AdminNotFound('记录不存在');
  return updateAdminRecord(key, { ...current.value, _published: published }, revision);
}

export async function moveAdminRecord(key: RecordKey, direction: -1 | 1, revision: number) {
  assertCollection(key.section, key.collection);
  if (key.section === 'investing' && key.collection === 'entries') throw new Error('投资文章按添加时间排序');
  if (![-1, 1].includes(direction) || !Number.isInteger(revision) || revision < 1)
    throw new Error('排序请求无效');
  return withDatabase(async (db) => {
    await db.query('BEGIN');
    try {
      await lockSection(db, key.section);
      const table = key.section === 'writing'
        ? key.collection === 'articles' ? 'articles' : 'article_categories' : 'cms_entries';
      const idField = table === 'articles' ? 'slug' : 'id';
      const filter = table === 'cms_entries' ? 'section=$2 AND collection=$3' : 'true';
      const params = table === 'cms_entries' ? [key.id, key.section, key.collection] : [key.id];
      const current = await db.query<{ position: number; revision: number }>(
        `SELECT position, revision FROM ${table} WHERE ${idField}=$1 AND ${filter} FOR UPDATE`, params);
      if (!current.rowCount) throw new AdminNotFound('记录不存在');
      if (current.rows[0].revision !== revision) throw new AdminConflict('此记录已在另一窗口修改');
      const comparator = direction < 0 ? '<' : '>';
      const order = direction < 0 ? 'DESC' : 'ASC';
      const neighbor = await db.query<{ id: string; position: number }>(
        `SELECT ${idField} AS id, position FROM ${table} WHERE ${filter.replace('$2', '$1').replace('$3', '$2')}
          AND position ${comparator} $${table === 'cms_entries' ? 3 : 1}
          ORDER BY position ${order}, ${idField} ${order} LIMIT 1 FOR UPDATE`,
        table === 'cms_entries' ? [key.section, key.collection, current.rows[0].position]
          : [current.rows[0].position]);
      if (!neighbor.rowCount) throw new Error('已经位于列表边界');
      const base = table === 'cms_entries' ? [key.section, key.collection] : [];
      await db.query(`UPDATE ${table} SET position=$1,revision=revision+1 WHERE ${idField}=$2
        ${table === 'cms_entries' ? 'AND section=$3 AND collection=$4' : ''}`,
      [neighbor.rows[0].position, key.id, ...base]);
      await db.query(`UPDATE ${table} SET position=$1,revision=revision+1 WHERE ${idField}=$2
        ${table === 'cms_entries' ? 'AND section=$3 AND collection=$4' : ''}`,
      [current.rows[0].position, neighbor.rows[0].id, ...base]);
      await db.query('COMMIT');
      return { revision: revision + 1 };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
}
