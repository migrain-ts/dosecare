import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, makeFixture, type TestApp } from '../test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

describe('preferences', () => {
  it('each member reads and updates only their own preferences', async () => {
    const f = await makeFixture(t);
    const url = `/recipients/${f.recipientId}/preferences`;
    const before = (await (await call(t.app, f.viewer.cookie, 'GET', url)).json()) as { preferences: { remindersEnabled: boolean } };
    expect(before.preferences.remindersEnabled).toBe(false);
    const put = await call(t.app, f.viewer.cookie, 'PUT', url, { remindersEnabled: true, missedAlertEnabled: false, missedAlertDelayMinutes: 45 });
    expect(put.status).toBe(200);
    const mine = await t.pool.query('select * from notification_preferences where recipient_id=$1 and user_id=$2', [f.recipientId, f.viewer.id]);
    expect(mine.rows[0]).toMatchObject({ reminders_enabled: true, missed_alert_enabled: false, missed_alert_delay_minutes: 45 });
    const owner = await t.pool.query('select reminders_enabled from notification_preferences where recipient_id=$1 and user_id=$2', [f.recipientId, f.owner.id]);
    expect(owner.rows[0].reminders_enabled).toBe(true); // untouched default for owners
  });

  it('rejects a delay above 120 minutes', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.viewer.cookie, 'PUT', `/recipients/${f.recipientId}/preferences`, { remindersEnabled: true, missedAlertEnabled: true, missedAlertDelayMinutes: 500 });
    expect(res.status).toBe(400);
  });
});
