import { spawnSync } from 'node:child_process';
import { cp, mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import { ensureManagedPostgres } from './managed-postgres.mjs';

if (!process.env.DATABASE_URL) throw new Error('请先配置 DATABASE_URL');
await ensureManagedPostgres();
const url = new URL(process.env.DATABASE_URL);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = resolve(process.argv[2] || '.local/backups');
const destination = join(base, `alei-${stamp}`);
const media = resolve(process.env.CMS_MEDIA_DIRECTORY || '.local/media');
const mediaToBase = relative(media, base);
if (!mediaToBase || (!mediaToBase.startsWith('..') && !isAbsolute(mediaToBase)))
  throw new Error('备份目录不能位于素材目录内部');
try {
  if (!(await stat(media)).isDirectory()) throw new Error('素材路径不是目录');
} catch (error) {
  if (error?.code === 'ENOENT') throw new Error(`素材目录不存在：${media}`);
  throw error;
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("SELECT pg_advisory_lock(hashtext('cms-backup'))");
  await mkdir(base, { recursive: true });
  await mkdir(destination, { recursive: false });
  const bin = process.env.POSTGRES_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const result = spawnSync(join(bin, 'pg_dump.exe'), ['-Fc', '-f', join(destination, 'database.dump')], {
    encoding: 'utf8', windowsHide: true,
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.slice(1),
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(`数据库备份失败：${result.error?.message || result.stderr?.trim() || '未知错误'}`);
  await cp(media, join(destination, 'media'), { recursive: true });
} finally {
  await db.end();
}
console.log(`数据库和素材备份完成：${destination}`);
console.log('备份中包含内容及 API 密钥，请妥善保管，并单独备份 .dev.vars。');
