import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { restrictSecretFile } from './secret-permissions.mjs';

const file = new URL('../.env', import.meta.url);
const previous = existsSync(file) ? readFileSync(file, 'utf8') : '';
const current = parseEnv(previous);
const reset = process.argv.includes('--reset');
const replacePassword = (current.ADMIN_PASSWORD?.length ?? 0) < 12 || reset;
const replacePath = !/^[a-f0-9]{48}$/.test(current.ADMIN_PATH ?? '') || reset;
const password = replacePassword ? randomBytes(18).toString('base64url') : current.ADMIN_PASSWORD;
const adminPath = replacePath ? randomBytes(24).toString('hex') : current.ADMIN_PATH;

if (replacePassword || replacePath) {
  const retained = previous
    .replace(/^ADMIN_PASSWORD=.*(?:\r?\n|$)/gm, '')
    .replace(/^ADMIN_PATH=.*(?:\r?\n|$)/gm, '');
  writeFileSync(file, `${retained.trimEnd()}\nADMIN_PASSWORD=${password}\nADMIN_PATH=${adminPath}\n`);
  restrictSecretFile(fileURLToPath(file));
}

console.log(replacePassword
  ? `管理员密码：${password}\n已保存至 .env（请勿提交）。`
  : '管理员密码已配置；重置请运行 npm run admin:password -- --reset。');
console.log(`后台地址：/${adminPath}`);
if (replacePassword || replacePath) console.log('配置已保存至 .env；重启服务后生效。');
