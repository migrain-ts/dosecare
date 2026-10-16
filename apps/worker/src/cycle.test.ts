import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock } from '@dosecare/shared';
import { createTestDb } from '@dosecare/db';
import { runCycle } from './cycle';
import { FakeMailer } from './mailer';
import { seedPatient } from './test-helpers';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe('runCycle', () => {
  it('walks a dose from generation to reminder to missed alert without duplicates', async () => {
    const p = await seedPatient(t.db, { timeZone: 'UTC', timeOfDay: '08:00' });
    const clock = new FakeClock(new Date('2026-01-05T07:59:50Z'));
    const mailer = new FakeMailer();
    const deps = { mailer, clock, random: () => 0.5 };
    const to = (kind: string) => mailer.sent.filter((m) => m.messageId.startsWith(kind)).map((m) => m.to);

    await runCycle(t.db, deps); // dose generated, not yet due
    expect(mailer.sent).toHaveLength(0);

    clock.advanceMs(20_000); // 08:00:10
    const r1 = await runCycle(t.db, deps);
    expect(r1.reminders).toBe(1);
    expect(to('reminder')).toEqual([p.owner.email]);
    await runCycle(t.db, deps); // same minute again
    expect(to('reminder')).toHaveLength(1);

    clock.advanceMinutes(31); // 08:31, past the 30 minute alert delay
    await runCycle(t.db, deps);
    expect(to('missed')).toHaveLength(3);
    await runCycle(t.db, deps);
    expect(to('missed')).toHaveLength(3);

    clock.advanceMinutes(100); // 10:11, past the 2 h grace period
    const r = await runCycle(t.db, deps);
    expect(r.markedMissed).toBe(1);
    const dose = await t.pool.query(`select status from dose_events where schedule_id=$1 order by scheduled_at limit 1`, [p.scheduleId]);
    expect(dose.rows[0].status).toBe('missed');
  });
});
