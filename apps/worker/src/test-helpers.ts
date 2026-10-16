import { randomBytes } from 'node:crypto';
import { schema, type Db } from '@dosecare/db';

export async function seedPatient(
  db: Db,
  o: { timeZone?: string; days?: number[]; timeOfDay?: string; quantity?: number; startDate?: string } = {},
) {
  const mk = async (name: string) => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: `${name}-${randomBytes(4).toString('hex')}@example.com`, passwordHash: 'x', name })
      .returning();
    return { id: u!.id, email: u!.email };
  };
  const owner = await mk('owner');
  const editor = await mk('editor');
  const viewer = await mk('viewer');
  const [r] = await db.insert(schema.recipients).values({ displayName: 'Mum', timeZone: o.timeZone ?? 'Europe/Paris' }).returning();
  for (const [u, role] of [[owner, 'owner'], [editor, 'editor'], [viewer, 'viewer']] as const) {
    await db.insert(schema.recipientMembers).values({ recipientId: r!.id, userId: u.id, role });
    await db.insert(schema.notificationPreferences).values({
      recipientId: r!.id, userId: u.id, remindersEnabled: role === 'owner', missedAlertEnabled: true, missedAlertDelayMinutes: 30,
    });
  }
  const [m] = await db.insert(schema.medications).values({ recipientId: r!.id, name: 'Aspirin', strength: '100', unit: 'mg' }).returning();
  const [s] = await db
    .insert(schema.schedules)
    .values({
      medicationId: m!.id, daysOfWeek: o.days ?? [1, 2, 3, 4, 5, 6, 7], timeOfDay: o.timeOfDay ?? '08:00',
      quantityPerDose: o.quantity ?? 1, startDate: o.startDate ?? '2026-01-01',
    })
    .returning();
  return { recipientId: r!.id, medicationId: m!.id, scheduleId: s!.id, owner, editor, viewer };
}
