import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '@dosecare/shared';
import { createApp } from './app';
import { call, makeApp, makeFixture, type Fixture, type TestApp } from './test-helpers';

type Row = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pattern: string;
  min: Role;
  url: (f: Fixture) => string;
  body?: unknown;
};

// Every route that is scoped to a recipient MUST have a row here.
// Later tasks append their rows to this array.
export const MATRIX: Row[] = [
  { method: 'GET', pattern: '/recipients/:id', min: 'viewer', url: (f) => `/recipients/${f.recipientId}` },
  { method: 'PATCH', pattern: '/recipients/:id', min: 'owner', url: (f) => `/recipients/${f.recipientId}`, body: { displayName: 'Renamed' } },
  { method: 'DELETE', pattern: '/recipients/:id', min: 'owner', url: (f) => `/recipients/${f.recipientId}` },
  { method: 'GET', pattern: '/recipients/:id/members', min: 'viewer', url: (f) => `/recipients/${f.recipientId}/members` },
  { method: 'PATCH', pattern: '/recipients/:id/members/:userId', min: 'owner', url: (f) => `/recipients/${f.recipientId}/members/${f.viewer.id}`, body: { role: 'editor' } },
  { method: 'DELETE', pattern: '/recipients/:id/members/:userId', min: 'owner', url: (f) => `/recipients/${f.recipientId}/members/${f.viewer.id}` },
];

// Routes that need a session but no recipient role, or no session at all.
export const NO_ROLE_ROUTES = new Set([
  'POST /auth/register', 'POST /auth/login', 'POST /auth/logout', 'GET /auth/me',
  'GET /recipients', 'POST /recipients', 'POST /invitations/:token/accept',
  'GET /openapi.json', 'GET /docs',
]);
export const PUBLIC_ROUTES = new Set(['POST /auth/register', 'POST /auth/login', 'GET /openapi.json', 'GET /docs']);

const rank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

describe('route coverage', () => {
  it('every registered route is in the matrix or explicitly exempt', () => {
    const app = createApp({ db: t.db, clock: t.clock, appUrl: 'http://localhost:3001' });
    const registered = app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`);
    const known = new Set([...MATRIX.map((r) => `${r.method} ${r.pattern}`), ...NO_ROLE_ROUTES]);
    const missing = registered.filter((r) => !known.has(r));
    expect(missing).toEqual([]);
  });
  it('every non-public exempt route rejects anonymous callers with 401', async () => {
    for (const key of NO_ROLE_ROUTES) {
      if (PUBLIC_ROUTES.has(key)) continue;
      if (key === 'POST /invitations/:token/accept') continue; // added in Task 6
      const [method, pattern] = key.split(' ') as [string, string];
      const path = pattern.replace(':token', 'x');
      const res = await call(t.app, null, method, path, method === 'POST' ? {} : undefined);
      expect(res.status, key).toBe(401);
    }
  });
});

for (const row of MATRIX) {
  describe(`${row.method} ${row.pattern}`, () => {
    it('401 when anonymous', async () => {
      const f = await makeFixture(t);
      expect((await call(t.app, null, row.method, row.url(f), row.body)).status).toBe(401);
    });
    it('404 for a non-member (never 403)', async () => {
      const f = await makeFixture(t);
      expect((await call(t.app, f.outsider.cookie, row.method, row.url(f), row.body)).status).toBe(404);
    });
    for (const role of ['viewer', 'editor', 'owner'] as const) {
      it(`${role}: ${rank[role] < rank[row.min] ? '403' : 'allowed'}`, async () => {
        const f = await makeFixture(t);
        const res = await call(t.app, f[role].cookie, row.method, row.url(f), row.body);
        if (rank[role] < rank[row.min]) expect(res.status).toBe(403);
        else expect([403, 404]).not.toContain(res.status);
      });
    }
  });
}
