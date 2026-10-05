import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { imageSize } from 'image-size';
import { imageSize as bundledImageSize } from '../node_modules/vinext/dist/deps/.pnpm/image-size@2.0.2/deps/image-size/dist/index.js';

const require = createRequire(import.meta.resolve('vite-plugin-dynamic-import'));
const globUrl = pathToFileURL(require.resolve('fast-glob')).href;
const { default: glob } = await import(globUrl);
const directory = await mkdtemp(join(tmpdir(), 'vinext-glob-'));
try {
  for (const name of ['views/a.js', 'views/b.ts', 'views/c/index.js', 'views/c/other.ts', 'views/.hidden.js', 'views/ignore.txt']) {
    const path = join(directory, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '');
  }
  const match = (patterns) => glob.sync(patterns, { cwd: directory }).sort();
  assert.deepEqual(match(['views/*.js', 'views/*.js/index.js']), ['views/a.js']);
  assert.deepEqual(match(['views/*.{js,ts}', 'views/*/index.{js,ts}']), ['views/a.js', 'views/b.ts', 'views/c/index.js']);
  assert.deepEqual(match(['views/**/*.{js,ts}']), ['views/a.js', 'views/b.ts', 'views/c/index.js', 'views/c/other.ts']);
  assert.deepEqual(match(['views/**/{a,index}.js']), ['views/a.js', 'views/c/index.js']);
  assert.deepEqual(match(['views/@(a|b).@(js|ts)']), ['views/a.js', 'views/b.ts']);
  assert.deepEqual(match(['views/*.js', 'views/a.js']), ['views/a.js']);
  const nested = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import glob from ${JSON.stringify(globUrl)};
     const pattern = 'views/' + '{'.repeat(6000) + 'x' + '}'.repeat(6000) + '.js';
     glob.sync(pattern, { cwd: process.cwd() });`,
  ], { cwd: directory, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(nested.status, 0, nested.error?.message || nested.stderr);
  assert.equal(bundledImageSize, imageSize, 'Vinext must use the patched parser, including after npm ci');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64');
  assert.deepEqual(bundledImageSize(png), { width: 1, height: 1, type: 'png' });
  assert.throws(() => bundledImageSize(Buffer.from('invalid-image')));
  console.log('PASS scoped Vinext glob compatibility and patched bundled image parser');
} finally {
  await rm(directory, { recursive: true, force: true });
}
