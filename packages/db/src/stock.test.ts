import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './testing';
import { getStock } from './stock';
import * as s from './schema';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function med() {
  const [r] = await t.db.insert(s.recipients).values({ displayName: 'R', timeZone: 'UTC' }).returning();
  const [m] = await t.db.insert(s.medications).values({ recipientId: r!.id, name: 'M', unit: 'mg' }).returning();
  return m!;
}

describe('getStock', () => {
  it('is untracked with no movements', async () => {
    const m = await med();
    expect(await getStock(t.db, m.id, '2026-01-05')).toEqual({ tracked: false, remaining: 0, dailyConsumption: 0, daysLeft: null });
  });

  it('sums movements and divides by the daily consumption of active schedules', async () => {
    const m = await med();
    await t.db.insert(s.schedules).values([
      { medicationId: m.id, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '08:00', quantityPerDose: 1, startDate: '2026-01-01' },
      { medicationId: m.id, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '20:00', quantityPerDose: 1, startDate: '2026-01-01' },
      { medicationId: m.id, daysOfWeek: [1], timeOfDay: '12:00', quantityPerDose: 7, startDate: '2025-01-01', endDate: '2025-12-31' },
    ]);
    await t.db.insert(s.stockMovements).values([
      { medicationId: m.id, quantity: 30, reason: 'refill' },
      { medicationId: m.id, quantity: -2, reason: 'dose' },
    ]);
    expect(await getStock(t.db, m.id, '2026-01-05')).toEqual({ tracked: true, remaining: 28, dailyConsumption: 2, daysLeft: 14 });
  });

  it('is not tracked when only dose movements exist', async () => {
    const m = await med();
    await t.db.insert(s.stockMovements).values({ medicationId: m.id, quantity: -1, reason: 'dose' });
    expect((await getStock(t.db, m.id, '2026-01-05')).tracked).toBe(false);
  });

  it('daysLeft is null when nothing is scheduled', async () => {
    const m = await med();
    await t.db.insert(s.stockMovements).values({ medicationId: m.id, quantity: 10, reason: 'refill' });
    expect((await getStock(t.db, m.id, '2026-01-05')).daysLeft).toBeNull();
  });
});
