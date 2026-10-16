import { getCookie } from 'hono/cookie';
import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../errors';
import type { Env } from '../app';
import { findSession } from './sessions';

export const SESSION_COOKIE = 'sid';

export function tokenFrom(c: Parameters<MiddlewareHandler>[0]): string | undefined {
  const bearer = c.req.header('authorization');
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7);
  return getCookie(c, SESSION_COOKIE);
}

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const token = tokenFrom(c);
  if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in required');
  const deps = c.get('deps');
  const user = await findSession(deps.db, token, deps.clock.now());
  if (!user) throw new ApiError(401, 'unauthenticated', 'Sign in required');
  c.set('user', user);
  await next();
};
