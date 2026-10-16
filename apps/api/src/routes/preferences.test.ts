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
    const rows = async () =>
      (
        await t.pool.query(
          'select user_id, reminders_enabled, missed_alert_enabled, missed_alert_delay_minutes from notification_preferences where recipient_id=$1 order by user_id',
          [f.recipientId],
        )
      ).rows;
    const others = async () => (await rows()).filter((r) => r.user_id !== f.viewer.id);
    const before = (await (await call(t.app, f.viewer.cookie, 'GET', url)).json()) as { preferences: { remindersEnabled: boolean } };
    expect(before.preferences.remindersEnabled).toBe(false);
    const othersBefore = await others();
    expect(othersBefore.length).toBeGreaterThanOrEqual(2);
    const put = await call(t.app, f.viewer.cookie, 'PUT', url, { remindersEnabled: true, missedAlertEnabled: false, missedAlertDelayMinutes: 45 });
    expect(put.status).toBe(200);
    const mine = (await rows()).find((r) => r.user_id === f.viewer.id);
    expect(mine).toMatchObject({ reminders_enabled: true, missed_alert_enabled: false, missed_alert_delay_minutes: 45 });
    expect(await others()).toEqual(othersBefore); // every other member's row is untouched
    const after = (await (await call(t.app, f.viewer.cookie, 'GET', url)).json()) as {
      preferences: { userId: string; remindersEnabled: boolean; missedAlertEnabled: boolean; missedAlertDelayMinutes: number };
    };
    expect(after.preferences).toMatchObject({ userId: f.viewer.id, remindersEnabled: true, missedAlertEnabled: false, missedAlertDelayMinutes: 45 });
  });

  it('rejects a delay above 120 minutes', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.viewer.cookie, 'PUT', `/recipients/${f.recipientId}/preferences`, { remindersEnabled: true, missedAlertEnabled: true, missedAlertDelayMinutes: 500 });
    expect(res.status).toBe(400);
  });
});
