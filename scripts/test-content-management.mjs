import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

export async function checkContentManagement({ request, origin, testUrl, defaults }) {
  const db = new pg.Client({ connectionString: testUrl.toString() });
  await db.connect();
  const getHtml = async (path) => {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    return response.text();
  };
  const assertTime = (before, after) => {
    assert.equal(after.createdAt, before.createdAt);
    assert.ok(after.updatedAt > before.updatedAt, '保存成功应推进更新时间');
  };
  const seed = () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed-missing-sections.mjs'],
      { encoding: 'utf8', env: { ...process.env, DATABASE_URL: testUrl.toString() } });
    assert.equal(run.status, 0, run.stderr);
  };
  try {
    const announcementCategory = { id: 'announcement-type-test', name: '验收通知' };
    const announcementBase = '/api/admin/records/announcements/items';
    const categoryBase = '/api/admin/records/announcements/categories';
    const categoryCreated = await request(categoryBase, 'POST', { value: announcementCategory });
    assert.equal(categoryCreated.status, 200, JSON.stringify(categoryCreated.data));
    const notice = { id: 'announcement-test', title: '公告持久化验收标题', categoryId: announcementCategory.id,
      body: '**公告持久化正文**', startAt: '2020-01-01T00:00:00.000Z', endAt: '', _published: false };
    const noticeCreated = await request(announcementBase, 'POST', { value: notice });
    assert.equal(noticeCreated.status, 200, JSON.stringify(noticeCreated.data));
    assert.ok(noticeCreated.data.value.createdAt && noticeCreated.data.value.updatedAt);
    assert.equal((await getHtml('/')).includes(notice.title), false);
    for (const change of [{ categoryId: 'missing' }, { body: '' }, { startAt: '' }, { endAt: notice.startAt }])
      assert.equal((await request(`${announcementBase}/${notice.id}`, 'PUT',
        { value: { ...notice, ...change }, revision: 1 })).status, 400);
    assert.equal((await request(`${categoryBase}/${announcementCategory.id}`, 'DELETE', { revision: 1 })).status, 400);
    const noticePublished = await request(`${announcementBase}/${notice.id}`, 'PATCH', { published: true, revision: 1 });
    assert.equal(noticePublished.status, 200, JSON.stringify(noticePublished.data));
    assertTime(noticeCreated.data.value, noticePublished.data.value);
    assert.ok((await getHtml('/')).includes(notice.title));
    const noticeEdited = await request(`${announcementBase}/${notice.id}`, 'PUT', { revision: noticePublished.data.revision,
      value: { ...noticePublished.data.value, body: '更新后的公告内容', createdAt: '2000-01-01T00:00:00Z', updatedAt: '2099-01-01T00:00:00Z' } });
    assert.equal(noticeEdited.status, 200, JSON.stringify(noticeEdited.data));
    assertTime(noticePublished.data.value, noticeEdited.data.value);
    assert.equal((await request(`${announcementBase}/${notice.id}`, 'PUT', { value: notice, revision: 1 })).status, 409);
    for (const { id, times } of [{ id: 'future', times: { startAt: '2099-01-01T00:00:00.000Z' } },
      { id: 'expired', times: { endAt: '2021-01-01T00:00:00.000Z' } }]) {
      const value = { ...notice, ...times, id: `notice-${id}`, title: `公告${id}不可见验收`, _published: true };
      const result = await request(announcementBase, 'POST', { value });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal((await getHtml('/')).includes(value.title), false);
      assert.equal((await request(`${announcementBase}/${value.id}`, 'DELETE', { revision: result.data.revision })).status, 200);
    }
    assert.equal((await request(`${announcementBase}/${notice.id}`, 'DELETE', { revision: noticeEdited.data.revision })).status, 200);
    assert.equal((await request(`${categoryBase}/${announcementCategory.id}`, 'DELETE', { revision: 1 })).status, 200);
    console.log('PASS announcement API persistence, publication/validity, timestamps, category references and edit conflicts');
    for (const old of ['aiNotes', 'prompt']) {
      assert.equal((await request(`/api/admin/records/${old}/root`)).status, 400);
      assert.equal((await request(`/api/admin/config/${old}/root`)).status, 400);
    }
    const managedCategory = { id: 'test-managed-category', name: '测试分类', parentId: '' };
    const managedCategoryPath = `/api/admin/records/ai/skillCategories/${managedCategory.id}`;
    assert.equal((await request('/api/admin/records/ai/skillCategories', 'POST', { value: managedCategory })).status, 200);
    for (const collection of ['agents', 'skills', 'relays']) {
      const base = `/api/admin/records/ai/${collection}`;
      const value = { ...defaults.ai[collection][0], id: `test-${collection}`,
        name: `Managed ${collection}`, title: `Managed ${collection}`,
        href: 'https://example.com/resource', _published: false };
      // Preserve each collection's existing schema.
      if (collection !== 'skills') delete value.title;
      else value.categoryId = managedCategory.id;
      const created = await request(base, 'POST', { value });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      assert.match(created.data.value.createdAt, /^\d{4}-.*Z$/);
      assert.equal((await getHtml('/ai')).includes(`Managed ${collection}`), false);
      const path = `${base}/${value.id}`;
      for (const href of ['javascript:alert(1)', '/relative', 'ftp://example.com']) {
        assert.equal((await request(path, 'PUT', { value: { ...created.data.value, href }, revision: 1 })).status, 400);
      }
      const unchanged = await request(path);
      assert.deepEqual(unchanged.data, { value: created.data.value, revision: 1 });
      const edited = await request(path, 'PUT', { value: { ...created.data.value,
        description: 'Persisted resource description', createdAt: '2000-01-01T00:00:00Z',
        updatedAt: '2099-01-01T00:00:00Z' }, revision: 1 });
      assert.equal(edited.status, 200, JSON.stringify(edited.data));
      assertTime(created.data.value, edited.data.value);
      const published = await request(path, 'PATCH', { published: true, revision: 2 });
      assert.equal(published.status, 200);
      assertTime(edited.data.value, published.data.value);
      assert.ok((await getHtml('/ai')).includes(`Managed ${collection}`));
      assert.equal((await db.query('SELECT payload->>\'description\' AS description FROM cms_entries WHERE section=\'ai\' AND collection=$1 AND id=$2',
        [collection, value.id])).rows[0].description, 'Persisted resource description');
      const result = await request(`${base}?q=Managed&size=1&page=1&status=published`);
      assert.equal(result.data.total, 1);
      assert.equal(result.data.items[0].id, value.id);
      const initial = await request(`${base}?size=50`);
      assert.equal(initial.data.items[0].id, value.id);
      assert.equal((await request(`${path}/move`, 'POST', { direction: 1, revision: 3 })).status, 200);
      const reordered = await request(`${base}?size=50`);
      assert.equal(reordered.data.items[1].id, value.id);
      const page = await request(`${base}?size=1&page=2`);
      assert.equal(page.data.items[0].id, reordered.data.items[1].id);
      const draft = await request(path, 'PATCH', { published: false, revision: 4 });
      assert.equal(draft.status, 200);
      assert.equal((await getHtml('/ai')).includes(`Managed ${collection}`), false);
      assert.equal((await request(path, 'DELETE', { revision: 5 })).status, 200);
      const seeded = await request(`${base}?size=1`);
      const deletedId = seeded.data.items[0].id;
      assert.equal((await request(`${base}/${deletedId}`, 'DELETE', { revision: seeded.data.items[0].revision })).status, 200);
      seed(); seed();
      assert.equal((await request(`${base}/${deletedId}`)).status, 404, '初始化不得重新添加已删除资源');
    }
    assert.equal((await request(managedCategoryPath, 'DELETE', { revision: 1 })).status, 200);

    const column = { id: 'new-investment-column', title: '新增研究栏目', description: '单层栏目' };
    const columnsBase = '/api/admin/records/investing/sections';
    const columnCreated = await request(columnsBase, 'POST', { value: column });
    assert.equal(columnCreated.status, 200, JSON.stringify(columnCreated.data));
    assert.equal((await request(columnsBase, 'POST', { value: { ...column, id: 'invalid-parent', parentId: 'trends' } })).status, 400);
    const entriesBase = '/api/admin/records/investing/entries';
    const article = { ...defaults.investing.sections[0].entries[0], id: 'time-investment-one',
      title: '同名投资文章', sectionId: column.id, _published: true,
      paragraphs: ['## 完整 Markdown\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> 引用\n\n- 列表\n\n```js\nconst x = 1;\n```\n\n<script>alert(1)</script>'] };
    const first = await request(entriesBase, 'POST', { value: article });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const second = await request(entriesBase, 'POST', { value: { ...article,
      id: 'time-investment-two', sectionId: 'review', paragraphs: ['第二篇正文'] } });
    assert.equal(second.status, 200);
    assert.ok(second.data.value.createdAt > first.data.value.createdAt);
    const firstPath = `${entriesBase}/${article.id}`;
    const edited = await request(firstPath, 'PUT', { value: { ...first.data.value, description: '更新较早的文章',
      createdAt: '2099-01-01T00:00:00Z' }, revision: 1 });
    assert.equal(edited.status, 200);
    assertTime(first.data.value, edited.data.value);
    const sorted = await request(entriesBase);
    assert.deepEqual(sorted.data.items.slice(0, 2).map((item) => item.id), ['time-investment-two', article.id]);
    assert.equal((await request(`${firstPath}/move`, 'POST', { direction: -1, revision: 2 })).status, 400);
    assert.equal((await request(`${columnsBase}/${column.id}`, 'DELETE', { revision: 1 })).status, 400);
    const renamed = await request(`${columnsBase}/${column.id}`, 'PUT', {
      value: { ...column, title: '自定义研究名称' }, revision: 1 });
    assert.equal(renamed.status, 200);
    const html = await getHtml('/investing');
    assert.ok(html.includes('自定义研究名称'));
    assert.ok(html.includes('第二篇正文'), '最新文章默认选中');
    assert.equal((await request(firstPath, 'DELETE', { revision: 2 })).status, 200);
    assert.equal((await request(`${columnsBase}/${column.id}`, 'DELETE', { revision: 2 })).status, 200);

    for (const [section, collection, sample, identity] of [
      ['writing', 'articles', defaults.writing[0], 'slug'],
      ['projects', 'items', defaults.projects.items[0], 'id'],
    ]) {
      const value = { ...sample, [identity]: `time-${section}`, _published: false,
        createdAt: '2000-01-01T00:00:00Z', updatedAt: '2099-01-01T00:00:00Z',
        ...(section === 'writing' ? { date: '2000.01.01' } : {}) };
      const base = `/api/admin/records/${section}/${collection}`;
      const created = await request(base, 'POST', { value });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      assert.ok(created.data.value.createdAt > '2026-01-01');
      const path = `${base}/${value[identity]}`;
      const edit = await request(path, 'PUT', { value: { ...created.data.value, title: '时间验收更新',
        createdAt: '2099-01-01T00:00:00Z', ...(section === 'writing' ? { date: '1990.01.01' } : {}) }, revision: 1 });
      assert.equal(edit.status, 200);
      assertTime(created.data.value, edit.data.value);
      const published = await request(path, 'PATCH', { published: true, revision: 2 });
      assert.equal(published.status, 200);
      assertTime(edit.data.value, published.data.value);
      assert.equal((await request(path, 'PUT', { value: edit.data.value, revision: 1 })).status, 409);
      assert.equal((await request(path)).data.value.updatedAt, published.data.value.updatedAt);
      if (section === 'writing') {
        const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
          .format(new Date(created.data.value.createdAt)).replaceAll('-', '.');
        assert.equal(created.data.value.date, expected);
        assert.equal(edit.data.value.date, expected);
        assert.equal((await request(path)).data.value.date, expected, '后台日期取创建时间');
        const list = await request('/api/writing');
        assert.equal(list.data.items.find((item) => item.slug === value.slug).date, expected);
        assert.ok((await getHtml(`/writing/${value.slug}`)).includes(expected), '详情日期取创建时间');
        const home = await getHtml('/');
        assert.ok(home.includes('时间验收更新'));
      }
      assert.equal((await request(path, 'DELETE', { revision: 3 })).status, 200);
    }
    const storyValue = { ...structuredClone(defaults.stories[0]), id: 'time-story',
      date: '2026-09-08T23:45:12+08:00', text: '说说表单持久化验收', topics: ['田野', '露营'],
      images: [{ src: '/stories-lake.png', alt: '湖边清晨的帐篷' }], _published: false };
    const storyBase = '/api/admin/records/stories/root';
    const storyCreated = await request(storyBase, 'POST', { value: storyValue });
    assert.equal(storyCreated.status, 200, JSON.stringify(storyCreated.data));
    const storyList = await request(`${storyBase}?q=${encodeURIComponent(storyValue.text)}&status=draft&size=1`);
    assert.equal(storyList.status, 200);
    assert.equal(storyList.data.items[0].id, storyValue.id, '正文搜索和草稿筛选仍正常');
    assert.equal(storyList.data.items[0].excerpt, storyValue.text, '列表摘要仅来自说说正文');
    assert.equal(storyList.data.items[0].date, new Date(storyValue.date).toISOString());
    const storyPath = `${storyBase}/${storyValue.id}`;
    const storyEdited = await request(storyPath, 'PUT', { revision: 1,
      value: { ...storyCreated.data.value, date: '2026-10-01T08:09:10+08:00', topics: Array.from({ length: 6 }, (_, i) => `话题${i}`),
        images: [{ src: '/stories-coast.png', alt: '海边的灯塔' }] } });
    assert.equal(storyEdited.status, 200, JSON.stringify(storyEdited.data));
    const storedStory = (await request(storyPath)).data.value;
    assert.equal(storedStory.date, '2026-10-01T08:09:10+08:00');
    assert.equal(storedStory.images[0].alt, '海边的灯塔');
    assert.equal(storedStory.topics.length, 6);
    const editedStoryList = await request(`${storyBase}?q=${encodeURIComponent(storyValue.text)}&status=draft`);
    assert.equal(editedStoryList.data.items[0].excerpt, storyValue.text);
    assert.equal(editedStoryList.data.items[0].date, '2026-10-01T00:09:10.000Z');
    for (const topics of [Array.from({ length: 7 }, (_, i) => `话题${i}`), ['重复', '重复'], [''], ['长'.repeat(41)]])
      assert.equal((await request(storyPath, 'PUT', { value: { ...storedStory, topics }, revision: 2 })).status, 400);
    assert.equal((await request(storyPath, 'DELETE', { revision: 2 })).status, 200);
    console.log('PASS article creation-date display, immutable edits and story seconds/topics/image persistence');
    // Test saved empty/draft states, without touching the user's database.
    await db.query("UPDATE cms_entries SET published=false,payload=jsonb_set(payload,'{_published}','false') WHERE section='ai'");
    const emptyAi = await getHtml('/ai');
    for (const item of [...defaults.ai.agents, ...defaults.ai.skills, ...defaults.ai.relays])
      assert.equal(emptyAi.includes(item.title ?? item.name), false, '草稿不能回退到静态资源');
    await db.query("DELETE FROM cms_entries WHERE section='ai'");
    seed();
    assert.equal((await request('/api/admin/records/ai/agents')).data.total, 0);
    await db.query("UPDATE cms_entries SET published=false,payload=jsonb_set(payload,'{_published}','false') WHERE section='investing' AND collection='entries'");
    assert.ok((await getHtml('/investing')).includes('暂无文章'));
    console.log('PASS AI persistence/publication/order/pagination/empty/idempotent seed, investing columns/references/newest selection, immutable server times and retired endpoints');
  } finally { await db.end(); }
}
