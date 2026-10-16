import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string, log: (line: string) => void = console.error): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: url });
  // pg emits 'error' when an idle client loses its connection (e.g. Postgres restarts). Without a listener Node
  // exits; the pool drops the broken client and reconnects on the next query, so logging is enough.
  pool.on('error', (err: Error & { code?: string }) => log(`[db] idle client error: ${err.code ?? err.name}: ${err.message}`));
  return { db: drizzle(pool, { schema }), pool };
}
