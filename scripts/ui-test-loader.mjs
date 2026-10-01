import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, next) {
  if (specifier === 'vditor')
    return { url: new URL('./vditor-test-double.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'cloudflare:workers')
    return {
      url: pathToFileURL(resolvePath('scripts/cloudflare-workers-stub.mjs')).href,
      shortCircuit: true,
    };
  if (specifier === 'next/image' || specifier === 'next/link' || specifier === 'next/navigation')
    return {
      url: pathToFileURL(
        resolvePath(
          `node_modules/vinext/dist/shims/${specifier.split('/')[1]}.js`,
        ),
      ).href,
      shortCircuit: true,
    };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.css'))
    return { format: 'module', source: '', shortCircuit: true };
  return next(url, context);
}
