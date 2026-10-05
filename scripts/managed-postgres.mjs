import { postgresTool } from './postgres-tools.mjs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { restrictSecretFile } from './secret-permissions.mjs';

const data = resolve('.local/postgres18');
const secretPath = join(data, 'admin-password');
const port = 55433;

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function run(name, args, timeout = 30000) {
  const result = spawnSync(postgresTool(name), args, {
    encoding: 'utf8', timeout, windowsHide: true,
    stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
  });
  if (result.error || result.status !== 0)
    throw new Error(`${name} 失败：${result.error?.message || result.stderr?.trim() || result.stdout?.trim() || '未知错误'}`);
}

export async function ensureManagedPostgres(create = false) {
  if (process.env.DATABASE_URL && !create) {
    const url = new URL(process.env.DATABASE_URL);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || Number(url.port || 5432) !== port) return null;
  }
  if (!(await exists(join(data, 'PG_VERSION')))) {
    if (!create) return null;
    if (await exists(data)) throw new Error('博客 PostgreSQL 数据目录不完整，请检查 .local/postgres18');
    await mkdir(resolve('.local'), { recursive: true });
    const temporary = resolve('.local/postgres18-admin.tmp');
    const password = randomBytes(32).toString('base64url');
    await writeFile(temporary, password, { mode: 0o600 });
    try {
      run('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--locale=C',
        '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', `--pwfile=${temporary}`, '--no-instructions'], 60000);
      await writeFile(secretPath, password, { mode: 0o600 });
      restrictSecretFile(secretPath);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  const status = spawnSync(postgresTool('pg_ctl'), ['-D', data, 'status'], {
    encoding: 'utf8', windowsHide: true,
  });
  if (status.status !== 0)
    run('pg_ctl', ['-D', data, '-o', `-h 127.0.0.1 -p ${port}`,
      '-l', resolve('.local/postgres18.log'), 'start']);
  if (!create) return { port };
  const password = (await readFile(secretPath, 'utf8')).trim();
  const adminUrl = new URL(`postgresql://postgres@127.0.0.1:${port}/postgres`);
  adminUrl.password = password;
  return { adminUrl: adminUrl.toString(), port };
}
