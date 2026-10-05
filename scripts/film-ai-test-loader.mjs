import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, next) {
  if (specifier === './postgres' || specifier === './postgres.ts')
    return {
      url: pathToFileURL(resolvePath('scripts/film-ai-postgres-stub.mjs')).href,
      shortCircuit: true,
    };
  return next(specifier, context);
}
