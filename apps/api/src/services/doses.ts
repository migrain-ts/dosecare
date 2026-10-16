import { and, eq, gt } from 'drizzle-orm';
import { schema, type Db } from '@dosecare/db';

export async function deleteFuturePendingDoses(
  db: Db,
  filter: { scheduleId: string } | { medicationId: string },
  now: Date,
) {
  const scope =
    'scheduleId' in filter
      ? eq(schema.doseEvents.scheduleId, filter.scheduleId)
      : eq(schema.doseEvents.medicationId, filter.medicationId);
  await db.delete(schema.doseEvents).where(and(scope, eq(schema.doseEvents.status, 'pending'), gt(schema.doseEvents.scheduledAt, now)));
}
