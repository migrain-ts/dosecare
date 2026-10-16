import { validator } from '../validate';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@dosecare/db';
import { recipientCreateSchema, recipientUpdateSchema } from '@dosecare/shared';
import type { Env } from '../app';
import { requireAuth } from '../auth/middleware';
import { requireRole } from '../authz';
import { deleteFuturePendingDoses } from '../services/doses';
import { createRecipient } from '../services/recipients';

export function recipientRoutes() {
  return new Hono<Env>()
    .use('*', requireAuth)
    .get('/', async (c) => {
      const rows = await c
        .get('deps')
        .db.select({
          id: schema.recipients.id,
          displayName: schema.recipients.displayName,
          timeZone: schema.recipients.timeZone,
          role: schema.recipientMembers.role,
        })
        .from(schema.recipientMembers)
        .innerJoin(schema.recipients, eq(schema.recipients.id, schema.recipientMembers.recipientId))
        .where(eq(schema.recipientMembers.userId, c.get('user').id))
        .orderBy(schema.recipients.createdAt);
      return c.json({ recipients: rows });
    })
    .post('/', validator('json', recipientCreateSchema), async (c) => {
      const body = c.req.valid('json');
      const recipient = await createRecipient(c.get('deps').db, { ownerId: c.get('user').id, ...body });
      return c.json({ recipient }, 201);
    })
    .get('/:id', requireRole('viewer'), async (c) => {
      const [r] = await c.get('deps').db.select().from(schema.recipients).where(eq(schema.recipients.id, c.get('recipientId')));
      return c.json({ recipient: { ...r!, role: c.get('role') } });
    })
    .patch('/:id', requireRole('owner'), validator('json', recipientUpdateSchema), async (c) => {
      const body = c.req.valid('json');
      const { db, clock } = c.get('deps');
      const id = c.get('recipientId');
      const r = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(schema.recipients).where(eq(schema.recipients.id, id)).for('update');
        if (Object.keys(body).length === 0) return before;
        const [after] = await tx.update(schema.recipients).set(body).where(eq(schema.recipients.id, id)).returning();
        // Pending doses already materialized in the old zone would not collide with the new-zone instants the worker
        // creates next, so drop them here; the worker regenerates them on its next cycle.
        if (after!.timeZone !== before!.timeZone) await deleteFuturePendingDoses(tx, { recipientId: id }, clock.now());
        return after;
      });
      return c.json({ recipient: r });
    })
    .delete('/:id', requireRole('owner'), async (c) => {
      await c.get('deps').db.delete(schema.recipients).where(eq(schema.recipients.id, c.get('recipientId')));
      return c.body(null, 204);
    });
}
