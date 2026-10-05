import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Vinext 1.0.1 bundles the vulnerable parser; npm overrides cannot replace it.
// Keep its exports while using the patched, pinned dependency after every npm ci.
const parser = resolve(
  'node_modules/vinext/dist/deps/.pnpm/image-size@2.0.2/deps/image-size/dist/index.js',
);
await access(parser);
await writeFile(parser, 'export { default, imageSize, types } from "image-size";\n');

// This optional dependency stub shadows Sharp's installed, authoritative types.
const stubPath = resolve('node_modules/@vinext/types/next/next-external-stubs.d.ts');
const stubs = await readFile(stubPath, 'utf8');
await writeFile(stubPath, stubs.replace(/declare module "sharp" \{\r?\n  const sharp: unknown;\r?\n  export default sharp;\r?\n\}\r?\n/, ''));
console.log('Vinext uses the patched image parser and installed Sharp types');
