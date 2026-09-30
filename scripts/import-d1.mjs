import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { ensureManagedPostgres } from './managed-postgres.mjs';
import { recordFields } from '../lib/content-record-fields.mjs';

if (!process.env.DATABASE_URL) throw new Error('请先配置 DATABASE_URL');
await ensureManagedPostgres();
const exported = spawnSync('python', ['scripts/export-d1.py'], {
  encoding: 'utf8', maxBuffer: 50 * 1024 * 1024,
});
if (exported.status !== 0) throw new Error(exported.stderr.trim() || '读取旧数据库失败');
const source = JSON.parse(exported.stdout);
source.documents = source.documents.filter(({ key }) => !['pageSettings', 'copy'].includes(key));
const collections = {
  projects: ['statuses', 'categories', 'items'], stories: ['root'], slides: ['root'],
  ai: ['agents', 'skills', 'relays', 'skillCategories'], bookmarks: ['categories', 'items'], friends: ['categories', 'items'],
  books: ['categories', 'items', 'lists'], tracks: ['scenes', 'items', 'playlists'],
  films: ['categories', 'items'], podcasts: ['categories', 'items'],
  travel: ['categories', 'items'], hobbies: ['categories', 'items'],
};
const historicalCreatedAt = '2026-01-01T00:00:00.000Z';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const existing = await client.query('SELECT count(*)::int AS count FROM cms_sections');
  if (existing.rows[0].count) throw new Error('目标数据库已有博客内容，已取消导入以避免覆盖');
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cms-backup'))");
    for (const { key, value, revision } of source.documents) {
      const names = collections[key] ?? [];
      const metadata = names.length
        ? Array.isArray(value) ? {} : Object.fromEntries(Object.entries(value).filter(([name]) => !names.includes(name)))
        : key === 'writing' || key === 'categories' ? {} : value;
      await client.query('INSERT INTO cms_sections (section, value, revision) VALUES ($1, $2::jsonb, $3)', [key, JSON.stringify(metadata), revision]);
    }
    const categories = source.documents.find((row) => row.key === 'categories')?.value ?? [];
    for (const [position, category] of categories.entries())
      await client.query('INSERT INTO article_categories (id, name, description, parent_id, position) VALUES ($1, $2, $3, $4, $5)',
        [category.id, category.name, category.description, category.parentId || null, position]);
    const articles = source.documents.find((row) => row.key === 'writing')?.value ?? [];
    for (const [position, article] of articles.entries())
      await client.query(`INSERT INTO articles (slug, title, excerpt, body, category_id, published, cover_url, cover_mode, cover_generated_for, position, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [article.slug, article.title, article.excerpt, article.body, article.categoryId,
        article._published === true, article.cover,
        article.coverMode ?? 'upload', article.coverGeneratedFor ?? '', position, historicalCreatedAt]);
    let entries = 0;
    for (const { key, value } of source.documents) {
      for (const collection of collections[key] ?? []) {
        const items = collection === 'root' ? value : value[collection] ?? [];
        for (const [position, savedItem] of items.entries()) {
          const item = { ...savedItem, id: savedItem.id ?? `slide-${position}` };
          if (key === 'ai' && collection === 'skills') {
            delete item.category;
            delete item.subcategory;
            item.categoryId = '';
          }
          if (key === 'tracks' && collection === 'playlists') delete item.color;
          const fields = recordFields(item);
          await client.query(`INSERT INTO cms_entries (section, collection, id, position, published, title, category_id, occurred_at, payload, created_at, status_id, search_text)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)`,
          [key, collection, item.id ?? `slide-${position}`, position, fields.published,
            fields.title, fields.categoryId, fields.occurredAt,
            JSON.stringify(item), key === 'projects' && item.createdAt && Number.isFinite(Date.parse(item.createdAt)) ? new Date(item.createdAt) : historicalCreatedAt,
            fields.statusId, fields.search]);
          entries++;
        }
      }
    }
    for (const row of source.snapshots)
      await client.query('INSERT INTO aa_language_model_snapshots (key, payload, stored_at) VALUES ($1, $2::jsonb, $3)',
        [row.key, JSON.stringify(row.payload), row.stored_at]);
    for (const row of source.keys)
      await client.query('INSERT INTO api_integration_keys (service, api_key, updated_at) VALUES ($1, $2, $3)',
        [row.service, row.api_key, row.updated_at]);
    await client.query('COMMIT');
    console.log(`已导入 ${source.documents.length} 个栏目、${articles.length} 篇文章、${entries} 条其他记录和 ${source.snapshots.length} 份模型缓存。旧 D1 数据保持原样。`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
} finally {
  await client.end();
}
