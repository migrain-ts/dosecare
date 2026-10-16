import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '@dosecare/shared';
import { errorHandler } from './errors';
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
});
