import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { restrictSecretFile } from './secret-permissions.mjs';

const file = new URL('../.env', import.meta.url);
const previous = existsSync(file) ? readFileSync(file, 'utf8') : '';
const current = parseEnv(previous);
const reset = process.argv.includes('--reset');
const replacePath = !/^[a-f0-9]{48}$/.test(current.ADMIN_PATH ?? '') || reset;
const password = randomBytes(18).toString('base64url');
const adminPath = replacePath ? randomBytes(24).toString('hex') : current.ADMIN_PATH;

const retained = previous
  .replace(/^ADMIN_PASSWORD=.*(?:\r?\n|$)/gm, '')
  .replace(/^ADMIN_PATH=.*(?:\r?\n|$)/gm, '');
writeFileSync(file, `${retained.trimEnd()}\nADMIN_PASSWORD=${password}\nADMIN_PATH=${adminPath}\n`);
restrictSecretFile(fileURLToPath(file));

console.log(`管理员密码：${password}\n已保存至 .env（请勿提交）。`);
console.log(`后台地址：/${adminPath}`);
console.log('配置已保存至 .env；重启服务后生效。');
