import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, schema } from '@dosecare/db';
import { eq } from 'drizzle-orm';
import { enqueueLowStock, enqueueMissedAlerts, enqueueReminders, markMissed } from './enqueue';
import { seedPatient } from './test-helpers';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const at = (s: string) => new Date(s);
async function dose(p: { scheduleId: string; medicationId: string; recipientId: string }, when: string, status = 'pending') {
  const [d] = await t.pool
    .query(`insert into dose_events (schedule_id, medication_id, recipient_id, scheduled_at, quantity, status) values ($1,$2,$3,$4,1,$5) returning id`, [p.scheduleId, p.medicationId, p.recipientId, when, status])
    .then((r) => r.rows);
  return d.id as string;
}
const outbox = async (kind: string, like: string) =>
  (await t.pool.query(`select to_email, payload, dedupe_key from notification_outbox where kind=$1 and dedupe_key like $2 order by dedupe_key`, [kind, like])).rows;

describe('enqueueReminders', () => {
  it('sends a reminder only to members who enabled reminders, once', async () => {
    const p = await seedPatient(t.db);
    const id = await dose(p, '2026-01-05T07:00:00Z');
    expect(await enqueueReminders(t.db, at('2026-01-05T07:00:10Z'))).toBeGreaterThanOrEqual(1);
    const rows = await outbox('reminder', `reminder:${id}:%`);
    expect(rows.map((r) => r.to_email)).toEqual([p.owner.email]);
    expect(rows[0].payload).toMatchObject({ doseEventId: id, medication: 'Aspirin', recipientName: 'Mum', timeZone: 'Europe/Paris' });
    await enqueueReminders(t.db, at('2026-01-05T07:00:40Z'));
    expect(await outbox('reminder', `reminder:${id}:%`)).toHaveLength(1);
  });

  it('does not remind early, for stale doses, or for doses already taken', async () => {
    const p = await seedPatient(t.db);
    const early = await dose(p, '2026-01-05T09:00:00Z');
    const stale = await dose(p, '2026-01-05T06:00:00Z');
    const taken = await dose(p, '2026-01-05T07:00:00Z', 'taken');
    await enqueueReminders(t.db, at('2026-01-05T07:10:00Z'));
    for (const id of [early, stale, taken]) expect(await outbox('reminder', `reminder:${id}:%`)).toHaveLength(0);
  });
});

describe('missed doses', () => {
  it('alerts each member after their own delay, once, and not when the dose was taken', async () => {
    const p = await seedPatient(t.db);
    await t.pool.query(`update notification_preferences set missed_alert_delay_minutes=60 where recipient_id=$1 and user_id=$2`, [p.recipientId, p.viewer.id]);
    const id = await dose(p, '2026-01-05T07:00:00Z');
    const taken = await dose(p, '2026-01-05T07:00:00Z'.replace('07', '06'), 'taken');
    await enqueueMissedAlerts(t.db, at('2026-01-05T07:31:00Z'));
    expect((await outbox('missed_alert', `missed:${id}:%`)).map((r) => r.to_email).sort()).toEqual([p.owner.email, p.editor.email].sort());
    await enqueueMissedAlerts(t.db, at('2026-01-05T08:01:00Z'));
    expect(await outbox('missed_alert', `missed:${id}:%`)).toHaveLength(3);
    await enqueueMissedAlerts(t.db, at('2026-01-05T08:02:00Z'));
    expect(await outbox('missed_alert', `missed:${id}:%`)).toHaveLength(3);
    expect(await outbox('missed_alert', `missed:${taken}:%`)).toHaveLength(0);
  });

  it('skips members who switched missed alerts off', async () => {
    const p = await seedPatient(t.db);
    await t.pool.query(`update notification_preferences set missed_alert_enabled=false where recipient_id=$1 and user_id=$2`, [p.recipientId, p.editor.id]);
    const id = await dose(p, '2026-01-05T07:00:00Z');
    await enqueueMissedAlerts(t.db, at('2026-01-05T07:40:00Z'));
    expect((await outbox('missed_alert', `missed:${id}:%`)).map((r) => r.to_email)).not.toContain(p.editor.email);
  });

  it('markMissed flips only pending doses past the grace period, atomically, and a late take still works', async () => {
    await t.pool.query(`update dose_events set status='taken' where status='pending'`); // markMissed is global: neutralise doses left by earlier tests
    const p = await seedPatient(t.db);
    const old = await dose(p, '2026-01-05T07:00:00Z');
    const recent = await dose(p, '2026-01-05T08:30:00Z');
    const done = await dose(p, '2026-01-05T06:00:00Z', 'taken');
    const flipped = await markMissed(t.db, at('2026-01-05T09:05:00Z'));
    expect(flipped).toBe(1);
    const status = async (id: string) => (await t.db.select().from(schema.doseEvents).where(eq(schema.doseEvents.id, id)))[0]!.status;
    expect(await status(old)).toBe('missed');
    expect(await status(recent)).toBe('pending');
    expect(await status(done)).toBe('taken');
    expect(await markMissed(t.db, at('2026-01-05T09:06:00Z'))).toBe(0);
  });
});

describe('enqueueLowStock', () => {
  const setup = async () => {
    const p = await seedPatient(t.db); // 1 per day, every day
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason, created_at) values ($1, 5, 'refill', '2026-01-01T00:00:00Z')`, [p.medicationId]);
    return p;
  };

  it('alerts owners and editors (not viewers) once per stock cycle', async () => {
    const p = await setup(); // 5 left, 1/day => 5 days <= 7
    await enqueueLowStock(t.db, at('2026-01-05T08:00:00Z'));
    const rows = await outbox('low_stock', `low_stock:${p.medicationId}:%`);
    expect(rows.map((r) => r.to_email).sort()).toEqual([p.owner.email, p.editor.email].sort());
    expect(rows[0].payload).toMatchObject({ medication: 'Aspirin', recipientName: 'Mum' });
    await enqueueLowStock(t.db, at('2026-01-05T08:00:30Z'));
    expect(await outbox('low_stock', `low_stock:${p.medicationId}:%`)).toHaveLength(2);
  });

  it('alerts again after a new refill runs low again', async () => {
    const p = await setup();
    await enqueueLowStock(t.db, at('2026-01-05T08:00:00Z'));
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason, created_at) values ($1, 100, 'refill', '2026-01-10T00:00:00Z')`, [p.medicationId]);
    await enqueueLowStock(t.db, at('2026-01-10T08:00:00Z'));
    expect(await outbox('low_stock', `low_stock:${p.medicationId}:%`)).toHaveLength(2); // 100 days left: no new alert
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason) values ($1, -100, 'adjustment')`, [p.medicationId]);
    await enqueueLowStock(t.db, at('2026-01-10T09:00:00Z'));
    expect(await outbox('low_stock', `low_stock:${p.medicationId}:%`)).toHaveLength(4); // new refill cycle, low again (5 left)
    await enqueueLowStock(t.db, at('2026-01-10T09:00:30Z'));
    expect(await outbox('low_stock', `low_stock:${p.medicationId}:%`)).toHaveLength(4); // same cycle: deduplicated
  });

  it('ignores untracked stock, plentiful stock and archived medications', async () => {
    const untracked = await seedPatient(t.db);
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason) values ($1, -3, 'dose')`, [untracked.medicationId]);
    const plenty = await seedPatient(t.db);
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason) values ($1, 200, 'refill')`, [plenty.medicationId]);
    const archived = await setup();
    await t.db.update(schema.medications).set({ active: false }).where(eq(schema.medications.id, archived.medicationId));
    await enqueueLowStock(t.db, at('2026-01-05T08:00:00Z'));
    for (const p of [untracked, plenty, archived]) expect(await outbox('low_stock', `low_stock:${p.medicationId}:%`)).toHaveLength(0);
  });
});
