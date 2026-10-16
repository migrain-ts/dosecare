import { validator } from '../validate';
import { asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getStock, schema } from '@dosecare/db';
import { localDate, medicationCreateSchema, medicationUpdateSchema, scheduleInputSchema, stockMovementSchema } from '@dosecare/shared';
import type { Env } from '../app';
import { requireAuth } from '../auth/middleware';
import { fromMedication, fromSchedule, requireRole } from '../authz';
import { ApiError } from '../errors';
import { deleteFuturePendingDoses } from '../services/doses';

const scheduleValues = (s: import('@dosecare/shared').ScheduleInput) => ({
  daysOfWeek: s.daysOfWeek,
  timeOfDay: s.timeOfDay,
  quantityPerDose: s.quantityPerDose,
  startDate: s.startDate,
  endDate: s.endDate ?? null,
});

// Path ids are validated as UUIDs by requireRole; lower-case before any use.
const pid = (c: import('hono').Context<Env>) => c.req.param('id')!.toLowerCase();

export function medicationRoutes() {
  const loadMed = async (c: import('hono').Context<Env>) => {
    const [m] = await c.get('deps').db.select().from(schema.medications).where(eq(schema.medications.id, pid(c)));
    if (!m) throw new ApiError(404, 'not_found', 'Not found');
    return m;
  };
  const recipientZone = async (c: import('hono').Context<Env>, recipientId: string) => {
    const [r] = await c.get('deps').db.select({ tz: schema.recipients.timeZone }).from(schema.recipients).where(eq(schema.recipients.id, recipientId));
    return r!.tz;
  };

  return new Hono<Env>()
    // Scoped (not '*') so unknown paths still get the standard 404 instead of 401.
    .use('/recipients/:id/medications/*', requireAuth)
    .use('/medications/*', requireAuth)
    .use('/schedules/*', requireAuth)
    .get('/recipients/:id/medications', requireRole('viewer'), async (c) => {
      const { db, clock } = c.get('deps');
      const meds = await db.select().from(schema.medications).where(eq(schema.medications.recipientId, c.get('recipientId'))).orderBy(asc(schema.medications.name));
      const ids = meds.map((m) => m.id);
      const scheds = ids.length ? await db.select().from(schema.schedules).where(inArray(schema.schedules.medicationId, ids)) : [];
      const today = localDate(clock.now(), await recipientZone(c, c.get('recipientId')));
      const out = await Promise.all(
        meds.map(async (m) => ({ ...m, schedules: scheds.filter((s) => s.medicationId === m.id), stock: await getStock(db, m.id, today) })),
      );
      return c.json({ medications: out });
    })
    .post('/recipients/:id/medications', requireRole('editor'), validator('json', medicationCreateSchema), async (c) => {
      const body = c.req.valid('json');
      const { db } = c.get('deps');
      const result = await db.transaction(async (tx) => {
        const [m] = await tx
          .insert(schema.medications)
          .values({ recipientId: c.get('recipientId'), name: body.name, strength: body.strength ?? null, unit: body.unit })
          .returning();
        const scheds = body.schedules.length
          ? await tx.insert(schema.schedules).values(body.schedules.map((s) => ({ medicationId: m!.id, ...scheduleValues(s) }))).returning()
          : [];
        return { ...m!, schedules: scheds };
      });
      return c.json({ medication: result }, 201);
    })
    .get('/medications/:id', requireRole('viewer', fromMedication), async (c) => {
      const m = await loadMed(c);
      const scheds = await c.get('deps').db.select().from(schema.schedules).where(eq(schema.schedules.medicationId, m.id));
      return c.json({ medication: { ...m, schedules: scheds } });
    })
    .patch('/medications/:id', requireRole('editor', fromMedication), validator('json', medicationUpdateSchema), async (c) => {
      const body = c.req.valid('json');
      const { db } = c.get('deps');
      if (Object.keys(body).length) await db.update(schema.medications).set(body).where(eq(schema.medications.id, pid(c)));
      return c.json({ medication: await loadMed(c) });
    })
    .delete('/medications/:id', requireRole('editor', fromMedication), async (c) => {
      const { db, clock } = c.get('deps');
      const today = localDate(clock.now(), await recipientZone(c, c.get('recipientId')));
      await db.update(schema.medications).set({ active: false, endDate: today }).where(eq(schema.medications.id, pid(c)));
      await deleteFuturePendingDoses(db, { medicationId: pid(c) }, clock.now());
      return c.body(null, 204);
    })
    .post('/medications/:id/schedules', requireRole('editor', fromMedication), validator('json', scheduleInputSchema), async (c) => {
      const [s] = await c.get('deps').db.insert(schema.schedules).values({ medicationId: pid(c), ...scheduleValues(c.req.valid('json')) }).returning();
      return c.json({ schedule: s }, 201);
    })
    .put('/schedules/:id', requireRole('editor', fromSchedule), validator('json', scheduleInputSchema), async (c) => {
      const { db, clock } = c.get('deps');
      const [s] = await db.update(schema.schedules).set(scheduleValues(c.req.valid('json'))).where(eq(schema.schedules.id, pid(c))).returning();
      await deleteFuturePendingDoses(db, { scheduleId: pid(c) }, clock.now());
      return c.json({ schedule: s });
    })
    .delete('/schedules/:id', requireRole('editor', fromSchedule), async (c) => {
      const { db, clock } = c.get('deps');
      await deleteFuturePendingDoses(db, { scheduleId: pid(c) }, clock.now());
      await db.delete(schema.schedules).where(eq(schema.schedules.id, pid(c)));
      return c.body(null, 204);
    })
    .get('/medications/:id/stock', requireRole('viewer', fromMedication), async (c) => {
      const { db, clock } = c.get('deps');
      const today = localDate(clock.now(), await recipientZone(c, c.get('recipientId')));
      return c.json({ stock: await getStock(db, pid(c), today) });
    })
    .post('/medications/:id/stock-movements', requireRole('editor', fromMedication), validator('json', stockMovementSchema), async (c) => {
      const body = c.req.valid('json');
      const [mv] = await c.get('deps').db.insert(schema.stockMovements).values({ medicationId: pid(c), ...body }).returning();
      return c.json({ movement: mv }, 201);
    });
}
