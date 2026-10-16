import { serve } from '@hono/node-server';
import { createDb, runMigrations } from '@dosecare/db';
import { numberFromEnv, SystemClock } from '@dosecare/shared';
import { createApp } from './app';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db } = createDb(url);
await runMigrations(db);
if (process.env.SEED_DEMO === '1') {
  const { seedDemo } = await import('./seed');
  console.log('[api] demo seed', await seedDemo(db, new SystemClock()));
}
const app = createApp({
  db,
  clock: new SystemClock(),
  appUrl: process.env.APP_URL ?? 'http://localhost:3100',
  secureCookies: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
  trustProxy: process.env.TRUST_PROXY === '1',
});
const port = numberFromEnv(process.env.API_PORT, 4000);
serve({ fetch: app.fetch, port }, () => console.log(`[api] listening on :${port}`));
