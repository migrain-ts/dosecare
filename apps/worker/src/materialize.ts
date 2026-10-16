import { eq } from 'drizzle-orm';
import { schema, type Db } from '@dosecare/db';
import { doseTimesBetween } from '@dosecare/shared';

export async function materializeDoses(
  db: Db,
  now: Date,
  opts: { lookbackMinutes?: number; horizonHours?: number } = {},
): Promise<number> {
  const from = new Date(now.getTime() - (opts.lookbackMinutes ?? 60) * 60_000);
  const to = new Date(now.getTime() + (opts.horizonHours ?? 48) * 3_600_000);
  const rows = await db
    .select({
      scheduleId: schema.schedules.id,
      medicationId: schema.medications.id,
      recipientId: schema.medications.recipientId,
      daysOfWeek: schema.schedules.daysOfWeek,
      timeOfDay: schema.schedules.timeOfDay,
      quantity: schema.schedules.quantityPerDose,
      startDate: schema.schedules.startDate,
      endDate: schema.schedules.endDate,
      timeZone: schema.recipients.timeZone,
    })
    .from(schema.schedules)
    .innerJoin(schema.medications, eq(schema.medications.id, schema.schedules.medicationId))
    .innerJoin(schema.recipients, eq(schema.recipients.id, schema.medications.recipientId))
    .where(eq(schema.medications.active, true));

  const values = rows.flatMap((r) =>
    doseTimesBetween({
      daysOfWeek: r.daysOfWeek,
      timeOfDay: r.timeOfDay.slice(0, 5),
      timeZone: r.timeZone,
      startDate: r.startDate,
      endDate: r.endDate,
      from,
      to,
    }).map((scheduledAt) => ({
      scheduleId: r.scheduleId,
      medicationId: r.medicationId,
      recipientId: r.recipientId,
      scheduledAt,
      quantity: r.quantity,
    })),
  );

  let inserted = 0;
  for (let i = 0; i < values.length; i += 500) {
    const res = await db
      .insert(schema.doseEvents)
      .values(values.slice(i, i + 500))
      .onConflictDoNothing()
      .returning({ id: schema.doseEvents.id });
    inserted += res.length;
  }
  return inserted;
}
