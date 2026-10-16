import { validator } from '../validate';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@dosecare/db';
import { invitationCreateSchema } from '@dosecare/shared';
import type { Env } from '../app';
import { requireAuth } from '../auth/middleware';
import { requireRole, UUID } from '../authz';
import { ApiError } from '../errors';
import { acceptInvitation, createInvitation } from '../services/invitations';

export function invitationRoutes() {
  return new Hono<Env>()
    // Scoped (not '*') so unknown paths still get the standard 404 instead of 401.
    .use('/recipients/:id/invitations/*', requireAuth)
    .use('/invitations/*', requireAuth)
    .post('/recipients/:id/invitations', requireRole('owner'), validator('json', invitationCreateSchema), async (c) => {
      const body = c.req.valid('json');
      const user = c.get('user');
      const inv = await createInvitation(c.get('deps'), { recipientId: c.get('recipientId'), invitedBy: user, ...body });
      return c.json({ invitation: inv }, 201);
    })
    .get('/recipients/:id/invitations', requireRole('owner'), async (c) => {
      const { db, clock } = c.get('deps');
      const rows = await db
        .select({ id: schema.invitations.id, email: schema.invitations.email, role: schema.invitations.role, expiresAt: schema.invitations.expiresAt })
        .from(schema.invitations)
        .where(and(eq(schema.invitations.recipientId, c.get('recipientId')), isNull(schema.invitations.acceptedAt), gt(schema.invitations.expiresAt, clock.now())));
      return c.json({ invitations: rows });
    })
    .delete('/recipients/:id/invitations/:invitationId', requireRole('owner'), async (c) => {
      const raw = c.req.param('invitationId');
      if (!UUID.test(raw)) throw new ApiError(404, 'not_found', 'Not found');
      const id = raw.toLowerCase();
      await c
        .get('deps')
        .db.delete(schema.invitations)
        .where(and(eq(schema.invitations.id, id), eq(schema.invitations.recipientId, c.get('recipientId'))));
      return c.body(null, 204);
    })
    .post('/invitations/:token/accept', async (c) => {
      const result = await acceptInvitation(c.get('deps'), c.req.param('token'), c.get('user').id);
      return c.json(result);
    });
}
