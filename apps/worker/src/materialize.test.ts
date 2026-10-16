import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, schema } from '@dosecare/db';
import { eq } from 'drizzle-orm';
import { materializeDoses } from './materialize';
import { seedPatient } from './test-helpers';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const doses = async (scheduleId: string) =>
  (await t.db.select().from(schema.doseEvents).where(eq(schema.doseEvents.scheduleId, scheduleId)).orderBy(schema.doseEvents.scheduledAt)).map((d) => d.scheduledAt.toISOString());

describe('materializeDoses', () => {
  it('creates doses for the next 48 hours in the recipient zone', async () => {
    const p = await seedPatient(t.db); // 08:00 Paris every day
    const inserted = await materializeDoses(t.db, new Date('2026-01-05T06:00:00Z'));
    expect(inserted).toBeGreaterThanOrEqual(2);
    expect(await doses(p.scheduleId)).toEqual(['2026-01-05T07:00:00.000Z', '2026-01-06T07:00:00.000Z']);
  });

  it('is idempotent: a second run inserts nothing and creates no duplicates', async () => {
    const p = await seedPatient(t.db);
    const now = new Date('2026-01-05T06:00:00Z');
    await materializeDoses(t.db, now);
    const before = await doses(p.scheduleId);
    const second = await materializeDoses(t.db, now);
    expect(second).toBe(0);
    expect(await doses(p.scheduleId)).toEqual(before);
  });

  it('catches a dose that came due within the lookback window', async () => {
    const p = await seedPatient(t.db);
    await materializeDoses(t.db, new Date('2026-01-05T07:30:00Z')); // 07:00Z dose is 30 minutes old
    expect((await doses(p.scheduleId))[0]).toBe('2026-01-05T07:00:00.000Z');
  });

  it('ignores archived medications and ended schedules', async () => {
    const a = await seedPatient(t.db);
    await t.db.update(schema.medications).set({ active: false }).where(eq(schema.medications.id, a.medicationId));
    const b = await seedPatient(t.db);
    await t.db.update(schema.schedules).set({ endDate: '2026-01-04' }).where(eq(schema.schedules.id, b.scheduleId));
    await materializeDoses(t.db, new Date('2026-01-05T06:00:00Z'));
    expect(await doses(a.scheduleId)).toEqual([]);
    expect(await doses(b.scheduleId)).toEqual([]);
  });

  it('generates exactly one dose on the DST transition days', async () => {
    const p = await seedPatient(t.db, { timeOfDay: '02:30' });
    await materializeDoses(t.db, new Date('2026-03-29T00:00:00Z'), { lookbackMinutes: 0, horizonHours: 24 });
    expect(await doses(p.scheduleId)).toEqual(['2026-03-29T01:30:00.000Z']);
    const q = await seedPatient(t.db, { timeOfDay: '02:30' });
    await materializeDoses(t.db, new Date('2026-10-25T00:00:00Z'), { lookbackMinutes: 0, horizonHours: 24 });
    expect(await doses(q.scheduleId)).toEqual(['2026-10-25T00:30:00.000Z']);
  });
});
