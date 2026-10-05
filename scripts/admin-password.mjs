import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { restrictSecretFile } from './secret-permissions.mjs';

const file = new URL('../.env', import.meta.url);
const previous = existsSync(file) ? readFileSync(file, 'utf8') : '';
if ((parseEnv(previous).ADMIN_PASSWORD?.length ?? 0) >= 12 && !process.argv.includes('--reset')) {
  console.log(
    '管理员密码已配置。请查看本地 .env；重置请运行 npm run admin:password -- --reset。',
  );
} else {
  const password = randomBytes(18).toString('base64url');
  const retained = previous.replace(/^ADMIN_PASSWORD=.*(?:\r?\n|$)/gm, '');
  writeFileSync(file, `${retained.trimEnd()}\nADMIN_PASSWORD=${password}\n`);
  restrictSecretFile(fileURLToPath(file));
  console.log(
    `管理员密码：${password}\n已保存至 .env（请勿提交）。重启 npm run dev 后生效。`,
  );
}
