import { validator } from '../validate';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema, type Db } from '@dosecare/db';
import { memberUpdateSchema } from '@dosecare/shared';
import type { Env } from '../app';
import { requireAuth } from '../auth/middleware';
import { requireRole, UUID } from '../authz';
import { ApiError } from '../errors';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function assertNotLastOwner(tx: Tx, recipientId: string, userId: string) {
  const owners = await tx
    .select({ userId: schema.recipientMembers.userId })
    .from(schema.recipientMembers)
    .where(and(eq(schema.recipientMembers.recipientId, recipientId), eq(schema.recipientMembers.role, 'owner')))
    .for('update');
  if (owners.length === 1 && owners[0]!.userId === userId) {
    throw new ApiError(409, 'last_owner', 'A recipient must keep at least one owner');
  }
}

export function memberRoutes() {
  return new Hono<Env>()
    .use('*', requireAuth)
    .get('/:id/members', requireRole('viewer'), async (c) => {
      const members = await c
        .get('deps')
        .db.select({
          userId: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.recipientMembers.role,
        })
        .from(schema.recipientMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.recipientMembers.userId))
        .where(eq(schema.recipientMembers.recipientId, c.get('recipientId')))
        .orderBy(schema.recipientMembers.createdAt);
      return c.json({ members });
    })
    .patch('/:id/members/:userId', requireRole('owner'), validator('json', memberUpdateSchema), async (c) => {
      const userId = c.req.param('userId').toLowerCase();
      if (!UUID.test(userId)) throw new ApiError(404, 'not_found', 'Not found');
      const { role } = c.req.valid('json');
      const recipientId = c.get('recipientId');
      await c.get('deps').db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(schema.recipientMembers)
          .where(and(eq(schema.recipientMembers.recipientId, recipientId), eq(schema.recipientMembers.userId, userId)));
        if (!target) throw new ApiError(404, 'not_found', 'Not found');
        if (target.role === 'owner' && role !== 'owner') await assertNotLastOwner(tx, recipientId, target.userId);
        await tx
          .update(schema.recipientMembers)
          .set({ role })
          .where(and(eq(schema.recipientMembers.recipientId, recipientId), eq(schema.recipientMembers.userId, userId)));
      });
      return c.json({ userId, role });
    })
    .delete('/:id/members/:userId', requireRole('owner'), async (c) => {
      const userId = c.req.param('userId').toLowerCase();
      if (!UUID.test(userId)) throw new ApiError(404, 'not_found', 'Not found');
      const recipientId = c.get('recipientId');
      await c.get('deps').db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(schema.recipientMembers)
          .where(and(eq(schema.recipientMembers.recipientId, recipientId), eq(schema.recipientMembers.userId, userId)));
        if (!target) throw new ApiError(404, 'not_found', 'Not found');
        if (target.role === 'owner') await assertNotLastOwner(tx, recipientId, target.userId);
        await tx
          .delete(schema.recipientMembers)
          .where(and(eq(schema.recipientMembers.recipientId, recipientId), eq(schema.recipientMembers.userId, userId)));
        await tx
          .delete(schema.notificationPreferences)
          .where(and(eq(schema.notificationPreferences.recipientId, recipientId), eq(schema.notificationPreferences.userId, userId)));
      });
      return c.body(null, 204);
    });
}
