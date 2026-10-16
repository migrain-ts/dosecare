import { Hono } from 'hono';
import type { Db } from '@dosecare/db';
import type { Clock, Role } from '@dosecare/shared';
import { authRoutes } from './auth/routes';
import { errorHandler } from './errors';
import { buildOpenApi, DOCS_HTML } from './openapi';
import { doseRoutes } from './routes/doses';
import { invitationRoutes } from './routes/invitations';
import { medicationRoutes } from './routes/medications';
import { memberRoutes } from './routes/members';
import { preferenceRoutes } from './routes/preferences';
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
  // eslint-disable-next-line prefer-const
  let self: Hono<Env>;
  const app = new Hono<Env>()
    .use('*', async (c, next) => {
      c.set('deps', deps);
      await next();
    })
    .onError(errorHandler)
    .notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404))
    .get('/openapi.json', (c) => c.json(buildOpenApi(self.routes)))
    .get('/docs', (c) => c.html(DOCS_HTML))
    .route('/auth', authRoutes(deps))
    .route('/recipients', recipientRoutes())
    .route('/recipients', memberRoutes())
    .route('/recipients', preferenceRoutes())
    .route('/', invitationRoutes(deps))
    .route('/', medicationRoutes())
    .route('/', doseRoutes());
  self = app;
  return app;
}

export type AppType = ReturnType<typeof createApp>;
