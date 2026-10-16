import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, schema } from '@dosecare/db';
import { FakeClock } from '@dosecare/shared';
import { createApp } from '@dosecare/api';
import { materializeDoses } from './materialize';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe('recipient time zone change (API PATCH + worker materialization)', () => {
  it('does not leave two pending doses of the same schedule within 12 hours of each other', async () => {
    const clock = new FakeClock(new Date('2026-01-05T06:00:00Z'));
    const app = createApp({ db: t.db, clock, appUrl: 'http://localhost:3100' });
    const json = { 'content-type': 'application/json' };
    const reg = await app.request('/auth/register', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: 'tz@example.com', password: 'correct horse battery', name: 'Tz', timeZone: 'Europe/Paris' }),
    });
    expect(reg.status).toBe(201);
    const cookie = reg.headers.get('set-cookie')!.split(';')[0]!;
    const { recipient } = (await reg.json()) as { recipient: { id: string } };
    const [m] = await t.db.insert(schema.medications).values({ recipientId: recipient.id, name: 'Aspirin', unit: 'mg' }).returning();
    const [s] = await t.db
      .insert(schema.schedules)
      .values({ medicationId: m!.id, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '08:00', quantityPerDose: 1, startDate: '2026-01-01' })
      .returning();

    await materializeDoses(t.db, clock.now());
    const patch = await app.request(`/recipients/${recipient.id}`, {
      method: 'PATCH',
      headers: { ...json, cookie },
      body: JSON.stringify({ timeZone: 'America/New_York' }),
    });
    expect(patch.status).toBe(200);
    await materializeDoses(t.db, clock.now());

    const pending = (
      await t.db.select().from(schema.doseEvents).where(eq(schema.doseEvents.scheduleId, s!.id)).orderBy(schema.doseEvents.scheduledAt)
    ).filter((d) => d.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
    for (let i = 1; i < pending.length; i++) {
      const gapHours = (pending[i]!.scheduledAt.getTime() - pending[i - 1]!.scheduledAt.getTime()) / 3600_000;
      expect(gapHours, pending.map((d) => d.scheduledAt.toISOString()).join(', ')).toBeGreaterThanOrEqual(12);
    }
    // Every pending dose is at 08:00 New York time (13:00Z in January).
    expect(pending.every((d) => d.scheduledAt.getUTCHours() === 13)).toBe(true);
  });
});
