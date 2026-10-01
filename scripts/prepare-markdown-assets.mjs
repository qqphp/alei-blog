import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('public/vendor/vditor/dist');
await mkdir(target, { recursive: true });
for (const path of ['js/lute', 'js/i18n', 'js/icons', 'css/content-theme']) {
  await cp(resolve('node_modules/vditor/dist', path), resolve(target, path), { recursive: true });
}
await mkdir(resolve(target, 'js/katex'), { recursive: true });
for (const path of ['fonts', 'katex.min.js', 'katex.min.css']) {
  await cp(resolve('node_modules/katex/dist', path), resolve(target, 'js/katex', path), { recursive: true });
}
await cp(resolve('node_modules/katex/dist/contrib/mhchem.min.js'), resolve(target, 'js/katex/mhchem.min.js'));
