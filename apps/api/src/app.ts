import { Hono } from 'hono';
import type { Db } from '@dosecare/db';
import type { Clock } from '@dosecare/shared';
import { authRoutes } from './auth/routes';
import { errorHandler } from './errors';

export type Deps = { db: Db; clock: Clock; secureCookies?: boolean };
export type Env = {
  Variables: { user: { id: string; email: string; name: string }; deps: Deps };
};

export function createApp(deps: Deps) {
  return new Hono<Env>()
    .use('*', async (c, next) => {
      c.set('deps', deps);
      await next();
    })
    .onError(errorHandler)
    .route('/auth', authRoutes(deps));
}

export type AppType = ReturnType<typeof createApp>;
