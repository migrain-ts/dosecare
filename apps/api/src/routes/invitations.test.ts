import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, makeFixture, register, type TestApp } from '../test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

async function invite(f: Awaited<ReturnType<typeof makeFixture>>, email = 'friend@example.com', role = 'editor') {
  const res = await call(t.app, f.owner.cookie, 'POST', `/recipients/${f.recipientId}/invitations`, { email, role });
  expect(res.status).toBe(201);
  const out = await t.pool.query(`select payload from notification_outbox where kind='invitation' and to_email=$1 order by created_at desc limit 1`, [email]);
  return { token: out.rows[0].payload.token as string, payload: out.rows[0].payload };
}

describe('invitations', () => {
  it('stores only the token hash and queues an email whose link carries the token', async () => {
    const f = await makeFixture(t);
    const { token, payload } = await invite(f);
    const rows = await t.pool.query('select token_hash from invitations where email=$1', ['friend@example.com']);
    expect(rows.rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(rows.rows[0].token_hash).not.toBe(token);
    expect(payload.link).toBe(`http://localhost:3001/invitations/${token}`);
    expect(payload.role).toBe('editor');
  });

  it('accepting adds the member with the invited role and reminders off', async () => {
    const f = await makeFixture(t);
    const { token } = await invite(f);
    const guest = await register(t.app);
    const res = await call(t.app, guest.cookie, 'POST', `/invitations/${token}/accept`);
    expect(res.status).toBe(200);
    const m = await t.pool.query('select role from recipient_members where recipient_id=$1 and user_id=$2', [f.recipientId, guest.user.id]);
    expect(m.rows[0].role).toBe('editor');
    const p = await t.pool.query('select reminders_enabled, missed_alert_enabled from notification_preferences where recipient_id=$1 and user_id=$2', [f.recipientId, guest.user.id]);
    expect(p.rows[0]).toEqual({ reminders_enabled: false, missed_alert_enabled: true });
  });

  it('is single use', async () => {
    const f = await makeFixture(t);
    const { token } = await invite(f);
    const a = await register(t.app);
    const b = await register(t.app);
    expect((await call(t.app, a.cookie, 'POST', `/invitations/${token}/accept`)).status).toBe(200);
    expect((await call(t.app, b.cookie, 'POST', `/invitations/${token}/accept`)).status).toBe(409);
  });

  it('expires after 7 days', async () => {
    const f = await makeFixture(t);
    const { token } = await invite(f);
    const guest = await register(t.app);
    t.clock.advanceMinutes(8 * 24 * 60);
    const res = await call(t.app, guest.cookie, 'POST', `/invitations/${token}/accept`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invitation_expired');
    t.clock.advanceMinutes(-8 * 24 * 60);
  });

  it('rejects an unknown token with 404 and requires a session', async () => {
    const guest = await register(t.app);
    expect((await call(t.app, guest.cookie, 'POST', '/invitations/unknown-token/accept')).status).toBe(404);
    expect((await call(t.app, null, 'POST', '/invitations/unknown-token/accept')).status).toBe(401);
  });

  it('refuses to invite someone who is already a member, and keeps the invitation unused if they accept while a member', async () => {
    const f = await makeFixture(t);
    const dup = await call(t.app, f.owner.cookie, 'POST', `/recipients/${f.recipientId}/invitations`, { email: 'x@example.com', role: 'viewer' });
    expect(dup.status).toBe(201);
    const { token } = await invite(f, 'member@example.com', 'viewer');
    const res = await call(t.app, f.viewer.cookie, 'POST', `/invitations/${token}/accept`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('already_member');
    const row = await t.pool.query('select accepted_at from invitations where email=$1', ['member@example.com']);
    expect(row.rows[0].accepted_at).toBeNull();
  });

  it('owner can list pending invitations and revoke one; a revoked token is gone', async () => {
    const f = await makeFixture(t);
    const { token } = await invite(f, 'later@example.com', 'viewer');
    const list = (await (await call(t.app, f.owner.cookie, 'GET', `/recipients/${f.recipientId}/invitations`)).json()) as { invitations: { id: string; email: string }[] };
    const mine = list.invitations.find((i) => i.email === 'later@example.com')!;
    expect((await call(t.app, f.owner.cookie, 'DELETE', `/recipients/${f.recipientId}/invitations/${mine.id}`)).status).toBe(204);
    const guest = await register(t.app);
    expect((await call(t.app, guest.cookie, 'POST', `/invitations/${token}/accept`)).status).toBe(404);
  });

  it('revokes with an upper-case invitation id from the path', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.owner.cookie, 'DELETE', `/recipients/${f.recipientId}/invitations/${f.invitationId.toUpperCase()}`);
    expect(res.status).toBe(204);
    const left = await t.pool.query('select 1 from invitations where id=$1', [f.invitationId]);
    expect(left.rowCount).toBe(0);
  });
});
