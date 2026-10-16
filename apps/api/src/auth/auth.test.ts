import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@dosecare/db';
import { eq } from 'drizzle-orm';
import { call, makeApp, register, type TestApp } from '../test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

describe('registration', () => {
  it('creates the user, a self recipient owned by them, owner preferences, and a session cookie', async () => {
    const { cookie, user, recipientId } = await register(t.app, 'Ada@Example.com', 'Ada', 'Europe/Paris');
    expect(user.email).toBe('ada@example.com');
    const me = await call(t.app, cookie, 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe('ada@example.com');
    const [member] = await t.db.select().from(schema.recipientMembers).where(eq(schema.recipientMembers.recipientId, recipientId));
    expect(member).toMatchObject({ userId: user.id, role: 'owner' });
    const [prefs] = await t.db.select().from(schema.notificationPreferences).where(eq(schema.notificationPreferences.recipientId, recipientId));
    expect(prefs).toMatchObject({ remindersEnabled: true, missedAlertEnabled: true });
    const [rec] = await t.db.select().from(schema.recipients).where(eq(schema.recipients.id, recipientId));
    expect(rec).toMatchObject({ displayName: 'Ada', timeZone: 'Europe/Paris' });
  });

  it('rejects a duplicate email with 409 and an invalid body with 400', async () => {
    await register(t.app, 'dup@example.com');
    const dup = await call(t.app, null, 'POST', '/auth/register', { email: 'dup@example.com', password: 'correct horse battery', name: 'X' });
    expect(dup.status).toBe(409);
    const bad = await call(t.app, null, 'POST', '/auth/register', { email: 'nope', password: 'x', name: '' });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string; message: string } };
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('email');
  });

  it('returns the standard 400 shape for malformed JSON', async () => {
    const res = await t.app.request('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_request');
    expect(typeof body.error.message).toBe('string');
  });

  it('returns the standard 404 shape for unknown routes', async () => {
    const res = await call(t.app, null, 'GET', '/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('never stores the raw session token', async () => {
    const { cookie } = await register(t.app);
    const raw = cookie.split('=')[1]!;
    const rows = await t.pool.query('select token_hash from sessions');
    expect(rows.rows.some((r) => r.token_hash === raw)).toBe(false);
  });
});

describe('login and sessions', () => {
  it('returns the same 401 for an unknown email and a wrong password', async () => {
    await register(t.app, 'known@example.com');
    const a = await call(t.app, null, 'POST', '/auth/login', { email: 'known@example.com', password: 'wrong wrong wrong' });
    const b = await call(t.app, null, 'POST', '/auth/login', { email: 'ghost@example.com', password: 'wrong wrong wrong' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });

  it('logs in with the right password', async () => {
    await register(t.app, 'login@example.com');
    const res = await call(t.app, null, 'POST', '/auth/login', { email: 'login@example.com', password: 'correct horse battery' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('logout revokes the session', async () => {
    const { cookie } = await register(t.app);
    expect((await call(t.app, cookie, 'POST', '/auth/logout')).status).toBe(204);
    expect((await call(t.app, cookie, 'GET', '/auth/me')).status).toBe(401);
  });

  it('rejects an expired session and an unknown token', async () => {
    const { cookie } = await register(t.app);
    t.clock.advanceMinutes(31 * 24 * 60);
    try {
      expect((await call(t.app, cookie, 'GET', '/auth/me')).status).toBe(401);
    } finally {
      t.clock.advanceMinutes(-31 * 24 * 60);
    }
    expect((await call(t.app, 'sid=not-a-token', 'GET', '/auth/me')).status).toBe(401);
    expect((await call(t.app, null, 'GET', '/auth/me')).status).toBe(401);
  });

  it('accepts the session token as a Bearer token', async () => {
    const { cookie } = await register(t.app);
    const token = cookie.split('=')[1]!;
    const res = await t.app.request('/auth/me', { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('rate limits failed logins: the 11th attempt is the first 429, and it recovers', async () => {
    const f = await makeApp();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await call(f.app, null, 'POST', '/auth/login', { email: 'victim@example.com', password: 'wrong wrong wrong' });
      statuses.push(r.status);
    }
    expect(statuses).toEqual([...Array<number>(10).fill(401), 429, 429]);
    f.clock.advanceMinutes(16);
    const after = await call(f.app, null, 'POST', '/auth/login', { email: 'victim@example.com', password: 'wrong wrong wrong' });
    expect(after.status).toBe(401);
    await f.close();
  });

  it('counts failed logins only: successful logins in between do not consume budget', async () => {
    const f = await makeApp();
    try {
      await register(f.app, 'good@example.com');
      const good = () => call(f.app, null, 'POST', '/auth/login', { email: 'good@example.com', password: 'correct horse battery' });
      const bad = () => call(f.app, null, 'POST', '/auth/login', { email: 'good@example.com', password: 'wrong wrong wrong' });
      for (let i = 0; i < 15; i++) expect((await good()).status).toBe(200);
      const statuses: number[] = [];
      for (let i = 0; i < 9; i++) {
        statuses.push((await bad()).status);
        statuses.push((await good()).status);
      }
      expect(statuses).toEqual(Array.from({ length: 18 }, (_, i) => (i % 2 === 0 ? 401 : 200)));
      expect((await bad()).status).toBe(401); // 10th failure
      expect((await bad()).status).toBe(429);
      expect((await good()).status).toBe(429);
    } finally {
      await f.close();
    }
  });

  it('ignores a spoofed x-forwarded-for when trustProxy is off', async () => {
    const f = await makeApp();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await call(f.app, null, 'POST', '/auth/login', { email: 'spoof@example.com', password: 'wrong wrong wrong' }, { 'x-forwarded-for': `9.9.9.${i}` });
      statuses.push(r.status);
    }
    expect(statuses).toEqual([...Array<number>(10).fill(401), 429]);
    await f.close();
  });

  it('uses the rightmost x-forwarded-for entry as an independent bucket', async () => {
    const p = await makeApp({ trustProxy: true });
    try {
      const login = (ip: string, spoof = '1.1.1.1') =>
        call(p.app, null, 'POST', '/auth/login', { email: 'x@example.com', password: 'wrong wrong wrong' }, { 'x-forwarded-for': `${spoof}, ${ip}` });
      for (let i = 0; i < 10; i++) expect((await login('10.0.0.1', `evil${i}`)).status).toBe(401);
      expect((await login('10.0.0.1', 'another')).status).toBe(429);
      expect((await login('10.0.0.2')).status).toBe(401);
    } finally {
      await p.close();
    }
  });
});
