import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./film-ai-test-loader.mjs', import.meta.url);
const previousEnvironment = { ...process.env };
const originalFetch = globalThis.fetch;
process.env.AI_PROVIDER_API_KEY = 'test-only-key';
process.env.ADMIN_PASSWORD = 'test-markdown-password-only';
const { defaults } = await import('../lib/cms-defaults.ts');
const { validateContent } = await import('../lib/cms-validation.ts');
const { markdownLength, validateMarkdownInput } = await import('../lib/markdown-ai.ts');
const { processMarkdown } = await import('../lib/markdown-ai-provider.ts');
const { POST } = await import('../app/api/admin/ai/route.ts');
const { sessionCookie } = await import('../lib/admin-auth.ts');
let settings = { ...defaults.aiSettings, textModel: 'writing-text-model', markdownDiagnosePrompt: 'CUSTOM DIAGNOSE', markdownRepairPrompt: 'CUSTOM REPAIR', markdownPolishPrompt: 'CUSTOM POLISH' };
globalThis.__filmTestSettings = async () => ({ value: settings, revision: 1 });
const requests = [];
let responseText = JSON.stringify({ issues: [] }), finishReason = 'stop', failed = false;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
  assert.equal(href, 'https://api.teamorouter.com/v1/chat/completions');
  requests.push(JSON.parse(init.body));
  return failed ? Response.json({}, { status: 502 }) : Response.json({ choices: [{ finish_reason: finishReason, message: { content: responseText } }] });
};
const cookie = (await sessionCookie(new Request('http://localhost:3000'))).split(';')[0];
function request(body, options = {}) {
  return new Request('http://localhost:3000/api/admin/ai', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie, ...options }, body: JSON.stringify(body) });
}
try {
  const markdown = '# 标题\n\n这个句子有有重复。\n\n[链接](https://example.com)\n\n![图片](/image.png)\n\n```js\nconst a = 1;\n```\n\n| 名称 | 数字 |\n| --- | --- |\n| 内容 | 42 |\n\n$x^2$';
  const issues = [{ location: '第 1 段', category: '重复', excerpt: '有有重复', suggestion: '有重复', reason: '删除重复的字。' }];
  responseText = JSON.stringify({ issues });
  const diagnosis = await POST(request({ action: 'markdown-diagnose', markdown }));
  assert.equal(diagnosis.status, 200); assert.deepEqual(await diagnosis.json(), { issues });
  assert.equal(requests.at(-1).model, 'writing-text-model');
  assert.ok(requests.at(-1).messages[0].content.startsWith('CUSTOM DIAGNOSE'));
  assert.equal(JSON.parse(requests.at(-1).messages[1].content).markdown, markdown);
  const revised = markdown.replace('有有重复', '有重复');
  responseText = JSON.stringify({ markdown: revised });
  const repair = await POST(request({ action: 'markdown-repair', markdown, issues }));
  assert.equal(repair.status, 200); assert.deepEqual(await repair.json(), { markdown: revised });
  assert.ok(requests.at(-1).messages[0].content.startsWith('CUSTOM REPAIR'));
  assert.deepEqual(JSON.parse(requests.at(-1).messages[1].content).issues, issues);
  assert.deepEqual(await processMarkdown({ action: 'markdown-polish', markdown }), { markdown: revised });
  assert.ok(requests.at(-1).messages[0].content.startsWith('CUSTOM POLISH'));
  responseText = JSON.stringify({ markdown: revised.replace('# 标题', '# 修订标题') });
  assert.deepEqual(await processMarkdown({ action: 'markdown-polish', markdown }), { markdown: revised.replace('# 标题', '# 修订标题') });
  for (const [original, replacement] of [['# 标题', '## 标题'], ['const a = 1;', 'const a = 2;'], ['https://example.com', 'https://other.com'], ['/image.png', '/other.png'], ['| 内容 | 42 |', '| 内容 | 43 |'], ['$x^2$', '$x^3$']]) {
    responseText = JSON.stringify({ markdown: markdown.replace(original, replacement) });
    await assert.rejects(processMarkdown({ action: 'markdown-polish', markdown }), /受保护内容/);
  }
  responseText = JSON.stringify({ markdown: revised }); finishReason = 'length';
  const truncated = await POST(request({ action: 'markdown-polish', markdown }));
  assert.equal(truncated.status, 502); assert.match((await truncated.json()).error, /截断/);
  finishReason = 'stop'; responseText = 'not json';
  await assert.rejects(processMarkdown({ action: 'markdown-diagnose', markdown }), /格式无效/);
  responseText = JSON.stringify({ issues: [{ ...issues[0], excerpt: '不存在的片段' }] });
  await assert.rejects(processMarkdown({ action: 'markdown-diagnose', markdown }), /原文片段/);
  failed = true; await assert.rejects(processMarkdown({ action: 'markdown-polish', markdown }), /502/); failed = false;
  const count = requests.length;
  assert.equal((await POST(request({ action: 'markdown-polish', markdown }, { cookie: '' }))).status, 401);
  assert.equal((await POST(request({ action: 'markdown-polish', markdown }, { origin: 'https://other.example' }))).status, 403);
  assert.equal((await POST(request({ action: 'markdown-repair', markdown, issues: [] }))).status, 400);
  assert.equal((await POST(request({ action: 'markdown-polish', markdown: '字'.repeat(12001) }))).status, 400);
  assert.equal(requests.length, count);
  responseText = JSON.stringify({ issues: [] });
  assert.equal((await POST(request({ action: 'markdown-diagnose', markdown: '字'.repeat(12000) }))).status, 200, '中文正文超过旧 32 KB 上限也可送达');
  assert.equal(markdownLength('🌏'.repeat(12000)), 12000); validateMarkdownInput('🌏'.repeat(12000));
  assert.throws(() => validateMarkdownInput('🌏'.repeat(12001)), /12,000/);
  assert.throws(() => validateContent('aiSettings', { ...defaults.aiSettings, markdownPolishPrompt: ' ' }), /Markdown/);
  const { markdownDiagnosePrompt: _d, markdownRepairPrompt: _r, markdownPolishPrompt: _p, ...legacySettings } = defaults.aiSettings;
  settings = legacySettings;
  const { getDocuments } = await import('../lib/cms-server.ts');
  const loaded = (await getDocuments(['aiSettings'])).content.aiSettings;
  assert.equal(loaded.markdownPolishPrompt, defaults.aiSettings.markdownPolishPrompt);
  await processMarkdown({ action: 'markdown-diagnose', markdown: '自然的正文。' });
  assert.ok(requests.at(-1).messages[0].content.startsWith(defaults.aiSettings.markdownDiagnosePrompt));
  console.log('PASS Markdown AI provider/model/prompts, protected syntax, malformed/truncated responses, auth, Unicode boundaries and legacy defaults');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
  Object.assign(process.env, previousEnvironment);
}
