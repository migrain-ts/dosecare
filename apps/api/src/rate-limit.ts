import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';
import type { Clock } from '@dosecare/shared';
import { ApiError } from './errors';

const SWEEP_EVERY = 1000;

function clientKey(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const last = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function rateLimit(opts: { clock: Clock; windowMs: number; max: number; trustProxy?: boolean }): MiddlewareHandler & {
  size: () => number;
} {
  const hits = new Map<string, number[]>();
  let calls = 0;
  const mw: MiddlewareHandler = async (c, next) => {
    const now = opts.clock.now().getTime();
    if (++calls % SWEEP_EVERY === 0) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= opts.windowMs)) hits.delete(k);
    }
    const key = `${c.req.path}:${clientKey(c, opts.trustProxy ?? false)}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) {
      hits.set(key, recent);
      throw new ApiError(429, 'rate_limited', 'Too many attempts, try again later');
    }
    recent.push(now);
    hits.set(key, recent);
    await next();
  };
  return Object.assign(mw, { size: () => hits.size });
}
