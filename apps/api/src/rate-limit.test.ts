import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '@dosecare/shared';
import { ApiError, errorHandler } from './errors';
import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
  it('sweeps expired keys so the map does not grow without bound', async () => {
    const clock = new FakeClock(new Date('2026-01-05T08:00:00Z'));
    const limiter = rateLimit({ clock, windowMs: 60_000, max: 5, trustProxy: true });
    const app = new Hono().onError(errorHandler).use('*', limiter).get('/x', (c) => c.text('ok'));
    for (let i = 0; i < 500; i++) await app.request('/x', { headers: { 'x-forwarded-for': `ip${i}` } });
    expect(limiter.size()).toBe(500);
    clock.advanceMinutes(2);
    for (let i = 0; i < 500; i++) await app.request('/x', { headers: { 'x-forwarded-for': 'same' } });
    expect(limiter.size()).toBe(1);
  });

  it('with failuresOnly, only error responses consume budget', async () => {
    const clock = new FakeClock(new Date('2026-01-05T08:00:00Z'));
    const limiter = rateLimit({ clock, windowMs: 60_000, max: 3, failuresOnly: true });
    const app = new Hono()
      .onError(errorHandler)
      .use('*', limiter)
      .get('/ok', (c) => c.text('ok'))
      .get('/fail', () => {
        throw new ApiError(401, 'invalid_credentials');
      });
    for (let i = 0; i < 10; i++) expect((await app.request('/ok')).status).toBe(200);
    const fails = [];
    for (let i = 0; i < 4; i++) fails.push((await app.request('/fail')).status);
    expect(fails).toEqual([401, 401, 401, 429]);
  });

  it('keys on a custom key function when given', async () => {
    const clock = new FakeClock(new Date('2026-01-05T08:00:00Z'));
    const limiter = rateLimit({ clock, windowMs: 60_000, max: 2, key: (c) => c.req.header('x-user') ?? 'anon' });
    const app = new Hono().onError(errorHandler).use('*', limiter).get('/x/:id', (c) => c.text('ok'));
    const hit = (user: string, path: string) => app.request(path, { headers: { 'x-user': user } });
    expect((await hit('a', '/x/1')).status).toBe(200);
    expect((await hit('a', '/x/2')).status).toBe(200);
    const res = await hit('a', '/x/3');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many attempts, try again later' } });
    expect((await hit('b', '/x/1')).status).toBe(200);
  });
});
