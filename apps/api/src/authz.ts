import { and, eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { schema, type Db } from '@dosecare/db';
import type { Role } from '@dosecare/shared';
import type { Env } from './app';
import { ApiError } from './errors';

const ORDER: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Resolver = (c: Context<Env>) => string | null | Promise<string | null>;

export const fromParam =
  (name = 'id'): Resolver =>
  (c) => c.req.param(name) ?? null;

const viaTable =
  (lookup: (db: Db, id: string) => Promise<string | undefined>): Resolver =>
  async (c) => {
    const id = c.req.param('id');
    if (!id || !UUID.test(id)) return null;
    return (await lookup(c.get('deps').db, id)) ?? null;
  };

export const fromMedication = viaTable(async (db, id) => {
  const [r] = await db.select({ v: schema.medications.recipientId }).from(schema.medications).where(eq(schema.medications.id, id));
  return r?.v;
});
export const fromDose = viaTable(async (db, id) => {
  const [r] = await db.select({ v: schema.doseEvents.recipientId }).from(schema.doseEvents).where(eq(schema.doseEvents.id, id));
  return r?.v;
});
export const fromSchedule = viaTable(async (db, id) => {
  const [r] = await db
    .select({ v: schema.medications.recipientId })
    .from(schema.schedules)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.schedules.medicationId))
    .where(eq(schema.schedules.id, id));
  return r?.v;
});

export function requireRole(min: Role, resolve: Resolver = fromParam()): MiddlewareHandler<Env> {
  return async (c, next) => {
    const resolved = await resolve(c);
    if (!resolved || !UUID.test(resolved)) throw new ApiError(404, 'not_found', 'Not found');
    const recipientId = resolved.toLowerCase();
    const [m] = await c
      .get('deps')
      .db.select({ role: schema.recipientMembers.role })
      .from(schema.recipientMembers)
      .where(and(eq(schema.recipientMembers.recipientId, recipientId), eq(schema.recipientMembers.userId, c.get('user').id)));
    if (!m) throw new ApiError(404, 'not_found', 'Not found');
    if (ORDER[m.role] < ORDER[min]) throw new ApiError(403, 'forbidden', 'Insufficient role');
    c.set('role', m.role);
    c.set('recipientId', recipientId);
    await next();
  };
}
