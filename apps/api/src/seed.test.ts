import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock } from '@dosecare/shared';
import { createTestDb } from '@dosecare/db';
import { seedDemo } from './seed';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const count = async (sql: string) => (await t.pool.query(sql)).rows[0].n as number;

describe('seedDemo', () => {
  it('creates the demo world once', async () => {
    const clock = new FakeClock(new Date('2026-01-12T09:00:00Z'));
    expect((await seedDemo(t.db, clock)).created).toBe(true);
    expect(await count(`select count(*)::int n from users`)).toBe(2);
    expect(await count(`select count(*)::int n from recipients`)).toBe(3 + 0); // demo self, Grandma Rose, Leo
    expect(await count(`select count(*)::int n from medications`)).toBeGreaterThanOrEqual(3);
    expect(await count(`select count(*)::int n from dose_events where status='taken'`)).toBeGreaterThan(5);
    expect(await count(`select count(*)::int n from dose_events where status='missed'`)).toBe(1);
    expect(await count(`select count(*)::int n from dose_events where status='skipped'`)).toBe(1);
  });

  it('is idempotent', async () => {
    const clock = new FakeClock(new Date('2026-01-12T09:00:00Z'));
    const before = await count(`select count(*)::int n from dose_events`);
    expect((await seedDemo(t.db, clock)).created).toBe(false);
    expect(await count(`select count(*)::int n from dose_events`)).toBe(before);
  });

  it('shares Leo with the demo user as a viewer and Rose with Sam as an editor', async () => {
    const rows = await t.pool.query(`select r.display_name, u.email, m.role from recipient_members m join recipients r on r.id=m.recipient_id join users u on u.id=m.user_id order by 1,2`);
    expect(rows.rows).toContainEqual({ display_name: 'Leo', email: 'demo@dosecare.local', role: 'viewer' });
    expect(rows.rows).toContainEqual({ display_name: 'Grandma Rose', email: 'sam@dosecare.local', role: 'editor' });
  });

  it('leaves Vitamin D low on stock', async () => {
    const r = await t.pool.query(`select coalesce(sum(sm.quantity),0)::float8 q from stock_movements sm join medications m on m.id=sm.medication_id where m.name='Vitamin D'`);
    expect(r.rows[0].q).toBeLessThanOrEqual(7);
  });
});
