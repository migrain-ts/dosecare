import { createTestDb, schema } from '@dosecare/db';
import { createHash, randomBytes } from 'node:crypto';
import { FakeClock } from '@dosecare/shared';
import { createApp } from './app';
import { createSession } from './auth/sessions';
import { addMember } from './services/recipients';

export type TestApp = Awaited<ReturnType<typeof makeApp>>;

export async function makeApp(opts: { trustProxy?: boolean } = {}) {
  const t = await createTestDb();
  const clock = new FakeClock(new Date('2026-01-05T08:00:00Z'));
  const app = createApp({ db: t.db, clock, appUrl: 'http://localhost:3001', ...opts });
  return { app, db: t.db, pool: t.pool, clock, close: t.close };
}

export function call(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = { ...extraHeaders };
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

export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

export async function makeFixture(t: Pick<TestApp, 'db' | 'clock'>) {
  const { db, clock } = t;
  const mk = async (name: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: `${name}-${randomBytes(4).toString('hex')}@example.com`, passwordHash: 'x', name })
      .returning();
    const token = await createSession(db, u!.id, clock.now());
    return { id: u!.id, cookie: `sid=${token}` };
  };
  const [owner, editor, viewer, outsider] = [await mk('owner'), await mk('editor'), await mk('viewer'), await mk('outsider')] as const;
  const [recipient] = await db.insert(schema.recipients).values({ displayName: 'Patient', timeZone: 'UTC' }).returning();
  await addMember(db, { recipientId: recipient!.id, userId: owner.id, role: 'owner' });
  await addMember(db, { recipientId: recipient!.id, userId: editor.id, role: 'editor' });
  await addMember(db, { recipientId: recipient!.id, userId: viewer.id, role: 'viewer' });
  const [med] = await db.insert(schema.medications).values({ recipientId: recipient!.id, name: 'Med', unit: 'mg' }).returning();
  const [sc] = await db
    .insert(schema.schedules)
    .values({ medicationId: med!.id, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '09:00', quantityPerDose: 1, startDate: '2026-01-01' })
    .returning();
  const [dose] = await db
    .insert(schema.doseEvents)
    .values({
      scheduleId: sc!.id, medicationId: med!.id, recipientId: recipient!.id, quantity: 1,
      scheduledAt: new Date(clock.now().getTime() + 24 * 3600_000),
    })
    .returning();
  const [inv] = await db
    .insert(schema.invitations)
    .values({
      recipientId: recipient!.id, email: 'invitee@example.com', role: 'viewer', invitedBy: owner.id,
      tokenHash: createHash('sha256').update(randomBytes(8)).digest('hex'),
      expiresAt: new Date(clock.now().getTime() + 7 * 24 * 3600_000),
    })
    .returning();
  return {
    recipientId: recipient!.id, medicationId: med!.id, scheduleId: sc!.id, doseId: dose!.id,
    invitationId: inv!.id, owner, editor, viewer, outsider,
  };
}
