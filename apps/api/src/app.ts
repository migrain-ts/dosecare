import { Hono } from 'hono';
import type { Db } from '@dosecare/db';
import type { Clock, Role } from '@dosecare/shared';
import { authRoutes } from './auth/routes';
import { errorHandler } from './errors';
import { invitationRoutes } from './routes/invitations';
import { memberRoutes } from './routes/members';
import { recipientRoutes } from './routes/recipients';

export type Deps = { db: Db; clock: Clock; appUrl: string; secureCookies?: boolean; trustProxy?: boolean };
export type Env = {
  Variables: {
    user: { id: string; email: string; name: string };
    deps: Deps;
    role: Role;
    recipientId: string;
  };
};

export function createApp(deps: Deps) {
  return new Hono<Env>()
    .use('*', async (c, next) => {
      c.set('deps', deps);
      await next();
    })
    .onError(errorHandler)
    .notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404))
    .route('/auth', authRoutes(deps))
    .route('/recipients', recipientRoutes())
    .route('/recipients', memberRoutes())
    .route('/', invitationRoutes());
}

export type AppType = ReturnType<typeof createApp>;
