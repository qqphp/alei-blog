import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function postgresTool(name) {
  const windowsBin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const bin =
    process.env.POSTGRES_BIN ||
    (process.platform === 'win32' && existsSync(windowsBin) ? windowsBin : '');
  const executable = `${name}${process.platform === 'win32' ? '.exe' : ''}`;
  return bin ? join(bin, executable) : executable;
}

export function postgresEnvironment(connectionString) {
  const url = new URL(connectionString);
  const environment = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  for (const [parameter, variable] of Object.entries({
    sslmode: 'PGSSLMODE',
    sslrootcert: 'PGSSLROOTCERT',
    sslcert: 'PGSSLCERT',
    sslkey: 'PGSSLKEY',
  })) {
    if (url.searchParams.has(parameter))
      environment[variable] = url.searchParams.get(parameter);
  }
  return environment;
}
