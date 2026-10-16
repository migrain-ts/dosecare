import { and, eq, gt } from 'drizzle-orm';
import { schema, type Db } from '@dosecare/db';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function deleteFuturePendingDoses(
  db: Db | Tx,
  filter: { scheduleId: string } | { medicationId: string } | { recipientId: string },
  now: Date,
) {
  const scope =
    'scheduleId' in filter
      ? eq(schema.doseEvents.scheduleId, filter.scheduleId)
      : 'medicationId' in filter
        ? eq(schema.doseEvents.medicationId, filter.medicationId)
        : eq(schema.doseEvents.recipientId, filter.recipientId);
  await db.delete(schema.doseEvents).where(and(scope, eq(schema.doseEvents.status, 'pending'), gt(schema.doseEvents.scheduledAt, now)));
}
