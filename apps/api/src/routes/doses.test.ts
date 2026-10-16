import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, makeFixture, type TestApp } from '../test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

describe('dose list', () => {
  it('returns doses in the requested local-day range, ordered', async () => {
    const f = await makeFixture(t); // recipient zone is UTC; fixture dose is on 2026-01-06 08:00Z
    await t.pool.query(`insert into dose_events (schedule_id, medication_id, recipient_id, scheduled_at, quantity) values ($1,$2,$3,'2026-01-06T07:00:00Z',1), ($1,$2,$3,'2026-01-09T07:00:00Z',1)`, [f.scheduleId, f.medicationId, f.recipientId]);
    const res = await call(t.app, f.viewer.cookie, 'GET', `/recipients/${f.recipientId}/doses?from=2026-01-06&to=2026-01-06`);
    const { doses } = (await res.json()) as { doses: { scheduledAt: string; medicationName: string }[] };
    expect(doses.map((d) => d.scheduledAt)).toEqual(['2026-01-06T07:00:00.000Z', '2026-01-06T08:00:00.000Z']);
    expect(doses[0]!.medicationName).toBe('Med');
  });

  it('rejects ranges over 31 days, reversed ranges and bad dates with 400', async () => {
    const f = await makeFixture(t);
    const url = (q: string) => `/recipients/${f.recipientId}/doses?${q}`;
    const big = await call(t.app, f.viewer.cookie, 'GET', url('from=2026-01-01&to=2026-03-01'));
    expect(big.status).toBe(400);
    expect(((await big.json()) as { error: { code: string } }).error.code).toBe('range_too_large');
    expect((await call(t.app, f.viewer.cookie, 'GET', url('from=2026-01-05&to=2026-01-01'))).status).toBe(400);
    expect((await call(t.app, f.viewer.cookie, 'GET', url('from=x&to=y'))).status).toBe(400);
    const cal = await call(t.app, f.viewer.cookie, 'GET', url('from=2026-02-31&to=2026-03-02'));
    expect(cal.status).toBe(400);
    const body = (await cal.json()) as { error: { code: string; message: string } };
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
    expect((await call(t.app, f.viewer.cookie, 'GET', url('from=2026-01-01&to=2026-01-31'))).status).toBe(200);
  });
});

describe('take and skip', () => {
  it('take records who and when, and decrements tracked stock', async () => {
    const f = await makeFixture(t);
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason) values ($1, 10, 'refill')`, [f.medicationId]);
    const res = await call(t.app, f.editor.cookie, 'POST', `/doses/${f.doseId}/take`);
    expect(res.status).toBe(200);
    const d = await t.pool.query('select status, taken_at, recorded_by from dose_events where id=$1', [f.doseId]);
    expect(d.rows[0].status).toBe('taken');
    expect(d.rows[0].recorded_by).toBe(f.editor.id);
    expect(d.rows[0].taken_at.toISOString()).toBe(t.clock.now().toISOString());
    const stock = await t.pool.query(`select coalesce(sum(quantity),0)::float8 as q from stock_movements where medication_id=$1`, [f.medicationId]);
    expect(stock.rows[0].q).toBe(9);
  });

  it('does not touch stock when stock is not tracked', async () => {
    const f = await makeFixture(t);
    expect((await call(t.app, f.editor.cookie, 'POST', `/doses/${f.doseId}/take`)).status).toBe(200);
    const n = await t.pool.query('select count(*)::int as n from stock_movements where medication_id=$1', [f.medicationId]);
    expect(n.rows[0].n).toBe(0);
  });

  it('two concurrent takes record one dose and one stock decrement; the loser gets 409', async () => {
    const f = await makeFixture(t);
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason) values ($1, 10, 'refill')`, [f.medicationId]);
    const [a, b] = await Promise.all([
      call(t.app, f.editor.cookie, 'POST', `/doses/${f.doseId}/take`),
      call(t.app, f.owner.cookie, 'POST', `/doses/${f.doseId}/take`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const n = await t.pool.query(`select count(*)::int as n from stock_movements where medication_id=$1 and reason='dose'`, [f.medicationId]);
    expect(n.rows[0].n).toBe(1);
  });

  it('skip does not move stock and a skipped dose cannot be taken', async () => {
    const f = await makeFixture(t);
    await t.pool.query(`insert into stock_movements (medication_id, quantity, reason) values ($1, 10, 'refill')`, [f.medicationId]);
    expect((await call(t.app, f.editor.cookie, 'POST', `/doses/${f.doseId}/skip`)).status).toBe(200);
    const n = await t.pool.query(`select count(*)::int as n from stock_movements where medication_id=$1 and reason='dose'`, [f.medicationId]);
    expect(n.rows[0].n).toBe(0);
    const again = await call(t.app, f.editor.cookie, 'POST', `/doses/${f.doseId}/take`);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('dose_not_open');
  });

  it('a missed dose can still be taken late', async () => {
    const f = await makeFixture(t);
    await t.pool.query(`update dose_events set status='missed' where id=$1`, [f.doseId]);
    expect((await call(t.app, f.editor.cookie, 'POST', `/doses/${f.doseId}/take`)).status).toBe(200);
  });

  it('returns 404 for a malformed dose id', async () => {
    const f = await makeFixture(t);
    expect((await call(t.app, f.editor.cookie, 'POST', '/doses/not-a-uuid/take')).status).toBe(404);
  });
});
