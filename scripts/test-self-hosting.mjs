import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { request as httpRequest } from 'node:http';
import pg from 'pg';

if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL 必须指向待演练备份的源库');
const originalUrl = process.env.DATABASE_URL;
const source = new URL(originalUrl);
const admin = new pg.Client(
  process.env.PG_ADMIN_URL
    ? { connectionString: process.env.PG_ADMIN_URL }
    : {
        host: source.hostname,
        port: Number(source.port),
        database: 'postgres',
        user: 'postgres',
        password: (
          await readFile('.local/postgres18/admin-password', 'utf8')
        ).trim(),
      },
);
const directory = await mkdtemp(join(tmpdir(), 'alei-self-hosting-'));
const databaseName = `alei_restore_test_${Date.now()}`;
const target = new URL(source);
target.pathname = `/${databaseName}`;
const media = join(directory, 'restored-media');
const password = randomUUID();
let server;
const run = (script, env = {}, args = [], cwd = process.cwd()) => {
  const result = spawnSync(
    process.execPath,
    [resolve('scripts', script), ...args],
    {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...env },
    },
  );
  assert.equal(result.status, 0, `${script}: ${result.stderr}`);
  return result.stdout;
};
const stop = async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((done) => server.once('exit', done));
    server.kill();
    await exited;
  }
};
const origin = 'http://127.0.0.1:8894';
const publicOrigin = 'https://blog.example.test';
// Node's Fetch implementation replaces Host; a reverse proxy sends it verbatim.
const proxyRequest = (path, { headers, body }) =>
  new Promise((done, reject) => {
    const request = httpRequest(
      origin + path,
      { method: 'POST', headers },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const resultHeaders = new Headers();
          for (const [key, value] of Object.entries(response.headers))
            if (value !== undefined)
              resultHeaders.set(
                key,
                Array.isArray(value) ? value.join(', ') : value,
              );
          done(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers: resultHeaders,
            }),
          );
        });
      },
    );
    request.on('error', reject);
    request.end(body);
  });
const start = async () => {
  server = spawn(process.execPath, [resolve('scripts/start-node.mjs')], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      DATABASE_URL: target.toString(),
      ADMIN_PASSWORD: password,
      CMS_MEDIA_DIRECTORY: media,
      HOST: '127.0.0.1',
      PORT: '8894',
      VINEXT_TRUST_PROXY: '1',
    },
  });
  let errors = '';
  server.stderr.on('data', (data) => {
    errors += data.toString();
  });
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error(errors || 'Node server exited');
    try {
      if ((await fetch(`${origin}/api/admin/session`)).ok) return;
    } catch {
      /* Starting. */
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(errors || 'Node server timeout');
};
async function files(path) {
  const result = {};
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const [key, value] of Object.entries(
        await files(join(path, entry.name)),
      ))
        result[`${entry.name}/${key}`] = value;
    } else if (entry.isFile())
      result[entry.name] = createHash('sha256')
        .update(await readFile(join(path, entry.name)))
        .digest('hex');
  }
  return result;
}
await admin.connect();
try {
  // Password initialization is checked in isolation; never print or change the real password.
  const init = join(directory, 'init', 'scripts');
  await mkdir(init, { recursive: true });
  for (const file of ['admin-password.mjs', 'secret-permissions.mjs'])
    await copyFile(resolve('scripts', file), join(init, file));
  await writeFile(join(dirname(init), '.env'), 'ADMIN_PASSWORD=\n');
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(
      process.execPath,
      [join(init, 'admin-password.mjs')],
      { encoding: 'utf8', windowsHide: true },
    );
    assert.equal(result.status, 0, result.stderr);
    const configured = parseEnv(
      await readFile(join(dirname(init), '.env'), 'utf8'),
    ).ADMIN_PASSWORD;
    assert.ok(configured.length >= 12);
    if (i === 0) await writeFile(join(directory, 'password-check'), configured);
    else
      assert.equal(
        configured,
        await readFile(join(directory, 'password-check'), 'utf8'),
      );
  }
  const owner = decodeURIComponent(source.username).replaceAll('"', '""');
  await admin.query(`CREATE DATABASE ${databaseName} OWNER "${owner}"`);
  const backupBase = join(directory, 'backups');
  const expired = join(backupBase, 'alei-2000-01-01T00-00-00');
  const incomplete = join(backupBase, 'alei-2001-01-01T00-00-00');
  await mkdir(expired, { recursive: true });
  await mkdir(incomplete);
  await writeFile(join(expired, 'complete.json'), '{}');
  await utimes(join(expired, 'complete.json'), new Date(0), new Date(0));
  run('backup-postgres.mjs', { CMS_BACKUP_RETENTION_DAYS: '14' }, [backupBase]);
  assert.equal(
    await stat(expired).catch(() => null),
    null,
    'expired completed backup is pruned',
  );
  assert.ok(
    (await stat(incomplete)).isDirectory(),
    'incomplete backups are retained',
  );
  const backup = join(
    backupBase,
    (await readdir(backupBase)).filter(
      (name) => name !== 'alei-2001-01-01T00-00-00',
    )[0],
  );
  const transferred = join(directory, 'transferred-backup');
  await cp(backup, transferred, { recursive: true });
  const restoredEnvironment = {
    DATABASE_URL: target.toString(),
    CMS_MEDIA_DIRECTORY: media,
  };
  run('restore-postgres.mjs', restoredEnvironment, [transferred]);
  const from = new pg.Client({ connectionString: originalUrl });
  const to = new pg.Client({ connectionString: target.toString() });
  await from.connect();
  await to.connect();
  try {
    const tables = (
      await from.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    for (const { tablename } of tables) {
      const sql = `SELECT count(*)::int AS count FROM "${tablename.replaceAll('"', '""')}"`;
      assert.deepEqual(
        (await to.query(sql)).rows,
        (await from.query(sql)).rows,
        `${tablename} record count`,
      );
    }
    assert.deepEqual(
      (await to.query('SELECT slug,body,cover_url FROM articles ORDER BY slug'))
        .rows,
      (
        await from.query(
          'SELECT slug,body,cover_url FROM articles ORDER BY slug',
        )
      ).rows,
    );
  } finally {
    await from.end();
    await to.end();
  }
  assert.deepEqual(
    await files(media),
    await files(join(transferred, 'media')),
    'all media and metadata hashes match',
  );
  const refused = spawnSync(
    process.execPath,
    [resolve('scripts/restore-postgres.mjs'), transferred],
    {
      encoding: 'utf8',
      env: { ...process.env, ...restoredEnvironment },
      windowsHide: true,
    },
  );
  assert.notEqual(refused.status, 0, 'nonempty targets cannot be overwritten');
  run('migrate-postgres.mjs', restoredEnvironment);
  console.log(
    'PASS blank password initialization, backup transfer/restore, all table counts, article content and media hashes',
  );
  await start();
  const forwarded = {
    Host: 'blog.example.test',
    'X-Forwarded-Proto': 'https',
    origin: publicOrigin,
  };
  const login = await proxyRequest('/api/admin/session', {
    headers: { ...forwarded, 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  const unauthorized = await proxyRequest('/api/admin/media', {
    headers: { ...forwarded, origin: 'https://wrong.example', cookie },
    body: 'x',
  });
  assert.equal(unauthorized.status, 403);
  const uploaded = await proxyRequest('/api/admin/media', {
    headers: { ...forwarded, cookie, 'X-File-Name': 'persistent.txt' },
    body: 'persistent Node media',
  });
  assert.equal(uploaded.status, 200);
  const uploadedUrl = (await uploaded.json()).url;
  const read = await fetch(origin + uploadedUrl);
  assert.equal(await read.text(), 'persistent Node media');
  const etag = read.headers.get('etag');
  assert.equal(
    (await fetch(origin + uploadedUrl, { headers: { 'if-none-match': etag } }))
      .status,
    304,
  );
  assert.equal(
    await (
      await fetch(origin + uploadedUrl, { headers: { range: 'bytes=0-9' } })
    ).text(),
    'persistent',
  );
  await stop();
  await start();
  assert.equal(
    await (await fetch(origin + uploadedUrl)).text(),
    'persistent Node media',
  );
  console.log(
    'PASS standalone npm start entry, forwarded HTTPS login/Secure cookie, same-origin protection, Range/ETag and restart persistence',
  );
} finally {
  await stop();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
  assert.equal(dirname(directory), resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
}
