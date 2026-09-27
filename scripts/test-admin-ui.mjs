import { Window } from 'happy-dom';
import { register } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

register('./ui-test-loader.mjs', import.meta.url);
const window = new Window({ url: 'http://localhost:3000' });
window.confirm = () => true;
const style = window.document.createElement('style');
style.textContent = readFileSync(
  new URL('../components/admin.css', import.meta.url),
  'utf8',
);
const lifeCss = readFileSync(
  new URL('../components/life.css', import.meta.url),
  'utf8',
);
const lifeStyle = window.document.createElement('style');
lifeStyle.textContent = lifeCss;
window.document.head.append(lifeStyle, style);
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
const { createElement: h, useState } = await import('react');
const { render, screen, cleanup, waitFor, within, fireEvent } =
  await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { AdminModelSelect } =
  await import('../components/admin-model-select.tsx');
const { AdminAiSettings } = await import('../components/admin-ai-settings.tsx');
const { WritingCategoryTree } =
  await import('../components/writing-category-tree.tsx');
const { migrateProjects } = await import('../lib/project-content.ts');
const { ContentProvider } = await import('../components/content-provider.tsx');
const { StoryGallery } = await import('../components/story-gallery.tsx');
const { LifePageHeader } = await import('../components/life-page-header.tsx');
const { AdminMarkdownEditor } =
  await import('../components/admin-markdown-editor.tsx');
const { defaults } = await import('../lib/cms-defaults.ts');
const user = userEvent.setup({ document: window.document });
const categories = [
  { id: 'root', parentId: '', name: '开发', description: '' },
  { id: 'child', parentId: 'root', name: '前端', description: '' },
];
const article = {
  slug: 'ui-check',
  title: '测试文章',
  excerpt: '摘要',
  body: '## 正文',
  categoryId: 'child',
  category: '前端',
  date: '2026.09.08',
  cover: '',
  coverMode: 'upload',
  coverGeneratedFor: '',
  _published: false,
  label: '',
  tag: '',
  meta: '',
};
try {
  render(
    h(
      ContentProvider,
      { content: defaults },
      h(StoryGallery, {
        images: [{ src: '/story-test.png', alt: '不应作为说明展示' }],
      }),
    ),
  );
  await user.click(
    screen.getByRole('button', { name: '放大查看：不应作为说明展示' }),
  );
  const storyDialog = await screen.findByRole('dialog');
  assert.equal(within(storyDialog).queryByText('不应作为说明展示'), null);
  assert.ok(within(storyDialog).getByText('1 / 1', { selector: 'output' }));
  cleanup();
  console.log(
    'PASS story image descriptions stay hidden in admin and public gallery',
  );
  const lifeHeaders = [
    ['music', '音乐', '让声音留在日常里，也留一点空白给自己。'],
    ['films', '电影', '电影散场以后，故事仍在心里继续。'],
    ['podcasts', '播客', '给问题多一点时间，给不同声音一个座位。'],
    ['travel', '旅行', '走得慢一点，沿途才会真正出现。'],
    ['hobbies', '爱好', '不为擅长，只是愿意再次开始。'],
    ['books', '书籍', '一本一本地读，一点一点地积累。'],
  ];
  render(
    h(
      ContentProvider,
      { content: defaults },
      h(
        'div',
        null,
        ...lifeHeaders.map(([kind, title]) =>
          h(LifePageHeader, {
            key: kind,
            kind,
            title,
            intro: `${title}页面简介`,
          }),
        ),
      ),
    ),
  );
  for (const [, title, copy] of lifeHeaders) {
    const header = screen
      .getByRole('heading', { name: title })
      .closest('header');
    assert.ok(
      within(header)
        .getByRole('complementary')
        .textContent.replace(/\s+/g, '')
        .includes(copy),
    );
  }
  assert.match(
    lifeCss,
    /@media \(max-width: 700px\)[\s\S]*?\.life-page-heading-aside \{ display: none; \}/,
  );
  cleanup();
  console.log(
    'PASS shared life headers include per-page aside copy and hide the aside on mobile',
  );
  render(
    h(
      'div',
      { className: 'admin-shell' },
      h(AdminMarkdownEditor, {
        label: '预览测试',
        value: '1. 有序项\n2. 第二项\n\n- 无序项\n  - 嵌套项\n\n- [ ] 任务项',
        onChange: () => {},
      }),
    ),
  );
  await screen.findByRole('textbox', { name: '预览测试 Markdown' });
  const preview = window.document.querySelector('.wmde-markdown');
  assert.equal(
    window.getComputedStyle(preview.querySelector('ol')).listStyleType,
    'decimal',
  );
  assert.equal(
    window.getComputedStyle(preview.querySelector('ul')).listStyleType,
    'disc',
  );
  assert.equal(
    window.getComputedStyle(preview.querySelector('ul ul')).listStyleType,
    'circle',
  );
  assert.equal(
    window.getComputedStyle(preview.querySelector('li')).display,
    'list-item',
  );
  assert.equal(
    window.getComputedStyle(preview.querySelector('.task-list-item'))
      .listStyleType,
    'none',
  );
  cleanup();
  console.log('PASS Markdown ordered, unordered, nested and task list styles');
  let picked = '';
  render(
    h(WritingCategoryTree, {
      categories: [
        ...categories,
        { id: 'empty', parentId: 'child', name: '空分类' },
      ],
      articles: [article],
      selected: '',
      onSelect: (id) => {
        picked = id;
      },
    }),
  );
  const emptyCategory = screen.getByRole('button', { name: '空分类 0' });
  assert.equal(emptyCategory.closest('ul').parentElement.tagName, 'LI');
  await user.click(emptyCategory);
  assert.equal(picked, 'empty');
  assert.ok(screen.getByRole('button', { name: '开发 1' }));
  cleanup();
  console.log(
    'PASS public category tree includes empty descendants and aggregates parent article counts',
  );
  const legacyProject = {
    id: 'demo',
    title: '测试项目',
    subtitle: '副标题',
    status: '进行中',
    category: '工具',
    year: '2026',
    role: '开发',
    description: '摘要',
    images: [{ src: '/test.png', alt: '', label: '' }],
    tags: [],
    number: '01',
    question: '旧问题',
    decisions: [],
    steps: [],
    next: '旧下一步',
  };
  const migratedProjects = migrateProjects([legacyProject]);
  assert.equal(migratedProjects.items[0].url, '');
  assert.ok(!('role' in migratedProjects.items[0]));
  for (const key of ['number', 'question', 'decisions', 'steps', 'next'])
    assert.ok(!(key in migratedProjects.items[0]));
  function Models() {
    const [value, set] = useState('gpt-current');
    return h(AdminModelSelect, {
      id: 'model',
      label: '文本模型',
      value,
      models: ['gpt-current', 'another-model'],
      onChange: set,
    });
  }
  render(h(Models));
  await user.click(screen.getByRole('combobox', { name: '文本模型' }));
  assert.ok(await screen.findByRole('option', { name: 'another-model' }));
  assert.equal(screen.getByLabelText('搜索文本模型或输入自定义名称').value, '');
  await user.type(
    screen.getByLabelText('搜索文本模型或输入自定义名称'),
    'another',
  );
  await user.click(screen.getByRole('option', { name: 'another-model' }));
  assert.match(
    screen.getByRole('combobox', { name: '文本模型' }).textContent,
    /another-model/,
  );
  await user.click(screen.getByRole('combobox', { name: '文本模型' }));
  assert.ok(await screen.findByRole('option', { name: 'gpt-current' }));
  await user.type(
    screen.getByLabelText('搜索文本模型或输入自定义名称'),
    'custom-model',
  );
  await user.keyboard('{ArrowDown}{Enter}');
  await waitFor(() =>
    assert.match(
      screen.getByRole('combobox', { name: '文本模型' }).textContent,
      /custom-model/,
    ),
  );
  cleanup();
  console.log(
    'PASS model menu opens all options without clearing selection, search and keyboard custom selection',
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keyConfigured: true });
  function Settings() {
    const [value, set] = useState({
      ...defaults.aiSettings,
      filmCoverStyle: '胶片',
      filmCoverPrompt: '{{title}} {{director}}',
      playlistCoverStyle: '唱片',
      playlistCoverPrompt: '{{title}} {{excerpt}}',
      baseUrl: 'https://example.com/v1',
      textModel: 'text',
      imageModel: 'image',
      projectImageStyle: '项目纸艺',
      projectImagePrompt: '{{title}} {{subtitle}} {{excerpt}}',
      storyImageStyle: '说说纪实',
      storyImagePrompt: '{{title}} {{excerpt}} {{style}}',
      coverStyle: '纸艺',
      coverPrompt: '{{title}} {{excerpt}}',
    });
    return h(AdminAiSettings, { value, onChange: set, dirty: false });
  }
  render(h(Settings));
  await user.click(screen.getByRole('tab', { name: '写作配置' }));
  assert.equal(screen.getByLabelText('文章封面尺寸').value, '1536x1024');
  await user.clear(screen.getByLabelText('文章封面尺寸'));
  await user.type(screen.getByLabelText('文章封面尺寸'), '2048x1152');
  await user.type(screen.getByLabelText('文章封面风格'), ' 新风格');
  await user.click(screen.getByRole('tab', { name: '模型配置' }));
  assert.ok(screen.getByLabelText('API Base URL'));
  await user.click(screen.getByRole('tab', { name: '写作配置' }));
  assert.equal(screen.getByLabelText('文章封面风格').value, '纸艺 新风格');
  assert.equal(screen.getByLabelText('文章封面尺寸').value, '2048x1152');
  await user.click(screen.getByRole('tab', { name: '电影配置' }));
  await user.type(screen.getByLabelText('电影封面风格'), ' 黑白');
  await user.click(screen.getByRole('tab', { name: '模型配置' }));
  await user.click(screen.getByRole('tab', { name: '电影配置' }));
  assert.equal(screen.getByLabelText('电影封面风格').value, '胶片 黑白');
  const settingTabs = screen
    .getAllByRole('tab')
    .map((node) => node.textContent);
  assert.equal(
    settingTabs.indexOf('说说配置'),
    settingTabs.indexOf('项目配置') + 1,
  );
  assert.equal(
    settingTabs.indexOf('歌单配置'),
    settingTabs.indexOf('说说配置') + 1,
  );
  await user.click(screen.getByRole('tab', { name: '说说配置' }));
  await user.type(screen.getByLabelText('说说图片风格'), ' 自然光');
  await user.click(screen.getByRole('tab', { name: '项目配置' }));
  await user.click(screen.getByRole('tab', { name: '说说配置' }));
  assert.equal(screen.getByLabelText('说说图片风格').value, '说说纪实 自然光');
  assert.match(
    screen.getByLabelText('说说图片生成提示词').value,
    /\{\{title\}\}.*\{\{excerpt\}\}/,
  );
  await user.click(screen.getByRole('tab', { name: '歌单配置' }));
  await user.type(screen.getByLabelText('歌单封面风格'), ' 复古');
  await user.click(screen.getByRole('tab', { name: '电影配置' }));
  await user.click(screen.getByRole('tab', { name: '歌单配置' }));
  assert.equal(screen.getByLabelText('歌单封面风格').value, '唱片 复古');
  for (const [tab, label, expected] of [
    ['项目配置', '项目图片尺寸', '1536x1024'],
    ['说说配置', '说说图片尺寸', '1536x1024'],
    ['歌单配置', '歌单封面尺寸', '1024x1024'],
    ['电影配置', '电影封面尺寸', '864x1536'],
    ['播客配置', '播客封面尺寸', '1536x1024'],
    ['旅行配置', '旅行封面尺寸', '1536x1024'],
    ['爱好配置', '爱好封面尺寸', '1536x1024'],
    ['书籍配置', '书籍封面尺寸', '1024x1536'],
    ['书单配置', '书单封面尺寸', '1536x1024'],
  ]) {
    await user.click(screen.getByRole('tab', { name: tab }));
    assert.equal(screen.getByLabelText(label).value, expected);
  }

  cleanup();
  globalThis.fetch = originalFetch;
  const { AdminApiSettings } =
    await import('../components/admin-api-settings.tsx');
  let credentialStatus = { configured: true, source: 'environment' };
  let savedCredential = '';
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(url, '/api/admin/api-settings');
    if (init.method === 'PUT') {
      savedCredential = JSON.parse(init.body).apiKey;
      credentialStatus = { configured: true, source: 'admin' };
    } else if (init.method === 'DELETE') {
      credentialStatus = { configured: true, source: 'environment' };
    }
    return Response.json({ artificialAnalysis: credentialStatus });
  };
  render(h(AdminApiSettings));
  await waitFor(() => assert.match(document.body.textContent, /AA_API_KEY 环境变量已配置/));
  await user.type(screen.getByLabelText('API 密钥'), 'test-key-only');
  await user.click(screen.getByRole('button', { name: '保存密钥' }));
  await waitFor(() => assert.equal(savedCredential, 'test-key-only'));
  assert.equal(screen.getByLabelText('API 密钥').value, '');
  assert.match(document.body.textContent, /后台密钥已配置/);
  assert.doesNotMatch(document.body.textContent, /test-key-only/);
  await user.click(screen.getByRole('button', { name: '清除后台密钥' }));
  await waitFor(() => assert.match(document.body.textContent, /AA_API_KEY 环境变量已配置/));
  cleanup();
  globalThis.fetch = originalFetch;
  console.log('PASS AI settings tabs, write-only API key input, environment fallback and retained unsaved image configuration');

  const { AiNotebook } = await import('../components/ai-notebook.tsx');
  const { aiAgents, aiSkills, aiRelays } =
    await import('../lib/ai-resources.ts');
  const originalAiFetch = globalThis.fetch;
  let modelRequests = 0;
  const sampleModel = (id, name) => ({
    id,
    name,
    releaseDate: '2026-09-24',
    intelligence: 71.2,
    coding: 64.3,
    agentic: 58.1,
    inputPrice: 0.4,
    outputPrice: 2,
    outputSpeed: 120,
  });
  const smallProviderSet = [
    { provider: 'OpenAI', models: [sampleModel('gpt6-low', 'GPT-6 Sol (low)')] },
    { provider: 'Anthropic', models: [sampleModel('claude', 'Claude Example')] },
  ];
  const largeProviderSet = Array.from({ length: 9 }, (_, index) => ({
    provider: `厂商 ${index + 1}`,
    models: [sampleModel(`vendor-${index + 1}`, `Vendor Model ${index + 1}`)],
  }));
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/ai/models');
    assert.equal(init.cache, 'no-store');
    modelRequests += 1;
    return Response.json({
      groups: modelRequests === 1 ? smallProviderSet : largeProviderSet,
      fetchedAt: '2026-09-24T16:45:17.263Z',
      stale: false,
      refreshFailed: false,
      modelCount: modelRequests === 1 ? 2 : 9,
    });
  };
  const aiView = render(h(ContentProvider, { content: defaults }, h(AiNotebook)));
  const aiNames = ['大模型数据', '智能体', '技能 Skills', '中转站 API'];
  assert.deepEqual(
    screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label')),
    aiNames,
  );
  assert.equal(
    screen.queryByRole('tab', { name: '模型价格', exact: true }),
    null,
  );
  function activeRegion(name) {
    assert.equal(screen.getAllByRole('tabpanel').length, 1);
    assert.equal(
      screen.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'),
      'true',
    );
    const regionName = name === '智能体' ? '智能体 AI Agent' : name;
    return screen.getByRole('region', { name: regionName, exact: true });
  }
  async function switchAi(name) {
    await user.click(screen.getByRole('tab', { name, exact: true }));
    return activeRegion(name);
  }
  const modelRegion = activeRegion('大模型数据');
  await waitFor(() => {
    assert.equal(modelRequests, 1);
    assert.equal(
      within(modelRegion).getAllByText('GPT-6 Sol (low)').length,
      2,
    );
  });
  assert.ok(within(modelRegion).getByRole('navigation', { name: '厂商列表' }));
  await user.click(within(modelRegion).getByRole('button', { name: /Anthropic/ }));
  assert.equal(within(modelRegion).getAllByText('Claude Example').length, 2);
  await user.click(within(modelRegion).getByRole('button', { name: /OpenAI/ }));
  assert.match(within(modelRegion).getByText(/数据更新于/).textContent, /数据更新于/);
  assert.equal(
    within(modelRegion).getByText('按厂商整理的模型基准、发布日期、价格与输出速度。').textContent,
    '按厂商整理的模型基准、发布日期、价格与输出速度。',
  );
  assert.equal(within(modelRegion).queryByRole('link', { name: /Artificial Analysis/ }), null);
  assert.equal(within(modelRegion).queryByRole('button', { name: '重新读取大模型数据' }), null);
  const agentRegion = await switchAi('智能体');
  assert.equal(within(agentRegion).getAllByRole('article').length, aiAgents.length);
  const skillRegion = await switchAi('技能 Skills');
  assert.equal(within(skillRegion).getAllByRole('article').length, aiSkills.length);
  const relayRegion = await switchAi('中转站 API');
  assert.equal(within(relayRegion).getAllByRole('article').length, aiRelays.length);
  const refreshedModelRegion = await switchAi('大模型数据');
  await waitFor(() => {
    assert.equal(modelRequests, 2);
    assert.ok(within(refreshedModelRegion).getByLabelText('选择模型厂商'));
  });
  const providerSelect = within(refreshedModelRegion).getByLabelText('选择模型厂商');
  assert.equal(providerSelect.options.length, 9);
  await user.selectOptions(providerSelect, '厂商 2');
  assert.equal(within(refreshedModelRegion).getAllByText('Vendor Model 2').length, 2);
  assert.equal(screen.getAllByRole('button', { name: /赫兹$/ }).length, 25);
  await user.click(screen.getByRole('button', { name: /^C4 / }));
  assert.match(
    screen.getByRole('status', { name: '当前音符' }).textContent ?? '',
    /C4 · 261\.6 Hz/,
  );
  aiView.unmount();
  const managedAi = { agents: [], skills: [{ ...defaults.ai.skills[0], id: 'custom-skill', title: '后台技能', category: '后台分类', subcategory: '自定义子类' }], relays: [{ ...defaults.ai.relays[0], id: 'custom-relay', name: '后台中转站', logo: '/missing-logo.png', mark: 'TEST', href: 'https://example.com/' + 'long-path/'.repeat(30) }] };
  const managedView = render(h(ContentProvider, { content: { ...defaults, ai: managedAi } }, h(AiNotebook)));
  await switchAi('智能体');
  assert.ok(screen.getByText('暂无智能体内容。'));
  await switchAi('技能 Skills');
  assert.ok(screen.getByText('后台分类', { exact: true }));
  assert.ok(screen.getByText('后台技能'));
  assert.ok(screen.getByRole('link', { name: '查看技能' }));
  await switchAi('中转站 API');
  const relayCard = screen.getByRole('article');
  assert.ok(within(relayCard).getByText('后台中转站'));
  const website = relayCard.querySelector('.ai-relay-url');
  assert.equal(website.title, managedAi.relays[0].href);
  assert.equal(website.href, within(relayCard).getByRole('link', { name: '前往 后台中转站' }).href);
  fireEvent.error(relayCard.querySelector('img'));
  assert.ok(within(relayCard).getByText('TEST'));
  managedView.unmount();
  const { ResearchHub } = await import('../components/research-hub.tsx');
  const oldEntry = { ...defaults.investing.sections[0].entries[0], id: 'old', title: '同名文章', createdAt: null, paragraphs: ['历史正文'] };
  const firstEntry = { ...oldEntry, id: 'first', createdAt: '2026-09-25T00:00:00.000Z', paragraphs: ['## 完整正文\n\n| 列一 | 列二 |\n| --- | --- |\n| A | B |\n\n- 列表项目\n\n> 引用内容\n\n```js\nconst value = 1;\n```\n\n<script>alert(1)</script>'] };
  const newestEntry = { ...oldEntry, id: 'newest', createdAt: '2026-09-26T00:00:00.000Z', paragraphs: ['最新正文'] };
  const investingDoc = { ...defaults.investing, sections: [
    { id: 'trends', title: '改名后的栏目', description: '', entries: [oldEntry, firstEntry] },
    { id: 'review', title: '投资分享', description: '', entries: [newestEntry] },
    { id: 'new-column', title: '新栏目', description: '', entries: [] },
  ] };
  render(h(ContentProvider, { content: { ...defaults, investing: investingDoc } }, h(ResearchHub, { type: 'investing' })));
  const reader = () => document.querySelector('#investment-article');
  const listButtons = () => within(screen.getByRole('navigation', { name: '投资文章列表' })).getAllByRole('button');
  assert.ok(reader().textContent.includes('最新正文'));
  assert.equal(listButtons()[0].getAttribute('aria-pressed'), 'true');
  await user.click(listButtons()[1]);
  assert.ok(reader().querySelector('table'));
  assert.ok(reader().querySelector('blockquote'));
  assert.ok(reader().querySelector('ul'));
  assert.ok(reader().querySelector('pre code'));
  assert.equal(reader().querySelector('script'), null);
  await user.click(listButtons()[2]);
  assert.ok(reader().textContent.includes('历史正文'), '同名文章依靠 ID 切换');
  await user.click(screen.getByRole('button', { name: /改名后的栏目/ }));
  assert.ok(reader().querySelector('table'), '栏目内默认选择时间最新的一篇');
  await user.click(screen.getByRole('button', { name: /改名后的栏目/ }));
  assert.ok(reader().textContent.includes('最新正文'));
  await user.click(screen.getByRole('button', { name: /新栏目/ }));
  assert.equal(reader().textContent, '暂无文章');
  assert.equal(reader().querySelector('h2'), null);
  assert.equal(screen.queryByRole('button', { name: '同名文章', exact: true }), null);
  cleanup();
  console.log('PASS managed AI resources/categories/empty/logo fallback and investing dynamic columns/newest order/same-title selection/Markdown/empty filter');
  globalThis.fetch = originalAiFetch;
  cleanup();
  console.log(
    'PASS model data first, pricing tab removed, concise heading, responsive model fields, refresh on every visit, remaining AI tabs and piano',
  );
  const { ActivityLibrary } = await import('../components/activity-library.tsx');
  const { Bookshelf } = await import('../components/bookshelf.tsx');
  const { PodcastLibrary } = await import('../components/podcast-library.tsx');
  const { FilmLibrary } = await import('../components/film-library.tsx');
  const { MusicLibrary } = await import('../components/music-library.tsx');
  const { MusicProvider } = await import('../components/music-player.tsx');
  const { migrateActivities } = await import('../lib/activity-content.ts');
  const { migrateBooks } = await import('../lib/book-content.ts');
  const { migratePodcasts } = await import('../lib/podcast-content.ts');
  const { migrateFilms } = await import('../lib/film-content.ts');
  const { musicSample, migrateMusic, publicMusic } = await import('../lib/music-content.ts');
  const { validateContent: validateCollections } = await import('../lib/cms-validation.ts');
  const legacyActivity = migrateActivities({ title: '旅行', intro: '', entries: [{ id: 'legacy', title: '旧记录', category: '城市', subtitle: '旧副标题', description: '旧简介', body: ['第一段', '第二段'], _published: false }] });
  assert.equal(legacyActivity.items[0].body, '第一段\n\n第二段');
  assert.equal(legacyActivity.items[0]._published, false);
  const legacyBooks = migrateBooks([{ id: 'old', title: '旧书', author: '作者', category: '文学', status: '读过', color: '#123456', note: '旧笔记', _published: false }], [{ id: 'old-list', title: '旧书单', description: '简介', label: '旧标签', ids: ['old'], _published: false }]);
  assert.equal(legacyBooks.items[0].note, '旧笔记');
  assert.deepEqual(legacyBooks.lists[0].entries, [{ title: '旧书', author: '作者' }]);
  validateCollections('books', legacyBooks);
  const legacyPodcast = migratePodcasts({ title: '播客', intro: '', entries: [{ id: 'old', title: '旧节目', description: '旧简介', category: '话题', subtitle: '', body: ['旧稿'], _published: false }] });
  assert.equal(legacyPodcast.categories[0].name, '话题');
  assert.equal(legacyPodcast.items[0]._published, false);
  const legacyFilm = migrateFilms({ title: '电影', intro: '旧简介', entries: [{ id: 'legacy', title: '旧电影', subtitle: '旧副标题', category: '剧情', description: '原简介', body: ['原正文'], _published: false }] });
  assert.deepEqual(legacyFilm.categories.map((item) => item.name), ['剧情']);
  assert.equal(legacyFilm.items[0].categoryId, legacyFilm.categories[0].id);
  assert.equal('description' in legacyFilm.items[0], false);
  assert.equal(legacyFilm.items[0].genre, '');
  assert.equal(JSON.stringify(migrateMusic([{ ...defaults.tracks.items[0], note: 'OBSOLETE_MUSIC_NOTE' }])).includes('OBSOLETE_MUSIC_NOTE'), false);
  const legacyPlaylist = migrateMusic({ items: defaults.tracks.items, playlists: [{ ...musicSample.playlists[0], songs: undefined, trackIds: [defaults.tracks.items[0].id] }] });
  assert.deepEqual(legacyPlaylist.playlists[0].songs, [{ title: defaults.tracks.items[0].title, artist: defaults.tracks.items[0].artist }]);
  const travel = structuredClone(defaults.travel);
  travel.categories[0] = { ...travel.categories[0], name: '改名分类' };
  travel.items = [...travel.items, { ...travel.items[0], id: 'new-trip', title: '新记录', description: '测试简介', body: '正文第一段\n\n正文第二段', album: ['/api/media/album-1.png'], _published: true }];
  render(h(ContentProvider, { content: { ...defaults, travel } }, h(ActivityLibrary, { section: 'travel' })));
  assert.ok(screen.getByRole('button', { name: '改名分类' }));
  await user.type(screen.getByLabelText('搜索旅行'), '新记录');
  assert.equal(document.querySelectorAll('.activity-card').length, 1);
  await user.click(screen.getByRole('button', { name: '阅读新记录' }));
  const travelDialog = await screen.findByRole('dialog');
  assert.ok(travelDialog.querySelector('.activity-full-text').textContent.startsWith('正文第一段\n\n正文第二段'));
  assert.ok(within(travelDialog).getByRole('img', { name: '新记录 · 风景 1' }));
  cleanup();
  const bookDoc = structuredClone(defaults.books);
  bookDoc.items = [];
  bookDoc.lists = [...bookDoc.lists, { id: 'custom-list', title: '我的书单', description: '简介', cover: '', entries: [{ title: '独立书目', author: '独立作者' }], _published: true }];
  render(h(ContentProvider, { content: { ...defaults, books: bookDoc } }, h(Bookshelf)));
  await user.click(screen.getByRole('button', { name: /^主题书单/ }));
  await user.type(screen.getByLabelText('搜索主题书单'), '独立作者');
  await user.click(screen.getByRole('button', { name: '打开书单：我的书单' }));
  const listDialog = await screen.findByRole('dialog');
  assert.ok(within(listDialog).getByRole('heading', { name: '独立书目' }));
  cleanup();
  render(h(ContentProvider, { content: defaults }, h(PodcastLibrary)));
  assert.ok(document.querySelector('.podcast-card'));
  cleanup();
  const films = structuredClone(defaults.films);
  films.categories[0] = { ...films.categories[0], name: '值得重看' };
  const manyFilms = { ...films, items: Array.from({ length: 25 }, (_, index) => ({ ...films.items[0], id: 'film-' + index, title: '影片 ' + index, director: '测试导演修改', _published: true })) };
  const filmFront = render(h(ContentProvider, { content: { ...defaults, films: manyFilms } }, h(FilmLibrary)));
  assert.ok(screen.getByRole('button', { name: /值得重看/ }));
  assert.ok(screen.getByRole('heading', { name: '影片 0' }));
  filmFront.unmount();
  cleanup();
  const manyMusic = {
    scenes: defaults.tracks.scenes,
    items: Array.from({ length: 61 }, (_, index) => ({
      ...defaults.tracks.items[index % 3],
      id: 'track-' + index,
      title: '音乐 ' + index,
    })),
    playlists: Array.from({ length: 25 }, (_, index) => ({
      ...musicSample.playlists[0],
      id: 'mix-' + index,
      title: '歌单 ' + index,
      songs: [
        { title: '独立歌曲 2', artist: '作者 2' },
        { title: '独立歌曲 0', artist: '作者 0' },
      ],
      _published: true,
    })),
  };
  const privacyFixture = structuredClone(manyMusic);
  privacyFixture.items[2]._published = false;
  privacyFixture.playlists[1]._published = false;
  const publicFixture = publicMusic(privacyFixture);
  assert.ok(!publicFixture.items.some((item) => item.id === 'track-2'));
  assert.deepEqual(publicFixture.playlists[0].songs, manyMusic.playlists[0].songs);
  assert.ok(!publicFixture.playlists.some((item) => item.id === 'mix-1'));
  console.log('PASS collection migration and public libraries without retired admin managers');
  const audioProto = window.HTMLMediaElement.prototype;
  const audioMethods = Object.getOwnPropertyDescriptors(audioProto);
  audioProto.play = async function () {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new window.Event('play'));
  };
  audioProto.pause = function () {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new window.Event('pause'));
  };
  audioProto.load = function () {};
  const musicFrontend = (value) =>
    h(
      ContentProvider,
      { content: { ...defaults, tracks: value } },
      h(MusicProvider, {}, h(MusicLibrary)),
    );
  const musicFront = render(musicFrontend(manyMusic));
  const globalPlayer = screen.getByLabelText('全局音乐播放器');
  const discButton = within(globalPlayer).getByRole('button', {
    name: '展开播放器',
  });
  assert.ok(globalPlayer.classList.contains('is-collapsed'));
  assert.equal(discButton.getAttribute('aria-expanded'), 'false');
  assert.match(
    lifeCss,
    /\.music-dock\.is-playing \.music-disc \{ animation-play-state: running;/,
  );
  await user.click(discButton);
  assert.ok(!globalPlayer.classList.contains('is-collapsed'));
  assert.equal(discButton.getAttribute('aria-label'), '收起播放器');
  assert.equal(discButton.getAttribute('aria-expanded'), 'true');
  assert.equal(
    document.querySelector('audio').getAttribute('src'),
    null,
    'Do not preload or auto-play audio',
  );
  await user.click(screen.getByRole('button', { name: '播放台播放' }));
  assert.ok(
    document.querySelector('audio').src.endsWith(manyMusic.items[0].src),
  );
  assert.ok(globalPlayer.classList.contains('is-playing'));
  await user.click(screen.getByRole('button', { name: '播放台暂停' }));
  assert.ok(!globalPlayer.classList.contains('is-playing'));
  assert.equal(document.querySelectorAll('.music-track-row').length, 25);
  await user.click(screen.getByRole('button', { name: '下一页', exact: true }));
  assert.ok(screen.getByRole('button', { name: '音乐 25', exact: true }));
  await user.type(screen.getByLabelText('搜索我的音乐'), '音乐 60');
  assert.equal(document.querySelectorAll('.music-track-row').length, 1);
  await user.click(screen.getByRole('tab', { name: /我的歌单/ }));
  assert.equal(document.querySelectorAll('.music-playlist-card').length, 12);
  await user.click(screen.getByRole('button', { name: '下一页', exact: true }));
  assert.ok(
    screen.getByRole('button', { name: '打开歌单 歌单 12', exact: true }),
  );
  await user.type(screen.getByLabelText('搜索我的歌单'), '歌单 0');
  await user.click(
    screen.getByRole('button', { name: '打开歌单 歌单 0', exact: true }),
  );
  const songTable = screen.getByRole('table', { name: '歌单曲目列表' });
  assert.deepEqual(
    within(songTable)
      .getAllByRole('columnheader')
      .map((node) => node.textContent),
    ['序号', '曲目', '作者'],
  );
  assert.deepEqual(
    [...songTable.querySelectorAll('tbody tr')].map((row) => row.textContent),
    ['01独立歌曲 2作者 2', '02独立歌曲 0作者 0'],
  );
  assert.equal(within(songTable).queryByRole('button'), null);
  assert.equal(
    screen.queryByRole('button', { name: /播放当前列表|播放歌单/ }),
    null,
  );
  assert.equal(screen.queryByLabelText('音乐场景筛选'), null);
  await user.type(screen.getByLabelText('搜索歌单曲目'), '独立歌曲 0');
  assert.equal(songTable.querySelectorAll('tbody tr').length, 1);
  assert.ok(songTable.textContent.includes('02'));
  await user.click(screen.getByRole('tab', { name: /我的音乐/ }));
  assert.equal(screen.queryByText('音乐介绍'), null);
  assert.equal(screen.queryByText('听歌笔记'), null);
  await user.selectOptions(
    screen.getByLabelText('音乐场景筛选'),
    manyMusic.scenes[0].name,
  );
  await user.click(screen.getByRole('button', { name: /播放当前列表/ }));
  const element = document.querySelector('audio');
  assert.ok(element.src.endsWith(manyMusic.items[0].src));
  await user.click(screen.getByRole('button', { name: '下一首', exact: true }));
  assert.ok(screen.getByRole('button', { name: '暂停 音乐 3', exact: true }));
  fireEvent.ended(element);
  await waitFor(() =>
    assert.ok(screen.getByRole('button', { name: '暂停 音乐 6', exact: true })),
  );
  await user.click(screen.getByRole('button', { name: '上一首', exact: true }));
  assert.ok(screen.getByRole('button', { name: '暂停 音乐 3', exact: true }));
  await user.click(screen.getByRole('button', { name: '播放台暂停' }));
  fireEvent.error(element);
  assert.ok(screen.getByRole('alert'));
  await user.selectOptions(screen.getByLabelText('音乐场景筛选'), '');
  musicFront.rerender(musicFrontend({ items: [], playlists: [], scenes: [] }));
  assert.ok(screen.getByText('音乐库还在等待第一首歌'));
  assert.equal(document.querySelector('audio'), null);
  await user.click(screen.getByRole('tab', { name: /我的歌单/ }));
  assert.ok(screen.getByText('留一个位置，给下一张歌单。'));
  cleanup();
  for (const method of ['play', 'pause', 'load'])
    Object.defineProperty(audioProto, method, audioMethods[method]);
  console.log(
    'PASS music library pagination/search, playlist details, queue ordering/looping, persistent playback, pause/error and empty states',
  );
} finally {
  cleanup();
  await window.happyDOM.close();
}
