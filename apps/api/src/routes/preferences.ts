import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { schema } from '@dosecare/db';
import { preferencesSchema } from '@dosecare/shared';
import type { Env } from '../app';
import { requireAuth } from '../auth/middleware';
import { requireRole } from '../authz';
import { validator } from '../validate';

export function preferenceRoutes() {
  const mine = (c: Context<Env>) =>
    and(eq(schema.notificationPreferences.recipientId, c.get('recipientId')), eq(schema.notificationPreferences.userId, c.get('user').id));
  return new Hono<Env>()
    .use('*', requireAuth)
    .get('/:id/preferences', requireRole('viewer'), async (c) => {
      const [p] = await c.get('deps').db.select().from(schema.notificationPreferences).where(mine(c));
      return c.json({ preferences: p });
    })
    .put('/:id/preferences', requireRole('viewer'), validator('json', preferencesSchema), async (c) => {
      const [p] = await c.get('deps').db.update(schema.notificationPreferences).set(c.req.valid('json')).where(mine(c)).returning();
      return c.json({ preferences: p });
    });
}
