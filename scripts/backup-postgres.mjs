import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import { ensureManagedPostgres } from './managed-postgres.mjs';
import { postgresTool, postgresEnvironment } from './postgres-tools.mjs';

if (!process.env.DATABASE_URL) throw new Error('请先配置 DATABASE_URL');
await ensureManagedPostgres();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = resolve(process.argv[2] || process.env.CMS_BACKUP_DIRECTORY || '.local/backups');
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
  const result = spawnSync(postgresTool('pg_dump'), ['-Fc', '--no-owner', '--no-acl', '-f', join(destination, 'database.dump')], {
    encoding: 'utf8', windowsHide: true,
    env: postgresEnvironment(process.env.DATABASE_URL),
  });
  if (result.error || result.status !== 0)
    throw new Error(`数据库备份失败：${result.error?.message || result.stderr?.trim() || '未知错误'}`);
  await cp(media, join(destination, 'media'), { recursive: true });
  await writeFile(join(destination, 'complete.json'), JSON.stringify({ createdAt: new Date().toISOString() }), { mode: 0o600 });
} finally {
  await db.end();
}
console.log(`数据库和素材备份完成：${destination}`);
console.log('备份中包含内容及 API 密钥，请妥善保管，并单独备份 .env。');
const retention = Number(process.env.CMS_BACKUP_RETENTION_DAYS || 0);
if (Number.isFinite(retention) && retention > 0) {
  const cutoff = Date.now() - retention * 86400000;
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^alei-\d{4}-\d{2}-\d{2}T/.test(entry.name)) continue;
    const candidate = resolve(base, entry.name);
    const child = relative(base, candidate);
    if (!child || child.startsWith('..') || isAbsolute(child) || candidate === destination) continue;
    const complete = await stat(join(candidate, 'complete.json')).catch(() => null);
    if (complete?.isFile() && complete.mtimeMs < cutoff) await rm(candidate, { recursive: true });
  }
}
