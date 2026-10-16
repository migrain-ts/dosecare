import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, makeFixture, register, type TestApp } from '../test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

describe('recipients', () => {
  it('lists my recipients with my role, including shared ones', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.viewer.cookie, 'GET', '/recipients');
    const body = (await res.json()) as { recipients: { id: string; role: string }[] };
    expect(body.recipients).toEqual([expect.objectContaining({ id: f.recipientId, role: 'viewer' })]);
  });

  it('creates a recipient owned by the caller and rejects a bad time zone', async () => {
    const { cookie } = await register(t.app);
    const ok = await call(t.app, cookie, 'POST', '/recipients', { displayName: 'Mum', timeZone: 'Europe/Paris' });
    expect(ok.status).toBe(201);
    const list = (await (await call(t.app, cookie, 'GET', '/recipients')).json()) as { recipients: { displayName: string; role: string }[] };
    expect(list.recipients.find((r) => r.displayName === 'Mum')?.role).toBe('owner');
    expect((await call(t.app, cookie, 'POST', '/recipients', { displayName: 'X', timeZone: 'Mars/Base' })).status).toBe(400);
  });

  it('returns 404 for a malformed recipient id', async () => {
    const { cookie } = await register(t.app);
    expect((await call(t.app, cookie, 'GET', '/recipients/not-a-uuid')).status).toBe(404);
  });

  it('lists members with their email and role', async () => {
    const f = await makeFixture(t);
    const res = await call(t.app, f.viewer.cookie, 'GET', `/recipients/${f.recipientId}/members`);
    const { members } = (await res.json()) as { members: { userId: string; role: string; email: string }[] };
    expect(members.map((m) => m.role).sort()).toEqual(['editor', 'owner', 'viewer']);
    expect(members.every((m) => m.email.includes('@'))).toBe(true);
  });

  it('keeps at least one owner: the last owner cannot be demoted or removed', async () => {
    const f = await makeFixture(t);
    const base = `/recipients/${f.recipientId}/members/${f.owner.id}`;
    expect((await call(t.app, f.owner.cookie, 'PATCH', base, { role: 'editor' })).status).toBe(409);
    expect((await call(t.app, f.owner.cookie, 'DELETE', base)).status).toBe(409);
    // promote the viewer to owner, then the first owner can step down
    expect((await call(t.app, f.owner.cookie, 'PATCH', `/recipients/${f.recipientId}/members/${f.viewer.id}`, { role: 'owner' })).status).toBe(200);
    expect((await call(t.app, f.owner.cookie, 'PATCH', base, { role: 'editor' })).status).toBe(200);
  });

  it('last-owner guard holds for an upper-case user id', async () => {
    const f = await makeFixture(t);
    const base = `/recipients/${f.recipientId}/members/${f.owner.id.toUpperCase()}`;
    const patch = await call(t.app, f.owner.cookie, 'PATCH', base, { role: 'editor' });
    expect(patch.status).toBe(409);
    expect(((await patch.json()) as { error: { code: string } }).error.code).toBe('last_owner');
    const del = await call(t.app, f.owner.cookie, 'DELETE', base);
    expect(del.status).toBe(409);
    expect(((await del.json()) as { error: { code: string } }).error.code).toBe('last_owner');
    const r = await t.pool.query('select role from recipient_members where recipient_id=$1 and user_id=$2', [f.recipientId, f.owner.id]);
    expect(r.rows[0].role).toBe('owner');
  });

  it('removing a member also removes their notification preferences', async () => {
    const f = await makeFixture(t);
    expect((await call(t.app, f.owner.cookie, 'DELETE', `/recipients/${f.recipientId}/members/${f.viewer.id}`)).status).toBe(204);
    const prefs = await t.pool.query('select 1 from notification_preferences where recipient_id=$1 and user_id=$2', [f.recipientId, f.viewer.id]);
    expect(prefs.rows).toHaveLength(0);
  });

  it('deleting a recipient removes it for everyone', async () => {
    const f = await makeFixture(t);
    expect((await call(t.app, f.owner.cookie, 'DELETE', `/recipients/${f.recipientId}`)).status).toBe(204);
    expect((await call(t.app, f.viewer.cookie, 'GET', `/recipients/${f.recipientId}`)).status).toBe(404);
  });
});
