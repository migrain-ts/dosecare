import type { MiddlewareHandler } from 'hono';
import type { Clock } from '@dosecare/shared';
import { ApiError } from './errors';

export function rateLimit(opts: { clock: Clock; windowMs: number; max: number }): MiddlewareHandler {
  const hits = new Map<string, number[]>();
  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const key = `${c.req.path}:${ip}`;
    const now = opts.clock.now().getTime();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) throw new ApiError(429, 'rate_limited', 'Too many attempts, try again later');
    recent.push(now);
    hits.set(key, recent);
    await next();
  };
}
