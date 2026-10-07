import { getDocuments } from './cms-server';
import { withReadDatabase } from './postgres';
import { publishedOnly } from './cms-validation';
import { recordTimes } from './content-times';
import type { PublicContent, Section } from './cms-defaults';
import {
  publicCollectionSizes,
  type PublicArchives,
  type PublicCollectionKey,
  type PublicPage,
} from './public-collections';

type Item = Record<string, unknown>;
const searchFields: Record<PublicCollectionKey, string[]> = {
  'ai.agents': [],
  'ai.skills': [],
  'ai.relays': [],
  'investing.entries': [],
  'projects.items': [],
  'books.items': ['title', 'author'],
  'books.lists': ['title', 'description', 'entries'],
  'tracks.items': ['title', 'artist', 'mood'],
  'tracks.playlists': ['title', 'description'],
  'films.items': ['title', 'director', 'genre', 'country', 'language'],
  'podcasts.items': ['title', 'description', 'host'],
  'travel.items': ['title', 'description', 'body'],
  'hobbies.items': ['title', 'description', 'body'],
  'bookmarks.items': ['name', 'url', 'description', 'category', 'tags'],
  'friends.items': ['name', 'category', 'description', 'url'],
};

export async function getPublicPage(
  key: PublicCollectionKey,
  input: { page?: number; q?: string; category?: string; id?: string } = {},
): Promise<PublicPage> {
  const [section, collection] = key.split('.');
  const size = publicCollectionSizes[key];
  const q = input.q?.trim().toLowerCase() ?? '';
  return withReadDatabase(async (db) => {
    const options = (
      await db.query<{ collection: string; payload: Item }>(
        `SELECT collection, payload FROM cms_entries WHERE section=$1
       AND collection IN ('categories','statuses','scenes','skillCategories','sections') ORDER BY position,id`,
        [section],
      )
    ).rows;
    const categoryOptions = options
      .filter((row) =>
        ['categories', 'scenes', 'skillCategories', 'sections'].includes(
          row.collection,
        ),
      )
      .map((row) => row.payload);
    const names = new Map(
      categoryOptions.map((item) => [
        String(item.id),
        String(item.name ?? item.title),
      ]),
    );
    let categoryIds: string[] | null = input.category ? [input.category] : null;
    if (
      key === 'ai.skills' &&
      categoryIds &&
      input.category !== '__uncategorized__'
    )
      categoryIds.push(
        ...categoryOptions
          .filter((item) => item.parentId === input.category)
          .map((item) => String(item.id)),
      );
    if (input.category === '__uncategorized__')
      categoryIds = categoryOptions.map((item) => String(item.id));
    const fields = searchFields[key].map((field) => {
      if (field === 'tags')
        return "coalesce((SELECT string_agg(tag,' ' ORDER BY ordinal) FROM jsonb_array_elements_text(payload->'tags') WITH ORDINALITY AS tags(tag,ordinal)),'')";
      if (field === 'entries')
        return "coalesce((SELECT string_agg(concat_ws(' ',entry->>'title',entry->>'author'),' ' ORDER BY ordinal) FROM jsonb_array_elements(payload->'entries') WITH ORDINALITY AS entries(entry,ordinal)),'')";
      if (field === 'category' || field === 'mood')
        return `coalesce((SELECT o.payload->>'name' FROM cms_entries o WHERE o.section=e.section
        AND o.collection IN ('categories','scenes') AND o.id=e.category_id LIMIT 1),payload->>'${field}','')`;
      return `coalesce(payload->>'${field}','')`;
    });
    const expression = fields.length
      ? `concat_ws(' ',${fields.join(',')})`
      : "''";
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const searchWhere = `e.section=$1 AND e.collection=$2 AND e.published AND ($3='' OR ${expression} ILIKE $4 ESCAPE '\\')`;
    const where = `${searchWhere} AND ($5::text[] IS NULL OR ${
      input.category === '__uncategorized__'
        ? "coalesce(e.category_id,'') <> ALL($5::text[])"
        : 'e.category_id = ANY($5::text[])'
    })`;
    const params = [section, collection, q, pattern, categoryIds];
    const countRows = (
      await db.query<{ categoryId: string; count: number }>(
        `SELECT coalesce(category_id,'') AS "categoryId", count(*)::int AS count FROM cms_entries e WHERE ${searchWhere} GROUP BY category_id`,
        params.slice(0, 4),
      )
    ).rows;
    const total = (
      await db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM cms_entries e WHERE ${where}`,
        params,
      )
    ).rows[0].count;
    const allCount = (
      await db.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM cms_entries WHERE section=$1 AND collection=$2 AND published',
        [section, collection],
      )
    ).rows[0].count;
    const order = ['projects.items', 'investing.entries'].includes(key)
      ? 'created_at DESC, position, id'
      : 'position,id';
    let requested = input.page ?? 1;
    if (input.id) {
      const rank = (
        await db.query<{ rank: string }>(
          `SELECT rank FROM (SELECT id,row_number() OVER (ORDER BY ${order}) AS rank FROM cms_entries e WHERE ${where}) ranked WHERE id=$6`,
          [...params, input.id],
        )
      ).rows[0];
      if (rank) requested = Math.ceil(Number(rank.rank) / size);
    }
    const page = Math.min(
      Math.max(1, requested),
      Math.max(1, Math.ceil(total / size)),
    );
    const rows = (
      await db.query<{
        payload: Item;
        category_id: string;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `SELECT payload,category_id,created_at AS "createdAt",updated_at AS "updatedAt" FROM cms_entries e WHERE ${where}
       ORDER BY ${order} LIMIT $6 OFFSET $7`,
        [...params, size, (page - 1) * size],
      )
    ).rows;
    const items = rows.map((row) => {
      const item = { ...row.payload };
      if (key === 'projects.items') {
        Object.assign(item, recordTimes(row));
        for (const [collection, field, label] of [
          ['statuses', 'statusId', 'status'],
          ['categories', 'categoryId', 'category'],
        ])
          item[label] =
            options.find(
              (option) =>
                option.collection === collection &&
                option.payload.id === item[field],
            )?.payload.name ?? item[label];
      }
      if (key === 'investing.entries')
        Object.assign(item, recordTimes(row), { sectionId: row.category_id });
      if (key === 'tracks.items')
        item.mood = names.get(row.category_id) ?? item.mood;
      if (['bookmarks.items', 'friends.items', 'books.items'].includes(key))
        item.category = names.get(row.category_id) ?? item.category;
      return publishedOnly(item) as Item;
    });
    return {
      items,
      total,
      allCount,
      searchTotal: countRows.reduce((sum, row) => sum + row.count, 0),
      categoryCounts: Object.fromEntries(
        countRows.map((row) => [row.categoryId, row.count]),
      ),
      page,
    };
  });
}

export async function getPublicSection(
  sections: (keyof PublicContent)[],
  projectId?: string,
  projectInput: { page?: number; category?: string } = {},
) {
  const { content, revisions } = await getDocuments(sections as Section[], {
    publicOnly: true,
    metadataOnly: true,
  });
  const archives: PublicArchives = {};
  for (const key of Object.keys(
    publicCollectionSizes,
  ) as PublicCollectionKey[]) {
    const [section, collection] = key.split('.') as [
      keyof PublicContent,
      string,
    ];
    if (!sections.includes(section) || revisions[section] === undefined)
      continue;
    const page = await getPublicPage(
      key,
      key === 'projects.items' ? { ...projectInput, ...(projectId ? { id: projectId } : {}) } : {},
    );
    archives[key] = page;
    const doc = content[section] as unknown as Item;
    if (key === 'investing.entries') {
      for (const group of doc.sections as Item[])
        group.entries = page.items.filter(
          (entry) => entry.sectionId === group.id,
        );
    } else doc[collection] = page.items;
  }
  return {
    content: publishedOnly(content) as Partial<PublicContent>,
    archives,
  };
}
