import { ensureManagedPostgres } from './managed-postgres.mjs';

process.env.HOST ??= '127.0.0.1';
process.env.PORT ??= '3000';
await ensureManagedPostgres();
await import('../dist/standalone/server.js');
