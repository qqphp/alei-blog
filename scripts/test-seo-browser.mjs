import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// Use an installed Playwright package, or point to the bundled runtime's index.mjs.
const { chromium } = await import(process.env.SEO_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.SEO_PLAYWRIGHT_MODULE).href : 'playwright');
const base = 'http://127.0.0.1:8897';
const output = resolve('outputs/seo-browser');
await mkdir(output, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let article, project;
try {
  article = (await db.query('SELECT slug,title FROM articles WHERE published ORDER BY slug LIMIT 1')).rows[0];
  project = (await db.query("SELECT id,title FROM cms_entries WHERE section='projects' AND collection='items' AND published ORDER BY id LIMIT 1")).rows[0];
} finally { await db.end(); }
assert.ok(article && project, '浏览器抽查需要至少一篇已发布文章与项目');
const server = spawn(process.execPath, ['scripts/start-production.mjs'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, PORT: '8897', HOST: '127.0.0.1', SITE_URL: 'https://blog.example.test', SEO_INDEXABLE: '0', CONTACT_MAIL_WORKER_ENABLED: '0' } });
let errors = ''; server.stderr.on('data', (data) => { errors += data.toString(); });
let browser;
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(errors || 'Production preview exited');
    try { if ((await fetch(base + '/api/admin/session')).ok) { ready = true; break; } } catch { /* Starting. */ }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true, ...(process.env.SEO_BROWSER_EXECUTABLE ? { executablePath: process.env.SEO_BROWSER_EXECUTABLE } : {}) });
  for (const { device, viewport, deviceScaleFactor } of [
    { device: 'desktop', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 },
    { device: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
    await context.addInitScript(() => {
      window.__seoMetrics = { lcp: 0, cls: 0, shiftWindow: 0, firstShift: 0, lastShift: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__seoMetrics.lcp = entry.startTime;
          window.__seoMetrics.lcpElement = entry.element?.tagName;
          window.__seoMetrics.lcpUrl = entry.url;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        const metric = window.__seoMetrics;
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (entry.startTime - metric.lastShift > 1000 || entry.startTime - metric.firstShift > 5000) {
            metric.firstShift = entry.startTime; metric.shiftWindow = 0;
          }
          metric.shiftWindow += entry.value; metric.lastShift = entry.startTime;
          metric.cls = Math.max(metric.cls, metric.shiftWindow);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const [name, path] of [['home', '/'], ['article', `/writing/${article.slug}`], ['project', `/projects?project=${project.id}`]]) {
      const page = await context.newPage();
      const pageErrors = []; page.on('pageerror', (error) => pageErrors.push(error.message));
      const imageFailures = [];
      page.on('response', (response) => { if (response.request().resourceType() === 'image' && response.status() >= 400) imageFailures.push({ url: response.url(), status: response.status() }); });
      const response = await page.goto(base + path, { waitUntil: 'load' });
      assert.equal(response.status(), 200);
      if (name !== 'home') {
        await page.getByRole('navigation', { name: '面包屑' }).waitFor({ state: 'visible' });
        assert.ok((await page.getByRole('navigation', { name: '面包屑' }).textContent()).includes(name === 'article' ? article.title : project.title));
      }
      await page.waitForTimeout(3000);
      const metrics = await page.evaluate(() => ({
        lcpMs: Math.round(window.__seoMetrics.lcp), cls: Number(window.__seoMetrics.cls.toFixed(4)), lcpElement: window.__seoMetrics.lcpElement, lcpUrl: window.__seoMetrics.lcpUrl,
        navigation: performance.getEntriesByType('navigation').map((entry) => ({ ttfbMs: Math.round(entry.responseStart), domReadyMs: Math.round(entry.domContentLoadedEventEnd), loadMs: Math.round(entry.loadEventEnd) })),
        viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth > innerWidth + 1,
        images: [...document.images].map((image) => ({ src: image.currentSrc, width: image.clientWidth, height: image.clientHeight, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, loading: image.loading })),
        imageTransfers: performance.getEntriesByType('resource').filter((entry) => entry.initiatorType === 'img' || entry.name.includes('/_next/image?')).map((entry) => ({ url: entry.name, bytes: entry.transferSize, startMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration) })),
      }));
      assert.equal(metrics.overflow, false, `${device}/${name} overflows the viewport`);
      assert.deepEqual(pageErrors, [], `${device}/${name} runtime errors`);
      // Capture load performance before scrolling to exercise below-fold lazy images.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
          scrollTo({ top: y, behavior: 'instant' }); await new Promise((done) => setTimeout(done, 200));
        }
        scrollTo({ top: 0, behavior: 'instant' });
      });
      try {
        await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15000 });
      } catch (error) {
        console.log(JSON.stringify({ device, page: name, imageFailures, unloadedImages: await page.evaluate(() => [...document.images].filter((image) => !image.naturalWidth).map((image) => image.currentSrc)) }));
        throw error;
      }
      assert.deepEqual(imageFailures, [], `${device}/${name} image responses`);
      const renderedImages = await page.evaluate(() => [...document.images].map((image) => ({ src: image.currentSrc, width: image.clientWidth, height: image.clientHeight, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })));
      await page.screenshot({ path: resolve(output, `${device}-${name}.png`), fullPage: true });
      results.push({ device, page: name, path, ...metrics, renderedImages });
      console.log(`${device}/${name}: LCP ${metrics.lcpMs}ms, CLS ${metrics.cls}`);
      await page.close();
    }
    const page = await context.newPage();
    await page.goto(base + '/writing', { waitUntil: 'load' });
    await page.getByRole('textbox', { name: '搜索文章' }).fill('seo-no-match');
    await page.waitForURL(/q=seo-no-match/);
    await page.getByText('没有找到匹配的文章，换个关键词试试。').waitFor();
    await page.reload();
    assert.equal(await page.getByRole('textbox', { name: '搜索文章' }).inputValue(), 'seo-no-match');
    await page.getByRole('textbox', { name: '搜索文章' }).fill('');
    await page.waitForURL(base + '/writing');
    await page.locator('.writing-category-tree a').first().click();
    await page.waitForURL(/group=/);
    await page.goBack(); await page.waitForURL(base + '/writing');
    assert.equal(await page.getByRole('textbox', { name: '搜索文章' }).inputValue(), '');
    await page.goForward(); await page.waitForURL(/group=/);
    const categoryUrl = page.url(); await page.reload(); assert.equal(page.url(), categoryUrl);
    await page.goto(base + '/projects', { waitUntil: 'load' });
    const title = await page.locator('.folio-project-copy h2').first().textContent();
    await page.locator('.folio-project').first().click(); await page.waitForURL(/project=/);
    assert.equal((await page.locator('.folio-title h2').textContent()).trim(), title.replace('↗', '').trim());
    assert.ok((await page.title()).includes(title.replace('↗', '').trim()));
    await page.close(); await context.close();
    console.log(`PASS ${device} search debounce, refresh, category URL, back/forward and project navigation`);
  }
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify({ measuredAt: new Date().toISOString(), method: 'Local production Edge/Chromium, unthrottled, desktop 1440x1000 DPR1 and mobile 390x844 DPR2, 3 seconds per page; lab data, not field CWV', results }, null, 2));
  assert.ok(results.every((result) => result.lcpMs > 0 && result.lcpMs <= 2500 && result.cls <= 0.1), 'Performance target missed; see outputs/seo-browser/metrics.json');
} finally {
  await browser?.close();
  if (server.exitCode === null) { const exited = new Promise((done) => server.once('exit', done)); server.kill(); await exited; }
}
