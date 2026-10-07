import { ensureManagedPostgres } from './managed-postgres.mjs';
import { seoEnvironment } from '../lib/seo-environment.mjs';

process.env.HOST ??= '127.0.0.1';
process.env.PORT ??= '3000';
seoEnvironment();
await ensureManagedPostgres();
await import('./start-production.mjs');
