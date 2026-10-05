import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import pg from 'pg';
import { ensureManagedPostgres } from './managed-postgres.mjs';
import { restrictSecretFile } from './secret-permissions.mjs';

const envPath = resolve('.env');
let vars = await readFile(envPath, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const savedUrl = process.env.DATABASE_URL || parseEnv(vars).DATABASE_URL;
if (savedUrl) {
  await ensureManagedPostgres();
  const application = new pg.Client({ connectionString: savedUrl, connectionTimeoutMillis: 5000 });
  await application.connect();
  try { await application.query('SELECT 1'); } finally { await application.end(); }
  console.log('DATABASE_URL 连接验证成功；现有数据库未修改。');
  process.exit(0);
}
const adminUrl = process.env.PG_ADMIN_URL || (await ensureManagedPostgres(true))?.adminUrl;
const role = 'alei_blog';
const database = 'alei_blog';
if (!adminUrl) throw new Error('无法启动 PostgreSQL 18');

const admin = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
await admin.connect();
try {
  const password = randomBytes(32).toString('base64url');
  const existingRole = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  const existingDatabase = await admin.query(
    'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1',
    [database],
  );
  if (existingDatabase.rowCount && existingDatabase.rows[0].owner !== role)
    throw new Error('同名数据库已存在但不属于博客账号，请人工核对');
  if (existingRole.rowCount && !existingDatabase.rowCount && !savedUrl)
    throw new Error('同名账号已存在但没有博客数据库，请人工核对');
  if (!existingRole.rowCount) {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  } else if (!savedUrl) {
    await admin.query(`ALTER ROLE ${role} PASSWORD '${password}'`);
  }
  if (!existingDatabase.rowCount) {
    await admin.query(`CREATE DATABASE ${database} OWNER ${role} ENCODING 'UTF8'`);
  }
  vars = vars.replace(/^PG_ADMIN_URL=.*(?:\r?\n|$)/m, '');
  let applicationUrl = savedUrl;
  if (!savedUrl) {
    const address = new URL(adminUrl);
    address.username = role;
    address.password = password;
    address.pathname = `/${database}`;
    applicationUrl = address.toString();
    vars = vars.replace(/^DATABASE_URL=.*(?:\r?\n|$)/gm, '');
    vars = `${vars.trimEnd()}\nDATABASE_URL=${applicationUrl}\n`;
  }
  const application = new pg.Client({ connectionString: applicationUrl, connectionTimeoutMillis: 5000 });
  await application.connect();
  try {
    const identity = await application.query('SELECT current_user AS role, current_database() AS database');
    if (identity.rows[0].role !== role || identity.rows[0].database !== database)
      throw new Error('博客连接串指向了其他账号或数据库');
  } finally {
    await application.end();
  }
  await writeFile(envPath, vars, { mode: 0o600 });
  restrictSecretFile(envPath);
  console.log('PostgreSQL 博客数据库和独立账号已就绪；连接信息保存在 .env。');
} finally {
  await admin.end();
}
