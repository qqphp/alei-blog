import { contentPageSizes } from './content-page-sizes';
import { migrateActivities } from './activity-content';
import { migrateBooks } from './book-content';
import { booklists as defaultBooklists } from './books';
import { migratePodcasts } from './podcast-content';
import { migrateFilms } from './film-content';
import { migrateMusic, publicMusic } from './music-content';
import { migrateDirectory, resolveDirectory } from './directory-content';
import { env } from 'cloudflare:workers';
import { cacheForRequest } from 'vinext/cache';
import { withDatabase, withReadDatabase } from './postgres';
import { adminCollections } from './admin-sections';
import { defaults, siteWithFooter, type PublicContent, type Section } from './cms-defaults';
import { publishedOnly } from './cms-validation';
import { recordTimes } from './content-times';
import { migrateProjects, resolveProjects } from './project-content';
import { categoryId, stripArticleExtras } from './article-categories';
import { migrateStories, newestStoriesFirst } from './story-content';
import { categoryBranch } from './article-categories';
import { monthSummary } from './story-calendar';
import { newestProjectsFirst } from './content-order';

export type ArchiveArticle = Pick<typeof defaults.writing[number], 'slug' | 'title' | 'excerpt' | 'categoryId' | 'category' | 'date' | 'cover'>;
export type WritingArchive = {
  page?: number;
  items: ArchiveArticle[];
  total: number;
  allCount: number;
  categoryCounts: Record<string, number>;
};
export type StoryArchive = {
  page?: number;
  items: typeof defaults.stories;
  total: number;
  yearlyCount: number;
  latestPeriod: number;
  calendar: ReturnType<typeof monthSummary>;
};

export function bindings() {
  return env as unknown as {
    DATABASE_URL?: string;
    ADMIN_PASSWORD?: string;
    TEAMOROUTER_KEY?: string;
    AA_API_KEY?: string;
    LOCAL_AI_TRANSPORT?: string;
    LOCAL_AI_TOKEN?: string;
    LOCAL_MEDIA_STORAGE?: string;
    LOCAL_MEDIA_TOKEN?: string;
  };
}

function collectionsFor(key: Section): readonly string[] {
  if (key === 'writing') return [];
  return adminCollections[key] ?? [];
}

function wantedSections(sections?: readonly Section[]) {
  const keys = sections ?? (Object.keys(defaults) as Section[]);
  const wanted = new Set(keys);
  const stored = new Set(wanted);
  if (wanted.has('writing')) stored.add('categories');
  return { wanted, stored: [...stored] };
}

export async function getDocuments(sections?: Section[], options: { publicOnly?: boolean; metadataOnly?: boolean } = {}) {
  const { wanted, stored } = wantedSections(sections);
  const has = (key: Section) => wanted.has(key);
  const selected = sections ? stored : null;
  const { results, categories, articles, entries } = await withDatabase(async (db) => {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const [sectionResult, categories, articles, entries] = [
        await db.query<{ section: Section; value: unknown; revision: number }>('SELECT section, value, revision FROM cms_sections WHERE $1::text[] IS NULL OR section = ANY($1::text[])', [selected]),
        await db.query<{ id: string; name: string; description: string; parent_id: string | null }>('SELECT id, name, description, parent_id FROM article_categories WHERE $1::boolean ORDER BY position', [has('categories') || has('writing')]),
        await db.query<{ slug: string; title: string; excerpt: string; body: string; category_id: string; date: string; published: boolean; cover_url: string; cover_mode: string; cover_generated_for: string; cover_description: string }>(`SELECT slug, title, excerpt, body, category_id, to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY.MM.DD') AS date, published, cover_url, cover_mode, cover_generated_for, cover_description FROM articles WHERE $1::boolean AND (NOT $2::boolean OR published) ORDER BY created_at DESC, slug`, [has('writing') && !options.metadataOnly, options.publicOnly ?? false]),
        await db.query<{ section: Section; collection: string; category_id: string | null; payload: unknown; createdAt: Date | null; updatedAt: Date }>(`SELECT section, collection, category_id, payload, created_at AS "createdAt", updated_at AS "updatedAt" FROM cms_entries
          WHERE ($1::text[] IS NULL OR section = ANY($1::text[]))
          AND (NOT $2::boolean OR published OR collection IN ('categories','statuses','scenes','agentStatuses','skillCategories','sections'))
          AND (NOT $3::boolean OR collection IN ('categories','statuses','scenes','agentStatuses','skillCategories','sections'))
          ORDER BY section, collection, position, id`, [selected,options.publicOnly ?? false,options.metadataOnly ?? false]),
      ];
      await db.query('COMMIT');
      return { results: sectionResult.rows, categories: categories.rows, articles: articles.rows, entries: entries.rows };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  });
  const content = {} as typeof defaults;
  for (const key of wanted) (content as Record<Section, unknown>)[key] = structuredClone(defaults[key]);
  if (has('site')) content.site = siteWithFooter({});
  const revisions: Partial<Record<Section, number>> = {};
  for (const row of results) {
    if (!Object.hasOwn(defaults, row.section)) continue;
    revisions[row.section] = row.revision;
    if (!has(row.section)) continue;
    const base = content[row.section];
    const saved = row.value;
    Object.assign(content, {
      [row.section]: saved && typeof saved === 'object' && !Array.isArray(saved)
        && base && typeof base === 'object' && !Array.isArray(base)
        ? row.section === 'site' ? siteWithFooter(saved as Partial<typeof defaults.site>) : { ...base, ...saved }
        : saved,
    });
  }
  if (has('ai') && revisions.ai === undefined)
    content.ai = { agents: [], skills: [], relays: [], agentStatuses: [], skillCategories: [] };
  if (has('writing') && revisions.writing !== undefined)
    content.writing = articles.map((row) => ({
      slug: row.slug, title: row.title, excerpt: row.excerpt, body: row.body,
      categoryId: row.category_id, category: '', date: row.date, _published: row.published,
      coverDescription: row.cover_description, cover: row.cover_url, coverMode: row.cover_mode as 'upload' | 'ai', coverGeneratedFor: row.cover_generated_for,
    }));
  for (const key of Object.keys(adminCollections) as Section[]) {
    if (!has(key) || key === 'writing' || revisions[key] === undefined) continue;
    const collections = collectionsFor(key);
    if (key === 'investing') {
      const groups = entries.filter((row) => row.section === key && row.collection === 'sections');
      const researchEntries = entries.filter((row) => row.section === key && row.collection === 'entries');
      content.investing = {
          ...content.investing,
          sections: groups.map((section) => ({
            ...(section.payload as typeof content.investing.sections[number]),
            entries: researchEntries.filter((entry) =>
              entry.category_id === (section.payload as { id: string }).id,
            ).map((entry) => ({ ...(entry.payload as typeof content.investing.sections[number]['entries'][number]), ...recordTimes(entry) })),
          })),
      };
      continue;
    }
    const grouped = Object.fromEntries(collections.map((collection) => [
      collection, entries.filter((row) => row.section === key && row.collection === collection).map((row) => key === 'projects' && collection === 'items'
        ? { ...(row.payload as object), ...recordTimes(row), createdAt: recordTimes(row).createdAt ?? '' } : row.payload),
    ]));
    Object.assign(content, { [key]: collections.includes('root') ? grouped.root : { ...(content[key] as object), ...grouped } });
  }
  if (has('aiSettings')) {
    const legacyFilmCoverSettings = !Object.hasOwn(content.aiSettings, 'filmCoverSize');
    content.aiSettings = { ...defaults.aiSettings, ...content.aiSettings };
    if (legacyFilmCoverSettings) {
      if (content.aiSettings.filmCoverPrompt.includes('{{excerpt}}'))
        content.aiSettings.filmCoverPrompt = defaults.aiSettings.filmCoverPrompt;
      for (const field of ['filmCoverStyle', 'filmCoverPrompt'] as const) {
        content.aiSettings[field] = content.aiSettings[field]
          .replaceAll('16:9', '9:16')
          .replaceAll('2:3', '9:16')
          .replaceAll('横向', '竖向')
          .replaceAll('横版', '竖版');
      }
    }
  }
  if (has('categories') || has('writing')) {
    let categoryList = revisions.categories !== undefined
      ? categories.map((row) => ({ id: row.id, name: row.name, description: row.description, parentId: row.parent_id ?? '' }))
      : structuredClone(defaults.categories);
    if (revisions.categories === undefined) {
      const names = new Set([
        ...categoryList.map((item) => item.name),
        ...(has('writing') ? content.writing.map((item) => item.category) : []),
      ]);
      categoryList = [...names].filter(Boolean).map((name) => ({
        id: categoryId(name),
        name,
        description: '',
        parentId: '',
      }));
    }
    categoryList = categoryList.map((category) => ({ ...category, parentId: category.parentId ?? '' }));
    if (has('categories')) content.categories = categoryList;
    if (has('writing')) content.writing = content.writing.map((article) => {
      const id = article.categoryId
        ?? categoryList.find((item) => item.name === article.category)?.id
        ?? categoryId(article.category);
      return {
        ...stripArticleExtras(article),
        categoryId: id,
        category: categoryList.find((item) => item.id === id)?.name ?? article.category,
        coverMode: article.coverMode ?? 'upload',
        coverDescription: article.coverDescription ?? '',
        coverGeneratedFor: article.coverGeneratedFor ?? '',
      };
    });
  }
  if (has('projects')) content.projects = Array.isArray(content.projects)
    ? migrateProjects(content.projects)
    : resolveProjects(content.projects);
  for (const key of ['bookmarks', 'friends'] as const)
    if (has(key)) content[key] = Array.isArray(content[key])
      ? migrateDirectory(content[key])
      : resolveDirectory(content[key]);
  if (has('stories')) content.stories = migrateStories(content.stories);
  if (has('tracks')) content.tracks = migrateMusic(content.tracks);
  if (has('travel')) content.travel = migrateActivities(content.travel);
  if (has('hobbies')) content.hobbies = migrateActivities(content.hobbies);
  if (has('books')) content.books = migrateBooks(content.books, defaultBooklists);
  if (has('films')) content.films = migrateFilms(content.films);
  if (has('podcasts')) content.podcasts = migratePodcasts(content.podcasts);
  return { content, revisions };
}

const publicLoaders = new Map<string, () => Promise<Partial<PublicContent>>>();

function publicLoader(key: string) {
  let loader = publicLoaders.get(key);
  if (!loader) {
    const sections = key.split(',') as (keyof PublicContent)[];
    loader = cacheForRequest(async () => {
      const { content } = await getDocuments(sections, { publicOnly: true });
      if (sections.includes('tracks')) content.tracks = publicMusic(content.tracks);
      const visible = publishedOnly(content) as Partial<PublicContent>;
      return Object.fromEntries(sections.map((name) => [name, visible[name]]));
    });
    publicLoaders.set(key, loader);
  }
  return loader;
}

export function getPublicContent<T extends keyof PublicContent>(sections: readonly T[]): Promise<Pick<PublicContent, T>> {
  return publicLoader([...sections].sort().join(','))() as Promise<Pick<PublicContent, T>>;
}

export async function getPublicPlaybackContent(): Promise<PublicContent['tracks']> {
  const { content, revisions } = await getDocuments(['tracks'], { publicOnly: true, metadataOnly: true });
  if (revisions.tracks !== undefined) {
    content.tracks.items = await withReadDatabase(async (db) =>
      (await db.query<{ payload: typeof defaults.tracks.items[number] }>(
        "SELECT payload FROM cms_entries WHERE section='tracks' AND collection='items' AND published ORDER BY position,id"))
        .rows.map((row)=>row.payload));
  }
  // The persistent player needs the complete lightweight playback queue, not playlist bodies.
  content.tracks.playlists = [];
  return publishedOnly(migrateMusic(content.tracks)) as PublicContent['tracks'];
}

export async function getPublicArticle(slug: string) {
  const row = await withDatabase(async (db) => {
    const result = await db.query<{ slug: string; title: string; excerpt: string; body: string; categoryId: string; category: string; date: string; cover: string; coverMode: 'upload' | 'ai'; coverGeneratedFor: string; coverDescription: string }>(
      `SELECT a.slug, a.title, a.excerpt, a.body, a.category_id AS "categoryId",
        c.name AS category, to_char(a.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY.MM.DD') AS date,
        a.cover_url AS cover, a.cover_mode AS "coverMode",
        a.cover_generated_for AS "coverGeneratedFor", a.cover_description AS "coverDescription"
       FROM articles a JOIN article_categories c ON c.id = a.category_id
       WHERE a.slug = $1 AND a.published`,
      [slug],
    );
    return result.rows[0] ?? null;
  });
  if (row) return { ...row, _published: true };
  const saved = await withDatabase(async (db) =>
    ((await db.query('SELECT 1 FROM cms_sections WHERE section = $1', ['writing'])).rowCount ?? 0) > 0,
  );
  return saved ? undefined : defaults.writing.find((item) => item.slug === slug && item._published);
}

export async function getRecentArticles(limit: number) {
  const saved = await withDatabase(async (db) => {
    const section = await db.query('SELECT 1 FROM cms_sections WHERE section = $1', ['writing']);
    if (!section.rowCount) return null;
    const result = await db.query<{ slug: string; title: string; excerpt: string; category: string; categoryId: string; date: string; cover: string }>(
      `SELECT a.slug, a.title, a.excerpt, c.name AS category, a.category_id AS "categoryId",
        to_char(a.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY.MM.DD') AS date, a.cover_url AS cover
       FROM articles a JOIN article_categories c ON c.id = a.category_id
       WHERE a.published ORDER BY a.created_at DESC, a.slug LIMIT $1`,
      [limit],
    );
    return result.rows;
  });
  return saved ?? [...defaults.writing].filter((item) => item._published)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export async function getRecentProjects(limit: number) {
  const saved = await withDatabase(async (db) => {
    const section = await db.query('SELECT 1 FROM cms_sections WHERE section = $1', ['projects']);
    if (!section.rowCount) return null;
    const result = await db.query<{ payload: typeof defaults.projects.items[number]; createdAt: Date; updatedAt: Date }>(
      `SELECT payload, created_at AS "createdAt", updated_at AS "updatedAt" FROM cms_entries WHERE section = 'projects' AND collection = 'items' AND published
       ORDER BY created_at DESC, position, id LIMIT $1`,
      [limit],
    );
    const options = await db.query<{ collection: string; payload: { id: string; name: string } }>(
      "SELECT collection, payload FROM cms_entries WHERE section = 'projects' AND collection IN ('categories', 'statuses') ORDER BY position",
    );
    return resolveProjects({
      items: result.rows.map((row) => ({ ...row.payload, ...recordTimes(row), createdAt: recordTimes(row).createdAt ?? '' })),
      categories: options.rows.filter((row) => row.collection === 'categories').map((row) => row.payload),
      statuses: options.rows.filter((row) => row.collection === 'statuses').map((row) => row.payload),
    }).items;
  });
  return saved ?? newestProjectsFirst(defaults.projects.items.filter((item) => item._published)).slice(0, limit);
}

export async function getWritingArchive(query = '', group = '', page = 1, pageSize: number = contentPageSizes.writing): Promise<WritingArchive & { categories: typeof defaults.categories }> {
  const requestedPage = Math.max(1, Math.trunc(page));
  const search = query.trim().toLowerCase();
  const saved = await withReadDatabase(async (db) => {
    const section = await db.query('SELECT 1 FROM cms_sections WHERE section = $1', ['writing']);
    if (!section.rowCount) return null;
    const categoryRows = await db.query<{ id: string; name: string; description: string; parent_id: string | null }>(
      'SELECT id, name, description, parent_id FROM article_categories ORDER BY position',
    );
    const categories = categoryRows.rows.map((row) => ({ id: row.id, name: row.name, description: row.description, parentId: row.parent_id ?? '' }));
    const branch = group ? [...categoryBranch(categories, group)] : null;
    const matchingCategories = categories.filter((item) => item.name.toLowerCase().includes(search)).map((item) => item.id);
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    const filter = `a.published AND ($1::text[] IS NULL OR a.category_id = ANY($1::text[]))
      AND ($2 = '' OR (a.title || ' ' || a.excerpt || ' ' || a.body) ILIKE $3 ESCAPE '\\' OR a.category_id = ANY($4::text[]))`;
    const [counts, total, matches] = [
      await db.query<{ category_id: string; count: number }>('SELECT category_id, count(*)::int AS count FROM articles WHERE published GROUP BY category_id'),
      await db.query<{ count: number }>('SELECT count(*)::int AS count FROM articles WHERE published'),
      await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM articles a JOIN article_categories c ON c.id = a.category_id WHERE ${filter}`, [branch, search, pattern, matchingCategories]),
    ];
    const currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(matches.rows[0].count / pageSize)));
    const items = await db.query<ArchiveArticle>(`SELECT a.slug, a.title, a.excerpt, a.category_id AS "categoryId",
        c.name AS category, to_char(a.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY.MM.DD') AS date, a.cover_url AS cover
        FROM articles a JOIN article_categories c ON c.id = a.category_id WHERE ${filter}
        ORDER BY a.created_at DESC, a.slug LIMIT $5 OFFSET $6`,
      [branch, search, pattern, matchingCategories, pageSize, (currentPage - 1) * pageSize]);
    return {
      page: currentPage,
      categories,
      items: items.rows,
      total: matches.rows[0].count,
      allCount: total.rows[0].count,
      categoryCounts: Object.fromEntries(counts.rows.map((row) => [row.category_id, row.count])),
    };
  });
  if (saved) return saved;
  const categories = defaults.categories;
  const branch = group ? categoryBranch(categories, group) : null;
  const all = defaults.writing.filter((item) => item._published);
  const filtered = all.filter((item) =>
    (!branch || branch.has(item.categoryId)) &&
    `${item.title} ${item.excerpt} ${item.body} ${item.category}`.toLowerCase().includes(search));
  const counts: Record<string, number> = {};
  for (const article of all) counts[article.categoryId] = (counts[article.categoryId] ?? 0) + 1;
  const currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
  return {
    page: currentPage,
    categories,
    items: filtered.sort((a, b) => b.date.localeCompare(a.date)).slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: filtered.length,
    allCount: all.length,
    categoryCounts: counts,
  };
}

export async function getStoryArchive(page = 1, period?: number): Promise<StoryArchive> {
  const requestedPage = Math.max(1, Math.trunc(page));
  const saved = await withReadDatabase(async (db) => {
    const section = await db.query('SELECT 1 FROM cms_sections WHERE section = $1', ['stories']);
    if (!section.rowCount) return null;
    const [latest, total] = [
      await db.query<{ date: Date | null }>(`SELECT max(occurred_at) AS date FROM cms_entries
        WHERE section = 'stories' AND collection = 'root' AND published`),
      await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM cms_entries
        WHERE section = 'stories' AND collection = 'root' AND published`),
    ];
    const currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(total.rows[0].count / contentPageSizes.stories)));
    const items = await db.query<{ payload: typeof defaults.stories[number] }>(`SELECT payload FROM cms_entries
        WHERE section = 'stories' AND collection = 'root' AND published
        ORDER BY occurred_at DESC NULLS LAST, id LIMIT $1 OFFSET $2`,
      [contentPageSizes.stories, (currentPage - 1) * contentPageSizes.stories]);
    const latestDate = latest.rows[0].date;
    const latestLocal = latestDate ? new Date(latestDate.getTime() + 8 * 3600000) : null;
    const latestPeriod = latestLocal ? latestLocal.getUTCFullYear() * 12 + latestLocal.getUTCMonth() : 2026 * 12 + 8;
    const current = period ?? latestPeriod;
    const year = Math.floor(current / 12);
    const month = current % 12 + 1;
    const shanghaiMidnight = (year: number, zeroBasedMonth: number) =>
      new Date(Date.UTC(year, zeroBasedMonth, 1) - 8 * 3600000).toISOString();
    const yearStart = shanghaiMidnight(year, 0);
    const yearEnd = shanghaiMidnight(year + 1, 0);
    const monthStart = shanghaiMidnight(year, month - 1);
    const monthEnd = shanghaiMidnight(year, month);
    const [yearly, daily] = [
      await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM cms_entries
        WHERE section = 'stories' AND collection = 'root' AND published
        AND occurred_at >= $1 AND occurred_at < $2`, [yearStart, yearEnd]),
      await db.query<{ day: number; count: number }>(`SELECT EXTRACT(DAY FROM occurred_at AT TIME ZONE 'Asia/Shanghai')::int AS day,
        count(*)::int AS count FROM cms_entries
        WHERE section = 'stories' AND collection = 'root' AND published
        AND occurred_at >= $1 AND occurred_at < $2
        GROUP BY day`, [monthStart, monthEnd]),
    ];
    const calendar = monthSummary([], year, month);
    const counts = new Map(daily.rows.map((row) => [row.day, row.count]));
    calendar.days = calendar.days.map((day) => ({ ...day, count: counts.get(day.day) ?? 0 }));
    return {
      page: currentPage,
      items: items.rows.map((row) => row.payload), total: total.rows[0].count,
      yearlyCount: yearly.rows[0].count, latestPeriod, calendar,
    };
  });
  if (saved) return saved;
  const stories = newestStoriesFirst(defaults.stories.filter((item) => item._published));
  const latest = stories[0]?.date ?? '2026-09-01';
  const latestPeriod = Number(latest.slice(0, 4)) * 12 + Number(latest.slice(5, 7)) - 1;
  const current = period ?? latestPeriod;
  const year = Math.floor(current / 12);
  const month = current % 12 + 1;
  const currentPage = Math.min(requestedPage, Math.max(1, Math.ceil(stories.length / contentPageSizes.stories)));
  return {
    page: currentPage,
    items: stories.slice((currentPage - 1) * contentPageSizes.stories, currentPage * contentPageSizes.stories),
    total: stories.length, yearlyCount: stories.filter((story) => story.date.startsWith(`${year}-`)).length,
    latestPeriod, calendar: monthSummary(stories.map((story) => story.date), year, month),
  };
}
