import { seoEnvironment } from '../lib/seo-environment.mjs';

seoEnvironment();
await import('../dist/standalone/server.js');
