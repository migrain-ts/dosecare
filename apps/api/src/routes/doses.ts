import { validator } from '../validate';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@dosecare/db';
import { doseQuerySchema, localDayStartUtc } from '@dosecare/shared';
import type { Env } from '../app';
import { requireAuth } from '../auth/middleware';
import { fromDose, requireRole } from '../authz';
import { ApiError } from '../errors';

const MAX_RANGE_DAYS = 31;

export function doseRoutes() {
  const close = async (c: import('hono').Context<Env>, status: 'taken' | 'skipped') => {
    const { db, clock } = c.get('deps');
    const id = c.req.param('id')!.toLowerCase();
    await db.transaction(async (tx) => {
      const [d] = await tx
        .update(schema.doseEvents)
        .set({ status, takenAt: status === 'taken' ? clock.now() : null, recordedBy: c.get('user').id })
        .where(and(eq(schema.doseEvents.id, id), inArray(schema.doseEvents.status, ['pending', 'missed'])))
        .returning();
      if (!d) throw new ApiError(409, 'dose_not_open', 'This dose was already recorded');
      if (status === 'taken') {
        await tx.execute(sql`
          insert into stock_movements (medication_id, quantity, reason)
          select ${d.medicationId}, ${-d.quantity}, 'dose'
          where exists (select 1 from stock_movements where medication_id = ${d.medicationId} and reason <> 'dose')
        `);
      }
    });
    return c.json({ id, status });
  };

  return new Hono<Env>()
    // Scoped (not '*') so unknown paths still get the standard 404 instead of 401.
    .use('/recipients/:id/doses/*', requireAuth)
    .use('/recipients/:id/doses', requireAuth)
    .use('/doses/*', requireAuth)
    .get('/recipients/:id/doses', requireRole('viewer'), validator('query', doseQuerySchema), async (c) => {
      const { from, to } = c.req.valid('query');
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
      if (days < 1) throw new ApiError(400, 'invalid_range', '`to` must not be before `from`');
      if (days > MAX_RANGE_DAYS) throw new ApiError(400, 'range_too_large', `At most ${MAX_RANGE_DAYS} days per request`);
      const { db } = c.get('deps');
      const [r] = await db.select({ tz: schema.recipients.timeZone }).from(schema.recipients).where(eq(schema.recipients.id, c.get('recipientId')));
      const start = localDayStartUtc(from, r!.tz);
      const nextDay = new Date(Date.parse(to) + 86_400_000).toISOString().slice(0, 10);
      const end = localDayStartUtc(nextDay, r!.tz);
      const rows = await db
        .select({
          id: schema.doseEvents.id,
          medicationId: schema.doseEvents.medicationId,
          medicationName: schema.medications.name,
          scheduledAt: schema.doseEvents.scheduledAt,
          quantity: schema.doseEvents.quantity,
          status: schema.doseEvents.status,
          takenAt: schema.doseEvents.takenAt,
        })
        .from(schema.doseEvents)
        .innerJoin(schema.medications, eq(schema.medications.id, schema.doseEvents.medicationId))
        .where(and(eq(schema.doseEvents.recipientId, c.get('recipientId')), gte(schema.doseEvents.scheduledAt, start), lt(schema.doseEvents.scheduledAt, end)))
        .orderBy(asc(schema.doseEvents.scheduledAt));
      return c.json({ doses: rows });
    })
    .post('/doses/:id/take', requireRole('editor', fromDose), (c) => close(c, 'taken'))
    .post('/doses/:id/skip', requireRole('editor', fromDose), (c) => close(c, 'skipped'));
}
