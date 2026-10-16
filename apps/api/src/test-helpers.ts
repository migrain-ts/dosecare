import { createTestDb } from '@dosecare/db';
import { FakeClock } from '@dosecare/shared';
import { createApp } from './app';

export type TestApp = Awaited<ReturnType<typeof makeApp>>;

export async function makeApp() {
  const t = await createTestDb();
  const clock = new FakeClock(new Date('2026-01-05T08:00:00Z'));
  const app = createApp({ db: t.db, clock });
  return { app, db: t.db, pool: t.pool, clock, close: t.close };
}

export function call(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

let counter = 0;
export async function register(
  app: Parameters<typeof call>[0],
  email = `user${++counter}@example.com`,
  name = 'Test User',
  timeZone = 'UTC',
) {
  const res = await call(app, null, 'POST', '/auth/register', {
    email, password: 'correct horse battery', name, timeZone,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  const body = (await res.json()) as { user: { id: string; email: string }; recipient: { id: string } };
  return { cookie, user: body.user, recipientId: body.recipient.id };
}
