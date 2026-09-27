import { Client, type QueryResultRow } from 'pg';
import { env } from 'cloudflare:workers';
import { cacheForRequest } from 'vinext/cache';
import { isInsideUnifiedScope } from 'vinext/shims/unified-request-context';

type DatabaseBindings = { DATABASE_URL?: string; HYPERDRIVE?: { connectionString: string } };
type Slot = {
  opening: Promise<Client> | null;
  tail: Promise<void>;
  closeWhenIdle: boolean;
};

const slotForRequest = cacheForRequest((): Slot => ({
  opening: null,
  tail: Promise.resolve(),
  closeWhenIdle: false,
}));

function connectionString() {
  const bindings = env as unknown as DatabaseBindings;
  const value = bindings.HYPERDRIVE?.connectionString || bindings.DATABASE_URL;
  if (!value) throw new Error('未配置 PostgreSQL DATABASE_URL');
  return value;
}

async function openClient(value: string) {
  const client = new Client({ connectionString: value, connectionTimeoutMillis: 5000 });
  await client.connect();
  return client;
}

async function rollbackIfOpen(client: Client) {
  const status = client.getTransactionStatus();
  if (status !== 'T' && status !== 'E') return;
  try {
    await client.query('ROLLBACK');
  } catch {
    // The socket is already closed.
  }
}

async function finish(client: Client) {
  await rollbackIfOpen(client);
  await client.end().catch(() => undefined);
}

export async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const value = connectionString();
  if (!isInsideUnifiedScope()) {
    const client = await openClient(value);
    try {
      return await run(client);
    } catch (error) {
      await rollbackIfOpen(client);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  const slot = slotForRequest();
  const task = slot.tail.then(async () => {
    if (!slot.opening) {
      const pending = openClient(value);
      slot.opening = pending;
      try {
        const opened = await pending;
        try {
          const { after } = await import('next/server');
          after(() => finish(opened));
        } catch {
          slot.closeWhenIdle = true;
        }
      } catch (error) {
        if (slot.opening === pending) slot.opening = null;
        throw error;
      }
    }
    const client = await slot.opening;
    try {
      return await run(client);
    } catch (error) {
      await rollbackIfOpen(client);
      if (client.getTransactionStatus() === null) slot.opening = null;
      throw error;
    } finally {
      if (slot.closeWhenIdle) {
        const current = client;
        slot.opening = null;
        await current.end().catch(() => undefined);
      }
    }
  });
  slot.tail = task.then(() => undefined, () => undefined);
  return task;
}

export async function queryOne<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  return withDatabase(async (client) => {
    const result = await client.query<T>(sql, values);
    return result.rows[0] ?? null;
  });
}
