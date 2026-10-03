import assert from 'node:assert/strict';
import { register } from 'node:module';
import pg from 'pg';

register('./ui-test-loader.mjs', import.meta.url);
process.env.DATABASE_URL = 'postgresql://cache-test-placeholder';
process.env.AA_API_KEY = 'cache-test-placeholder';
let snapshot = null;
let calls = 0;
let failure = false;
let clock = Date.now();
Date.now = () => clock;
pg.Client.prototype.connect = async function () {};
pg.Client.prototype.end = async function () {};
pg.Client.prototype.query = async function (sql, values) {
  if (String(sql).startsWith('SELECT payload'))
    return { rows: snapshot ? [snapshot] : [] };
  if (String(sql).startsWith('SELECT api_key')) return { rows: [] };
  if (String(sql).startsWith('INSERT INTO aa_language_model_snapshots'))
    snapshot = {
      payload: JSON.parse(values[1]),
      storedAt: new Date(values[2]),
    };
  return { rows: [] };
};
globalThis.fetch = async (url) => {
  calls++;
  await new Promise((done) => setTimeout(done, 10));
  if (failure) return new Response('', { status: 429 });
  const page = Number(new URL(url).searchParams.get('page'));
  return Response.json({
    data: [
      {
        id: `model-${page}`,
        name: `model-${page}`,
        release_date: `2026-01-0${page}`,
      },
    ],
    pagination: { has_more: page < 3 },
  });
};
const { getLanguageModels } = await import('../lib/aa-models.ts');
const concurrent = await Promise.all(
  Array.from({ length: 8 }, () => getLanguageModels()),
);
assert.equal(calls, 3, 'eight visitors share one complete paginated refresh');
assert.ok(concurrent.every((value) => value.modelCount === 3 && !value.stale));
assert.deepEqual(
  concurrent[0].groups[0].models.map((model) => model.id),
  ['model-3', 'model-2', 'model-1'],
);
await getLanguageModels();
assert.equal(calls, 3, 'fresh snapshot avoids upstream requests');
clock += 25 * 3600000;
failure = true;
const stale = await Promise.all([getLanguageModels(), getLanguageModels()]);
assert.equal(calls, 4);
assert.ok(
  stale.every(
    (value) => value.stale && value.refreshFailed && value.modelCount === 3,
  ),
);
await getLanguageModels();
assert.equal(calls, 4, 'failed refresh has a non-sliding cooldown');
clock += 61000;
failure = false;
const recovered = await getLanguageModels();
assert.equal(calls, 7);
assert.equal(recovered.refreshFailed, false);
assert.equal(recovered.modelCount, 3);
snapshot = null;
failure = true;
await assert.rejects(getLanguageModels(), /暂不可用/);
const failedCalls = calls;
await assert.rejects(getLanguageModels(), /暂不可用/);
assert.equal(calls, failedCalls, 'missing snapshot also respects cooldown');
console.log(
  'PASS shared all-page model refresh, date sorting, fresh cache, stale fallback, cooldown and recovery',
);
