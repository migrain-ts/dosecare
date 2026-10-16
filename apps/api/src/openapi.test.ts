import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { ROUTE_DOCS } from './openapi';
import { makeApp, type TestApp } from './test-helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

describe('OpenAPI', () => {
  it('documents every registered route', () => {
    const app = createApp({ db: t.db, clock: t.clock, appUrl: 'http://localhost:3100' });
    const registered = app.routes
      .filter((r) => r.method !== 'ALL' && !['/openapi.json', '/docs'].includes(r.path))
      .map((r) => `${r.method} ${r.path}`);
    expect(registered.filter((r) => !(r in ROUTE_DOCS))).toEqual([]);
  });

  it('serves a 3.1 document with request schemas', async () => {
    const res = await t.app.request('/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { properties: Record<string, unknown> } }> } }>>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/recipients/{id}']!.get).toBeDefined();
    const reg = doc.paths['/auth/register']!.post!.requestBody!.content['application/json']!.schema;
    expect(reg.properties.email).toBeDefined();
  });

  it('serves the docs page', async () => {
    const res = await t.app.request('/docs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.4/');
    expect(html).toMatch(/integrity="sha384-[A-Za-z0-9+/=]{64}"/);
    expect(html).toContain('crossorigin="anonymous"');
  });

  it('keeps unknown routes on the standard 404', async () => {
    const res = await t.app.request('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
