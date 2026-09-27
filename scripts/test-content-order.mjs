import { Window } from 'happy-dom';
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
const style = window.document.createElement('style');
style.textContent = readFileSync(
  new URL('../components/admin.css', import.meta.url),
  'utf8',
);
window.document.head.append(style);
for (const name of [
  'window',
  'document',
  'navigator',
  'localStorage',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'Element',
  'Node',
  'NodeFilter',
  'DocumentFragment',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'FocusEvent',
  'MutationObserver',
  'ResizeObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  const value = name === 'window' ? window : window[name];
  Object.defineProperty(globalThis, name, {
    value:
      typeof value === 'function' && !/^[A-Z]/.test(name)
        ? value.bind(window)
        : value,
    configurable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h } = await import('react');
const { render, screen, cleanup, within, waitFor } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');

const { defaults } = await import('../lib/cms-defaults.ts');
const { resolveProjects } = await import('../lib/project-content.ts');
const { stripArticleExtras } = await import('../lib/article-categories.ts');
const { newestArticlesFirst, newestProjectsFirst } =
  await import('../lib/content-order.ts');
const { validateContent } = await import('../lib/cms-validation.ts');
const user = userEvent.setup({ document: window.document });
let realFetch = globalThis.fetch;
try {
  assert.deepEqual(
    stripArticleExtras({
      title: '保留',
      label: '旧内容标签',
      tag: '旧主题标签',
      meta: '9 分钟',
    }),
    { title: '保留' },
  );
  const legacy = structuredClone(defaults.projects);
  delete legacy.items[0].createdAt;
  delete legacy.items[0].url;
  legacy.items[0].role = '旧工作范围';
  const resolvedLegacy = resolveProjects(legacy);
  assert.equal(resolvedLegacy.items[0].createdAt, '');
  assert.equal(resolvedLegacy.items[0].url, '');
  assert.ok(!('role' in resolvedLegacy.items[0]));
  const invalid = structuredClone(defaults.projects);
  invalid.items[0].createdAt = 'not-a-date';
  assert.throws(() => validateContent('projects', invalid), /创建时间/);
  const invalidProjectUrl = structuredClone(defaults.projects);
  invalidProjectUrl.items[0].url = '/project';
  assert.throws(
    () => validateContent('projects', invalidProjectUrl),
    /完整的 http\(s\) 项目网址/,
  );
  const homeArticles = newestArticlesFirst([
    { title: '旧文章', date: '2024.01.01' },
    { title: '最新文章', date: '2026.09.12' },
    { title: '较新文章', date: '2025.06.01' },
  ]);
  assert.deepEqual(
    homeArticles.map((item) => item.title),
    ['最新文章', '较新文章', '旧文章'],
  );
  const homeProjects = newestProjectsFirst([
    { title: '旧项目', createdAt: '2024-01-01T00:00:00.000Z', year: '2024' },
    { title: '最新项目', createdAt: '2026-09-12T00:00:00.000Z', year: '2026' },
    { title: '旧数据项目', createdAt: '', year: '2025 — 2026' },
  ]);
  assert.deepEqual(
    homeProjects.map((item) => item.title),
    ['最新项目', '旧数据项目', '旧项目'],
  );
  const { default: WritingArchivePage } =
    await import('../components/writing-archive-page.tsx');
  const { ProjectShowcase } =
    await import('../components/project-showcase.tsx');
  const { default: StoriesPage } =
    await import('../components/stories-page.tsx');
  const { ContentProvider } =
    await import('../components/content-provider.tsx');
  const { monthSummary } = await import('../lib/story-calendar.ts');
  const articleStore = [];
  const storyStore = [];
  const byDate = (items) => [...items].sort((a, b) => b.date.localeCompare(a.date));
  const pageSlice = (items, page, size) => items.slice((page - 1) * size, page * size);
  realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost:3000');
    if (url.pathname === '/api/writing') {
      const query = url.searchParams.get('q') ?? '';
      const page = Number(url.searchParams.get('page') ?? 1);
      const filtered = byDate(articleStore.filter((item) => !query
        || `${item.title} ${item.excerpt} ${item.body ?? ''} ${item.category}`.includes(query)));
      return Response.json({
        items: pageSlice(filtered, page, 10),
        total: filtered.length,
        allCount: articleStore.length,
        categoryCounts: {},
      });
    }
    if (url.pathname === '/api/stories') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const ordered = byDate(storyStore);
      return Response.json({
        items: pageSlice(ordered, page, 10),
        total: ordered.length,
        yearlyCount: ordered.length,
        latestPeriod: 2026 * 12 + 8,
        calendar: monthSummary(ordered.map((item) => item.date), 2026, 9),
      });
    }
    return realFetch(input, init);
  };
  const writingInitial = (items) => ({
    items: pageSlice(byDate(items), 1, 10),
    total: items.length,
    allCount: items.length,
    categoryCounts: {},
    categories: defaults.categories,
  });
  articleStore.push({
    ...defaults.writing[0],
    label: 'REMOVED_CONTENT_LABEL',
    tag: 'REMOVED_TOPIC_TAG',
    meta: 'REMOVED_READ_TIME',
  });
  render(
    h(
      ContentProvider,
      { content: defaults },
      h(WritingArchivePage, { initial: writingInitial(articleStore) }),
    ),
  );
  for (const text of [
    'REMOVED_CONTENT_LABEL',
    'REMOVED_TOPIC_TAG',
    'REMOVED_READ_TIME',
  ])
    assert.equal(screen.queryByText(text), null);
  cleanup();
  console.log(
    'PASS descending dates, unchanged source order, correct edit targets, new/stable project creation time, legacy timestamps and removed article fields',
  );
  const publicArticles = ['2024.12.31', '2026.09.11', '2025.01.01'].map(
    (date, index) => ({
      ...defaults.writing[0],
      slug: `public-${index}`,
      title: `排序验证 ${index}`,
      date,
    }),
  );
  const sourceOrder = structuredClone(publicArticles);
  articleStore.splice(0, articleStore.length, ...publicArticles);
  render(h(ContentProvider, { content: defaults }, h(WritingArchivePage, {
    initial: writingInitial(publicArticles),
  })));
  const publicTitles = () => Array.from(
    document.querySelectorAll('.writing-list-item h2'),
    (element) => element.textContent,
  );
  assert.deepEqual(publicTitles(), ['排序验证 1', '排序验证 2', '排序验证 0']);
  assert.deepEqual(publicArticles, sourceOrder);
  await user.type(screen.getByRole('textbox', { name: '搜索文章' }), '排序验证');
  await waitFor(() => assert.deepEqual(publicTitles(), ['排序验证 1', '排序验证 2', '排序验证 0']));
  await user.clear(screen.getByRole('textbox', { name: '搜索文章' }));
  await user.type(screen.getByRole('textbox', { name: '搜索文章' }), '无匹配文章');
  await waitFor(() => assert.deepEqual(publicTitles(), []));
  assert.ok(screen.getByText('没有找到匹配的文章，换个关键词试试。'));
  console.log('PASS public writing publication order, search order, empty results and unchanged source data');
  cleanup();

  const publicProjects = {
    ...structuredClone(defaults.projects),
    items: [
      {
        ...structuredClone(defaults.projects.items[0]),
        id: 'old-project',
        title: '旧项目',
        category: '分类甲',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        ...structuredClone(defaults.projects.items[0]),
        id: 'new-project',
        title: '最新项目',
        category: '分类乙',
        url: 'https://example.com/projects/new-project?view=full',
        createdAt: '2026-09-12T00:00:00.000Z',
      },
      {
        ...structuredClone(defaults.projects.items[0]),
        id: 'middle-project',
        title: '较新项目',
        category: '分类甲',
        createdAt: '2025-06-01T00:00:00.000Z',
      },
    ],
  };
  const publicProjectSourceOrder = structuredClone(publicProjects.items);
  render(
    h(
      ContentProvider,
      { content: { ...defaults, projects: publicProjects } },
      h(ProjectShowcase, { initialId: 'new-project' }),
    ),
  );
  const publicProjectTitles = () =>
    Array.from(document.querySelectorAll('.folio-project h2'), (element) =>
      element.textContent.replace('↗', ''),
    );
  assert.deepEqual(publicProjectTitles(), ['最新项目', '较新项目', '旧项目']);
  assert.deepEqual(publicProjects.items, publicProjectSourceOrder);
  assert.ok(screen.getByRole('region', { name: '项目分类筛选' }));
  assert.ok(screen.getByText('项目分类'));
  assert.equal(
    screen.getByRole('link', {
      name: 'https://example.com/projects/new-project?view=full',
    }).href,
    'https://example.com/projects/new-project?view=full',
  );
  assert.equal(screen.queryByRole('button', { name: /进行中/ }), null);
  await user.click(screen.getByRole('button', { name: /分类甲\s*2/ }));
  assert.deepEqual(publicProjectTitles(), ['较新项目', '旧项目']);
  assert.equal(document.querySelector('.folio-title h2').textContent, '较新项目');
  cleanup();
  console.log(
    'PASS public projects filter by category and render newest creation time first without mutating source data',
  );

  const pagedArticles = Array.from({ length: 12 }, (_, index) => ({
    ...defaults.writing[0],
    slug: `paged-article-${index}`,
    title: `分页文章 ${index}`,
    date: `2026.09.${String(index + 1).padStart(2, '0')}`,
  }));
  articleStore.splice(0, articleStore.length, ...pagedArticles);
  render(
    h(
      ContentProvider,
      { content: defaults },
      h(WritingArchivePage, { initial: writingInitial(pagedArticles) }),
    ),
  );
  assert.equal(document.querySelectorAll('.writing-list-item').length, 10);
  const writingPagination = screen.getByRole('navigation', {
    name: '文章分页',
  });
  assert.match(writingPagination.textContent, /第 1 \/ 2 页/);
  await user.click(
    within(writingPagination).getByRole('button', { name: '下一页' }),
  );
  await waitFor(() => assert.equal(document.querySelectorAll('.writing-list-item').length, 2));
  assert.match(writingPagination.textContent, /第 2 \/ 2 页/);
  await user.type(
    screen.getByRole('textbox', { name: '搜索文章' }),
    '分页文章',
  );
  await waitFor(() => assert.equal(document.querySelectorAll('.writing-list-item').length, 10));
  assert.match(writingPagination.textContent, /第 1 \/ 2 页/);
  cleanup();

  const pagedProjects = {
    ...structuredClone(defaults.projects),
    items: Array.from({ length: 6 }, (_, index) => ({
      ...structuredClone(defaults.projects.items[0]),
      id: `paged-project-${index}`,
      title: `分页项目 ${index}`,
    })),
  };
  render(
    h(
      ContentProvider,
      {
        content: { ...defaults, projects: pagedProjects },
      },
      h(ProjectShowcase, { initialId: pagedProjects.items[0].id }),
    ),
  );
  assert.equal(document.querySelectorAll('.folio-project').length, 5);
  const projectPagination = screen.getByRole('navigation', {
    name: '项目分页',
  });
  await user.click(
    within(projectPagination).getByRole('button', { name: '下一页' }),
  );
  assert.equal(document.querySelectorAll('.folio-project').length, 1);
  assert.equal(
    document.querySelector('.folio-title h2').textContent,
    '分页项目 5',
  );
  cleanup();

  const pagedStories = Array.from({ length: 11 }, (_, index) => ({
    ...structuredClone(defaults.stories[0]),
    id: `paged-story-${index}`,
    text: `分页说说 ${index}`,
    date: `2026-09-${String(index + 1).padStart(2, '0')}T12:00:00+08:00`,
  }));
  storyStore.splice(0, storyStore.length, ...pagedStories);
  const storyPeriod = 2026 * 12 + 8;
  render(
    h(
      ContentProvider,
      { content: defaults },
      h(StoriesPage, {
        initial: {
          items: pageSlice(pagedStories, 1, 10),
          total: pagedStories.length,
          yearlyCount: pagedStories.length,
          latestPeriod: storyPeriod,
          calendar: monthSummary(pagedStories.map((item) => item.date), 2026, 9),
        },
      }),
    ),
  );
  assert.equal(document.querySelectorAll('.story-post').length, 10);
  const storyPagination = screen.getByRole('navigation', { name: '说说分页' });
  await user.click(
    within(storyPagination).getByRole('button', { name: '下一页' }),
  );
  await waitFor(() => assert.equal(document.querySelectorAll('.story-post').length, 1));
  assert.match(storyPagination.textContent, /第 2 \/ 2 页/);
  console.log(
    'PASS public writing, project and story pagination page sizes and navigation',
  );
} finally {
  cleanup();
  globalThis.fetch = realFetch;
  await window.happyDOM.abort();
}
