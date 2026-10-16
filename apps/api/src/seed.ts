import { eq } from 'drizzle-orm';
import { schema, type Db } from '@dosecare/db';
import { doseTimesBetween, type Clock } from '@dosecare/shared';
import { hashPassword } from './auth/password';
import { addMember, createRecipient } from './services/recipients';

const TZ = 'Europe/Paris';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

type DoseRow = typeof schema.doseEvents.$inferInsert;

export async function seedDemo(db: Db, clock: Clock): Promise<{ created: boolean }> {
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, 'demo@dosecare.local'));
  if (existing) return { created: false };

  const now = clock.now();
  const passwordHash = await hashPassword('demo-password-123');
  const [demo] = await db.insert(schema.users).values({ email: 'demo@dosecare.local', passwordHash, name: 'Demo User' }).returning();
  const [sam] = await db.insert(schema.users).values({ email: 'sam@dosecare.local', passwordHash, name: 'Sam Carer' }).returning();

  await createRecipient(db, { ownerId: demo!.id, displayName: 'Demo User', timeZone: TZ });
  const rose = await createRecipient(db, { ownerId: demo!.id, displayName: 'Grandma Rose', timeZone: TZ });
  await addMember(db, { recipientId: rose.id, userId: sam!.id, role: 'editor' });
  const leo = await createRecipient(db, { ownerId: sam!.id, displayName: 'Leo', timeZone: TZ });
  await addMember(db, { recipientId: leo.id, userId: demo!.id, role: 'viewer' });

  const startDate = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const addMed = async (recipientId: string, name: string, strength: string | null, unit: string, times: string[], refill: number) => {
    const [m] = await db.insert(schema.medications).values({ recipientId, name, strength, unit }).returning();
    const scheds = [];
    for (const timeOfDay of times) {
      const [s] = await db.insert(schema.schedules).values({ medicationId: m!.id, daysOfWeek: ALL_DAYS, timeOfDay, quantityPerDose: 1, startDate }).returning();
      scheds.push(s!);
    }
    await db.insert(schema.stockMovements).values({ medicationId: m!.id, quantity: refill, reason: 'refill', createdAt: new Date(now.getTime() - 5 * 86_400_000) });
    return { med: m!, scheds };
  };

  const metformin = await addMed(rose.id, 'Metformin', '500', 'mg', ['08:00', '20:00'], 60);
  await addMed(rose.id, 'Lisinopril', '10', 'mg', ['09:00'], 30);
  await addMed(rose.id, 'Vitamin D', '1000', 'IU', ['12:00'], 6);
  await addMed(leo.id, 'Allergy syrup', '5', 'ml', ['19:00'], 20);

  // Seven days of history for Metformin: mostly taken, one skipped, one missed.
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const scheduled = metformin.scheds
    .flatMap((s) =>
      doseTimesBetween({ daysOfWeek: ALL_DAYS, timeOfDay: s.timeOfDay.slice(0, 5), timeZone: TZ, startDate, from, to: new Date(now.getTime() - 3 * 3_600_000) }).map(
        (scheduledAt) => ({ scheduleId: s.id, scheduledAt }),
      ),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const rows: DoseRow[] = scheduled.map(({ scheduleId, scheduledAt }, i): DoseRow => {
    const base = { scheduleId, medicationId: metformin.med.id, recipientId: rose.id, scheduledAt, quantity: 1 };
    if (i === 2) return { ...base, status: 'skipped', recordedBy: demo!.id };
    if (i === 3) return { ...base, status: 'missed' };
    return { ...base, status: 'taken', takenAt: new Date(scheduledAt.getTime() + 10 * 60_000), recordedBy: demo!.id };
  });
  await db.insert(schema.doseEvents).values(rows);
  return { created: true };
}
