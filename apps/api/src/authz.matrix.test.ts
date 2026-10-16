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
  { method: 'POST', pattern: '/recipients/:id/invitations', min: 'owner', url: (f) => `/recipients/${f.recipientId}/invitations`, body: { email: 'new@example.com', role: 'viewer' } },
  { method: 'GET', pattern: '/recipients/:id/invitations', min: 'owner', url: (f) => `/recipients/${f.recipientId}/invitations` },
  { method: 'DELETE', pattern: '/recipients/:id/invitations/:invitationId', min: 'owner', url: (f) => `/recipients/${f.recipientId}/invitations/${f.invitationId}` },
  { method: 'GET', pattern: '/recipients/:id/medications', min: 'viewer', url: (f) => `/recipients/${f.recipientId}/medications` },
  { method: 'POST', pattern: '/recipients/:id/medications', min: 'editor', url: (f) => `/recipients/${f.recipientId}/medications`, body: { name: 'N', unit: 'mg', schedules: [] } },
  { method: 'GET', pattern: '/medications/:id', min: 'viewer', url: (f) => `/medications/${f.medicationId}` },
  { method: 'PATCH', pattern: '/medications/:id', min: 'editor', url: (f) => `/medications/${f.medicationId}`, body: { name: 'N' } },
  { method: 'DELETE', pattern: '/medications/:id', min: 'editor', url: (f) => `/medications/${f.medicationId}` },
  { method: 'POST', pattern: '/medications/:id/schedules', min: 'editor', url: (f) => `/medications/${f.medicationId}/schedules`, body: { daysOfWeek: [1], timeOfDay: '08:00', quantityPerDose: 1, startDate: '2026-01-01' } },
  { method: 'PUT', pattern: '/schedules/:id', min: 'editor', url: (f) => `/schedules/${f.scheduleId}`, body: { daysOfWeek: [1], timeOfDay: '08:00', quantityPerDose: 1, startDate: '2026-01-01' } },
  { method: 'DELETE', pattern: '/schedules/:id', min: 'editor', url: (f) => `/schedules/${f.scheduleId}` },
  { method: 'GET', pattern: '/medications/:id/stock', min: 'viewer', url: (f) => `/medications/${f.medicationId}/stock` },
  { method: 'POST', pattern: '/medications/:id/stock-movements', min: 'editor', url: (f) => `/medications/${f.medicationId}/stock-movements`, body: { quantity: 5, reason: 'refill' } },
  { method: 'GET', pattern: '/recipients/:id/doses', min: 'viewer', url: (f) => `/recipients/${f.recipientId}/doses?from=2026-01-05&to=2026-01-06` },
  { method: 'POST', pattern: '/doses/:id/take', min: 'editor', url: (f) => `/doses/${f.doseId}/take` },
  { method: 'POST', pattern: '/doses/:id/skip', min: 'editor', url: (f) => `/doses/${f.doseId}/skip` },
  { method: 'GET', pattern: '/recipients/:id/preferences', min: 'viewer', url: (f) => `/recipients/${f.recipientId}/preferences` },
  { method: 'PUT', pattern: '/recipients/:id/preferences', min: 'viewer', url: (f) => `/recipients/${f.recipientId}/preferences`, body: { remindersEnabled: true, missedAlertEnabled: true, missedAlertDelayMinutes: 30 } },
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
