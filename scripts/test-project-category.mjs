import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import pg from 'pg';
import { Window } from 'happy-dom';

registerHooks(await import('./ui-test-loader.mjs'));
const { createElement: h } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { defaults } = await import('../lib/cms-defaults.ts');
const { ContentProvider } = await import('../components/content-provider.tsx');
const { default: ProjectsPage } = await import('../app/projects/page.tsx');

// Exercise the real page data loaders without changing the local CMS database.
const categories = [{ id: 'open', name: '开源项目' }, { id: 'personal', name: '个人工具' }];
const statuses = [{ id: 'live', name: '已上线' }];
const items = Array.from({ length: 7 }, (_, index) => ({
  ...structuredClone(defaults.projects.items[0]),
  id: `project-${index}`,
  title: `项目${index}`,
  categoryId: index % 2 ? 'personal' : 'open',
  category: index === 6 ? '旧分类名称' : '',
  statusId: 'live',
  status: '',
  _published: true,
}));
const row = (payload, collection = 'items') => ({
  section: 'projects', collection, payload, category_id: payload.categoryId,
  createdAt: new Date('2026-10-18T00:00:00Z'),
  updatedAt: new Date('2026-10-18T00:00:00Z'),
});
const options = [
  ...categories.map((item) => row(item, 'categories')),
  ...statuses.map((item) => row(item, 'statuses')),
];
const originalMethods = Object.fromEntries(['connect', 'query', 'end'].map((name) => [
  name, Object.getOwnPropertyDescriptor(pg.Client.prototype, name),
]));
const databaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'postgres://isolated-project-category-test';
pg.Client.prototype.connect = async () => {};
pg.Client.prototype.end = async () => {};
pg.Client.prototype.query = async (sql, params = []) => {
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
  if (sql.includes("collection='items' AND id=$1 AND published"))
    return { rows: items.filter((item) => item.id === params[0]).map((item) => row(item)) };
  if (sql.includes('SELECT section, value, revision FROM cms_sections'))
    return { rows: [{ section: 'projects', value: {}, revision: 1 }] };
  if (sql.includes('FROM article_categories') || sql.includes('FROM articles')) return { rows: [] };
  if (sql.includes('SELECT section, collection, category_id, payload')) return { rows: options };
  if (sql.includes('SELECT collection, payload FROM cms_entries')) return { rows: options };
  if (sql.includes('GROUP BY category_id'))
    return { rows: categories.map((category) => ({ categoryId: category.id, count: items.filter((item) => item.categoryId === category.id).length })) };
  const filtered = items.filter((item) => !params[4] || params[4].includes(item.categoryId));
  if (sql.includes('count(*)')) return { rows: [{ count: params.length === 2 ? items.length : filtered.length }] };
  if (sql.includes('SELECT rank FROM')) return { rows: [{ rank: String(filtered.findIndex((item) => item.id === params[5]) + 1) }] };
  if (sql.includes('LIMIT $6 OFFSET $7'))
    return { rows: filtered.slice(params[6], params[6] + params[5]).map((item) => row(item)) };
  throw new Error(`Unexpected project test query: ${sql}`);
};

try {
  for (const searchParams of [
    {},
    { project: 'project-1' },
    { project: 'project-0' },
    { project: 'project-1' },
    { project: 'project-6' },
    { project: 'project-6', page: '1' },
    { project: 'project-1', category: 'open' },
  ]) {
    const tree = await ProjectsPage({ searchParams: Promise.resolve(searchParams) });
    const html = renderToStaticMarkup(h(ContentProvider, { content: defaults }, tree));
    const window = new Window({ settings: {
      enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true,
    } });
    try {
      window.document.write(html);
      const selected = items.find((item) => item.id === searchParams.project) ?? items[0];
      assert.equal(window.document.querySelector('.folio-title h2')?.textContent, selected.title);
      assert.equal(window.document.querySelector('.folio-facts dd')?.textContent,
        categories.find((category) => category.id === selected.categoryId).name,
        `Project category after opening ${JSON.stringify(searchParams)}`);
      assert.equal(window.document.querySelector('.folio-title > span')?.textContent, '已上线');
    } finally {
      await window.happyDOM.abort();
    }
  }
  console.log('PASS project categories/statuses on initial load, repeated selection, direct links, off-page selection and category filters');
} finally {
  Object.defineProperties(pg.Client.prototype, originalMethods);
  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
}
