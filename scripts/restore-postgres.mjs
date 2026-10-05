import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, rename, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import { ensureManagedPostgres } from './managed-postgres.mjs';
import { postgresTool, postgresEnvironment } from './postgres-tools.mjs';

if (!process.env.DATABASE_URL || !process.argv[2])
  throw new Error(
    '用法：npm run db:restore -- 备份目录；DATABASE_URL 必须指向空数据库。',
  );
await ensureManagedPostgres();
const source = resolve(process.argv[2]);
const media = resolve(process.env.CMS_MEDIA_DIRECTORY || '.local/media');
const staging = `${media}.restore-${process.pid}`;
if (dirname(staging) !== dirname(media)) throw new Error('恢复临时目录不安全');
const sourceMedia = join(source, 'media');
for (const [parent, child] of [
  [source, media],
  [media, source],
]) {
  const path = relative(parent, child);
  if (!path || (!path.startsWith('..') && !isAbsolute(path)))
    throw new Error('备份和恢复目录不能互相包含。');
}
if (
  !(await stat(join(source, 'database.dump'))).isFile() ||
  !(await stat(sourceMedia)).isDirectory()
)
  throw new Error('备份必须包含 database.dump 和 media 目录。');
const existing = await readdir(media).catch((error) => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
if (existing.length) throw new Error('目标素材目录非空，请使用新的目录。');
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
try {
  const tables = await database.query(
    "SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1",
  );
  if (tables.rowCount) throw new Error('目标数据库非空，请新建数据库后恢复。');
  await mkdir(dirname(media), { recursive: true });
  await cp(sourceMedia, staging, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const result = spawnSync(
    postgresTool('pg_restore'),
    [
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-acl',
      '-d',
      decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)),
      join(source, 'database.dump'),
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: postgresEnvironment(process.env.DATABASE_URL),
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `数据库恢复失败：${result.error?.message || result.stderr?.trim()}`,
    );
  // Only remove an empty directory, never existing media.
  if (await stat(media).catch(() => null)) {
    await rmdir(media);
  }
  await rename(staging, media);
  console.log('数据库和素材恢复完成；请继续运行 db:migrate，再启动服务。');
} finally {
  await database.end();
  await rm(staging, { recursive: true, force: true });
}
