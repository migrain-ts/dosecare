import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, makeFixture, type TestApp } from '../test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

const sched = { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '08:00', quantityPerDose: 1, startDate: '2026-01-01' };

describe('medications', () => {
  it('creates a medication with schedules and lists it with its schedules', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.editor.cookie, 'POST', `/recipients/${f.recipientId}/medications`, { name: 'Aspirin', unit: 'mg', strength: '100', schedules: [sched] });
    expect(res.status).toBe(201);
    const list = (await (await call(t.app, f.viewer.cookie, 'GET', `/recipients/${f.recipientId}/medications`)).json()) as {
      medications: { name: string; schedules: unknown[]; stock: { tracked: boolean } }[];
    };
    const aspirin = list.medications.find((m) => m.name === 'Aspirin')!;
    expect(aspirin.schedules).toHaveLength(1);
    expect(aspirin.stock.tracked).toBe(false);
  });

  it('rejects an invalid medication with 400', async () => {
    const f = await makeFixture(t);
    expect((await call(t.app, f.editor.cookie, 'POST', `/recipients/${f.recipientId}/medications`, { name: '', unit: 'mg', schedules: [] })).status).toBe(400);
  });

  it('updates a medication', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.editor.cookie, 'PATCH', `/medications/${f.medicationId}`, { name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { medication: { name: string } }).medication.name).toBe('Renamed');
  });

  it('archiving deactivates the medication and removes only its future pending doses', async () => {
    const f = await makeFixture(t);
    await t.pool.query(
      `insert into dose_events (schedule_id, medication_id, recipient_id, scheduled_at, quantity, status)
       values ($1,$2,$3,$4,1,'taken'), ($1,$2,$3,$5,1,'pending')`,
      [f.scheduleId, f.medicationId, f.recipientId, new Date(t.clock.now().getTime() + 2 * 86_400_000), new Date(t.clock.now().getTime() - 86_400_000)],
    );
    expect((await call(t.app, f.editor.cookie, 'DELETE', `/medications/${f.medicationId}`)).status).toBe(204);
    const med = await t.pool.query('select active, end_date::text from medications where id=$1', [f.medicationId]);
    expect(med.rows[0]).toEqual({ active: false, end_date: '2026-01-05' });
    const left = await t.pool.query('select status from dose_events where medication_id=$1 order by scheduled_at', [f.medicationId]);
    expect(left.rows.map((r) => r.status)).toEqual(['pending', 'taken']); // past pending kept, fixture future pending removed
  });
});

describe('schedules', () => {
  it('rejects an impossible calendar date with the standard 400 body', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.editor.cookie, 'POST', `/medications/${f.medicationId}/schedules`, { ...sched, startDate: '2026-02-31' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBeTruthy();
    expect(typeof body.error.message).toBe('string');
  });

  it('adding, updating and deleting a schedule removes its future pending doses only', async () => {
    const f = await makeFixture(t);
    const future = new Date(t.clock.now().getTime() + 3 * 86_400_000);
    await t.pool.query(`insert into dose_events (schedule_id, medication_id, recipient_id, scheduled_at, quantity, status) values ($1,$2,$3,$4,1,'taken')`, [f.scheduleId, f.medicationId, f.recipientId, future]);
    const upd = await call(t.app, f.editor.cookie, 'PUT', `/schedules/${f.scheduleId}`, { ...sched, timeOfDay: '10:00' });
    expect(upd.status).toBe(200);
    let rows = await t.pool.query('select status from dose_events where schedule_id=$1', [f.scheduleId]);
    expect(rows.rows.map((r) => r.status)).toEqual(['taken']); // the pending fixture dose is gone, the taken one stays
    const add = await call(t.app, f.editor.cookie, 'POST', `/medications/${f.medicationId}/schedules`, sched);
    expect(add.status).toBe(201);
    expect((await call(t.app, f.editor.cookie, 'DELETE', `/schedules/${f.scheduleId}`)).status).toBe(204);
    rows = await t.pool.query('select status, schedule_id from dose_events where medication_id=$1', [f.medicationId]);
    expect(rows.rows).toEqual([{ status: 'taken', schedule_id: null }]);
  });
});

describe('stock', () => {
  it('records refills and adjustments and reports days left', async () => {
    const f = await makeFixture(t); // fixture schedule: 1 per day, every day
    expect(((await (await call(t.app, f.viewer.cookie, 'GET', `/medications/${f.medicationId}/stock`)).json()) as { stock: { tracked: boolean } }).stock.tracked).toBe(false);
    expect((await call(t.app, f.editor.cookie, 'POST', `/medications/${f.medicationId}/stock-movements`, { quantity: 30, reason: 'refill' })).status).toBe(201);
    expect((await call(t.app, f.editor.cookie, 'POST', `/medications/${f.medicationId}/stock-movements`, { quantity: -2, reason: 'adjustment' })).status).toBe(201);
    const stock = ((await (await call(t.app, f.viewer.cookie, 'GET', `/medications/${f.medicationId}/stock`)).json()) as { stock: { remaining: number; daysLeft: number } }).stock;
    expect(stock).toMatchObject({ remaining: 28, daysLeft: 28 });
  });

  it('rejects a zero quantity and the dose reason from the API', async () => {
    const f = await makeFixture(t);
    expect((await call(t.app, f.editor.cookie, 'POST', `/medications/${f.medicationId}/stock-movements`, { quantity: 0, reason: 'refill' })).status).toBe(400);
    expect((await call(t.app, f.editor.cookie, 'POST', `/medications/${f.medicationId}/stock-movements`, { quantity: 1, reason: 'dose' })).status).toBe(400);
  });
});
