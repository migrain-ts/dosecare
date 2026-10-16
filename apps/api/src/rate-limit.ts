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

export function rateLimit(opts: {
  clock: Clock;
  windowMs: number;
  max: number;
  trustProxy?: boolean;
  /** Bucket key; defaults to `<path>:<client address>`. */
  key?: (c: Context) => string;
  /** Count only requests that end in an error response (status >= 400). */
  failuresOnly?: boolean;
}): MiddlewareHandler & {
  size: () => number;
} {
  const hits = new Map<string, number[]>();
  let calls = 0;
  const mw: MiddlewareHandler = async (c, next) => {
    const now = opts.clock.now().getTime();
    if (++calls % SWEEP_EVERY === 0) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= opts.windowMs)) hits.delete(k);
    }
    const key = opts.key ? opts.key(c) : `${c.req.path}:${clientKey(c, opts.trustProxy ?? false)}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
    if (recent.length >= opts.max) {
      hits.set(key, recent);
      throw new ApiError(429, 'rate_limited', 'Too many attempts, try again later');
    }
    // Reserve the slot before running the handler so concurrent requests cannot all slip past the check.
    recent.push(now);
    hits.set(key, recent);
    await next();
    if (opts.failuresOnly && c.res.status < 400) {
      const i = recent.indexOf(now);
      if (i !== -1) recent.splice(i, 1);
    }
  };
  return Object.assign(mw, { size: () => hits.size });
}
