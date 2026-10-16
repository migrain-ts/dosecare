import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './testing';
import * as s from './schema';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function seedBase() {
  const [u] = await t.db.insert(s.users).values({ email: `a${Math.random()}@x.io`, passwordHash: 'h', name: 'A' }).returning();
  const [r] = await t.db.insert(s.recipients).values({ displayName: 'R', timeZone: 'UTC' }).returning();
  const [m] = await t.db.insert(s.medications).values({ recipientId: r!.id, name: 'Med', unit: 'mg' }).returning();
  const [sc] = await t.db
    .insert(s.schedules)
    .values({ medicationId: m!.id, daysOfWeek: [1, 2, 3], timeOfDay: '08:00', quantityPerDose: 1, startDate: '2026-01-01' })
    .returning();
  return { u: u!, r: r!, m: m!, sc: sc! };
}

describe('schema constraints', () => {
  it('migrations create every table', async () => {
    const res = await t.pool.query(
      "select table_name from information_schema.tables where table_schema='public' order by 1",
    );
    const names = res.rows.map((r) => r.table_name);
    for (const n of [
      'users', 'sessions', 'recipients', 'recipient_members', 'invitations', 'medications',
      'schedules', 'stock_movements', 'dose_events', 'notification_outbox', 'notification_preferences',
    ]) expect(names).toContain(n);
  });

  it('rejects a duplicate dose for the same schedule and time', async () => {
    const { r, m, sc } = await seedBase();
    const row = { scheduleId: sc.id, medicationId: m.id, recipientId: r.id, scheduledAt: new Date('2026-01-05T08:00:00Z'), quantity: 1 };
    await t.db.insert(s.doseEvents).values(row);
    await expect(t.db.insert(s.doseEvents).values(row)).rejects.toThrow();
  });

  it('rejects a duplicate outbox dedupe_key', async () => {
    const row = { kind: 'reminder' as const, toEmail: 'a@b.c', payload: {}, dedupeKey: 'k1', nextAttemptAt: new Date() };
    await t.db.insert(s.notificationOutbox).values(row);
    await expect(t.db.insert(s.notificationOutbox).values(row)).rejects.toThrow();
  });

  it('rejects a duplicate membership and an invalid role', async () => {
    const { u, r } = await seedBase();
    await t.db.insert(s.recipientMembers).values({ recipientId: r.id, userId: u.id, role: 'owner' });
    await expect(
      t.db.insert(s.recipientMembers).values({ recipientId: r.id, userId: u.id, role: 'viewer' }),
    ).rejects.toThrow();
    await expect(
      t.pool.query(`insert into recipient_members (recipient_id, user_id, role) values ($1, $2, 'admin')`, [r.id, u.id]),
    ).rejects.toThrow();
  });

  it('deleting a schedule keeps the dose history', async () => {
    const { r, m, sc } = await seedBase();
    await t.db.insert(s.doseEvents).values({ scheduleId: sc.id, medicationId: m.id, recipientId: r.id, scheduledAt: new Date('2026-01-06T08:00:00Z'), quantity: 1 });
    await t.db.delete(s.schedules).where(sql`${s.schedules.id} = ${sc.id}`);
    const left = await t.pool.query('select schedule_id from dose_events where medication_id = $1', [m.id]);
    expect(left.rows).toHaveLength(1);
    expect(left.rows[0].schedule_id).toBeNull();
  });
});
