import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Window } from 'happy-dom';
register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
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
const { render, screen, within, waitFor, cleanup } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { defaults } = await import('../lib/cms-defaults.ts');
const { publicCollectionSizes } = await import('../lib/public-collections.ts');
const { musicSample } = await import('../lib/music-content.ts');
const { bookSample } = await import('../lib/book-content.ts');
const { filmSample } = await import('../lib/film-content.ts');
const { podcastSample } = await import('../lib/podcast-content.ts');
const { activitySample } = await import('../lib/activity-content.ts');
const { ContentProvider } = await import('../components/content-provider.tsx');
const { MusicProvider } = await import('../components/music-player.tsx');
const { MusicLibrary } = await import('../components/music-library.tsx');
const { AiNotebook } = await import('../components/ai-notebook.tsx');
const { ResearchHub } = await import('../components/research-hub.tsx');
const { ProjectShowcase } = await import('../components/project-showcase.tsx');
const { Bookshelf } = await import('../components/bookshelf.tsx');
const { BooklistGallery } = await import('../components/booklist-gallery.tsx');
const { FilmLibrary } = await import('../components/film-library.tsx');
const { PodcastLibrary } = await import('../components/podcast-library.tsx');
const { ActivityLibrary } = await import('../components/activity-library.tsx');
const { BookmarkDirectory } =
  await import('../components/bookmark-directory.tsx');
const { FriendDirectory } = await import('../components/friend-directory.tsx');
const { default: WritingPage } =
  await import('../components/writing-archive-page.tsx');
const user = userEvent.setup({ document: window.document });
window.HTMLMediaElement.prototype.play = async function () {};
window.HTMLMediaElement.prototype.pause = function () {};
window.HTMLMediaElement.prototype.load = function () {};
const cases = [
  ['ai.agents', AiNotebook, '智能体', '.ai-agent-card', '智能体分页'],
  ['ai.skills', AiNotebook, '技能 Skills', '.ai-skill-row', '技能分页'],
  ['ai.relays', AiNotebook, '中转站 API', '.ai-relay-card', '中转站分页'],
  [
    'investing.entries',
    ResearchHub,
    null,
    '.investment-article-list button',
    '投资目录分页',
  ],
  [
    'projects.items',
    ProjectShowcase,
    null,
    '.folio-project-list button',
    '项目分页',
  ],
  ['books.items', Bookshelf, null, '.reading-book', '书籍分页'],
  ['books.lists', BooklistGallery, null, '.booklist-card', '主题书单分页'],
  ['tracks.items', MusicLibrary, null, '.music-track-row', '音乐内容分页'],
  [
    'tracks.playlists',
    MusicLibrary,
    '我的歌单',
    '.music-playlist-card',
    '音乐内容分页',
  ],
  ['films.items', FilmLibrary, null, '.cinema-program-list > li', '电影分页'],
  ['podcasts.items', PodcastLibrary, null, '.podcast-card', '播客分页'],
  ['travel.items', ActivityLibrary, null, '.activity-card', '旅行分页'],
  ['hobbies.items', ActivityLibrary, null, '.activity-card', '爱好分页'],
  ['bookmarks.items', BookmarkDirectory, null, '.bookmark-card', null],
  ['friends.items', FriendDirectory, null, '.friend-card', null],
];
try {
  for (const [key, Component, tab, selector, pagination] of cases) {
    const [section, collection] = key.split('.');
    const size = publicCollectionSizes[key];
    const doc = structuredClone(defaults);
    const templates = {
      tracks: musicSample,
      books: bookSample,
      films: filmSample,
      podcasts: podcastSample,
      travel: activitySample,
      hobbies: activitySample,
    };
    const sample =
      section === 'investing'
        ? doc.investing.sections[0].entries[0]
        : (doc[section][collection][0] ??
          templates[section]?.[collection]?.[0]);
    const items = Array.from({ length: size + 1 }, (_, i) => ({
      ...structuredClone(sample),
      id: `remote-${i}`,
      ...('name' in sample
        ? { name: `remote-${i}` }
        : { title: `remote-${i}` }),
      ...(section === 'investing'
        ? { sectionId: doc.investing.sections[0].id }
        : {}),
      ...(section === 'projects'
        ? { createdAt: '2026-01-01T00:00:00.000Z' }
        : {}),
    }));
    const page = {
      items: items.slice(0, size),
      total: items.length,
      allCount: items.length,
      searchTotal: items.length,
      categoryCounts: {},
      page: 1,
    };
    if (section === 'investing')
      doc.investing.sections.forEach((group, index) => {
        group.entries = index === 0 ? page.items : [];
      });
    else doc[section][collection] = page.items;
    const props =
      section === 'projects'
        ? { initialId: items[0].id }
        : section === 'travel' || section === 'hobbies'
          ? { section }
          : key === 'books.lists'
            ? { lists: page.items }
            : {};
    const requests = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input, 'http://localhost:3000');
      if (url.pathname === '/api/ai/models')
        return Response.json({
          groups: [],
          modelCount: 0,
          fetchedAt: '2026-01-01',
          stale: false,
          refreshFailed: false,
        });
      assert.equal(url.pathname, `/api/public/${section}/${collection}`);
      requests.push(Number(url.searchParams.get('page')));
      return Response.json({ ...page, items: items.slice(size), page: 2 });
    };
    const child = h(
      ContentProvider,
      { content: doc, archives: { [key]: page } },
      h(Component, props),
    );
    if (section === 'tracks') {
      const queue = structuredClone(doc);
      if (collection === 'items') queue.tracks.items = items;
      render(
        h(ContentProvider, { content: queue }, h(MusicProvider, null, child)),
      );
    } else render(child);
    if (tab)
      await user.click(
        screen.getByRole('tab', { name: new RegExp(`^${String(tab)}`) }),
      );
    assert.equal(
      document.querySelectorAll(selector).length,
      size,
      `${String(key)} initial page`,
    );
    if (pagination)
      await user.click(
        within(screen.getByRole('navigation', { name: pagination })).getByRole(
          'button',
          { name: '下一页' },
        ),
      );
    else
      await user.click(
        screen.getByRole('button', {
          name: key === 'bookmarks.items' ? /再显示/ : /再看看/,
        }),
      );
    await waitFor(() =>
      assert.equal(
        document.querySelectorAll(selector).length,
        pagination ? 1 : size + 1,
      ),
    );
    assert.deepEqual(requests, [2], `${String(key)} fetches its next page`);
    assert.ok(
      [...document.querySelectorAll(selector)].some((node) =>
        node.textContent.includes(`remote-${String(size)}`),
      ),
      `${String(key)} renders the response`,
    );
    cleanup();
  }
  const initial = {
    items: [defaults.writing[0]],
    total: 9,
    allCount: 9,
    categoryCounts: {},
    categories: defaults.categories,
  };
  const writingRequests = [];
  globalThis.fetch = async (input) => {
    const requested = new URL(input, 'http://localhost:3000').searchParams.get(
      'page',
    );
    writingRequests.push(requested);
    return Response.json({
      ...initial,
      items: [defaults.writing[0]],
      total: 8,
      allCount: 8,
      page: 1,
    });
  };
  render(
    h(ContentProvider, { content: defaults }, h(WritingPage, { initial })),
  );
  await user.click(screen.getByRole('button', { name: '下一页' }));
  await waitFor(() =>
    assert.match(
      screen.getByRole('navigation', { name: '文章分页' }).textContent,
      /第 1 \/ 1 页/,
    ),
  );
  assert.ok(
    screen.getByRole('link', { name: `阅读：${defaults.writing[0].title}` }),
  );
  assert.equal(writingRequests[0], '2');
  cleanup();
  console.log(
    'PASS remote pagination in all 15 actual public list components, append behavior and usable writing page after data shrink',
  );
} finally {
  cleanup();
  await window.happyDOM.abort();
}
