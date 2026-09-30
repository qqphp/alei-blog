import pg from 'pg';
import { defaults } from '../lib/cms-defaults.ts';
import { adminCollections, sectionMetadata } from '../lib/admin-sections.ts';
import { ensureManagedPostgres } from './managed-postgres.mjs';
import { recordFields } from '../lib/content-record-fields.mjs';

if (!process.env.DATABASE_URL) throw new Error('未配置 DATABASE_URL');
const historicalCreatedAt = '2026-01-01T00:00:00.000Z';
await ensureManagedPostgres();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const seeded = [];
try {
  await db.query('BEGIN');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('cms-backup'))");
  for (const [section, value] of Object.entries(defaults)) {
    const collections = adminCollections[section] ?? [];
    const metadata = sectionMetadata(section);
    const added = await db.query('INSERT INTO cms_sections (section, value) VALUES ($1, $2::jsonb) ON CONFLICT (section) DO NOTHING RETURNING section',
      [section, JSON.stringify(metadata)]);
    if (!added.rowCount) continue;
    seeded.push(section);
    if (section === 'categories') {
      for (const [position, item] of value.entries())
        await db.query(`INSERT INTO article_categories (id,name,description,parent_id,position)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [item.id, item.name, item.description, item.parentId || null, position]);
      continue;
    }
    if (section === 'writing') {
      for (const [position, item] of value.entries())
        await db.query(`INSERT INTO articles (slug,title,excerpt,body,category_id,
          published,cover_url,cover_mode,cover_generated_for,position,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (slug) DO NOTHING`,
        [item.slug, item.title, item.excerpt, item.body, item.categoryId,
          item._published, item.cover, item.coverMode,
          item.coverGeneratedFor, position, historicalCreatedAt]);
      continue;
    }
    for (const collection of collections) {
      if (section === 'investing') continue;
      const items = collection === 'root' ? value : value[collection];
      if (!Array.isArray(items)) continue;
      for (const [position, item] of items.entries()) {
        const fields = recordFields(item);
        await db.query(`INSERT INTO cms_entries (section,collection,id,position,published,title,
          category_id,status_id,occurred_at,payload,search_text,created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) ON CONFLICT (section,collection,id) DO NOTHING`,
        [section, collection, item.id ?? `slide-${position}`, position,
          fields.published, fields.title, fields.categoryId, fields.statusId,
          fields.occurredAt, JSON.stringify(item), fields.search,
          section === 'ai' ? new Date() : section === 'projects' && item.createdAt && Number.isFinite(Date.parse(item.createdAt)) ? new Date(item.createdAt) : historicalCreatedAt]);
      }
    }
    if (section === 'investing') {
      let entryPosition = 0;
      for (const [position, group] of value.sections.entries()) {
        const { entries, ...part } = group;
        await db.query(`INSERT INTO cms_entries (section,collection,id,position,title,payload,search_text)
          VALUES ('investing','sections',$1,$2,$3,$4::jsonb,$5) ON CONFLICT (section,collection,id) DO NOTHING`,
        [group.id, position, group.title, JSON.stringify(part), `${group.title} ${group.description}`]);
        for (const item of entries)
          await db.query(`INSERT INTO cms_entries (section,collection,id,position,published,title,
            category_id,payload,search_text,created_at)
            VALUES ('investing','entries',$1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (section,collection,id) DO NOTHING`,
          [item.id, entryPosition++, item._published, item.title, group.id,
            JSON.stringify(item), [item.title, item.tag, item.description, ...(item.paragraphs ?? [])].filter(Boolean).join(' '), historicalCreatedAt]);
      }
    }
  }
  await db.query('COMMIT');
  console.log(`已补齐 ${seeded.length} 个此前仅使用默认值的栏目：${seeded.join('、') || '无'}`);
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
