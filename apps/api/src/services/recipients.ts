import { schema, type Db } from '@dosecare/db';
import type { Role } from '@dosecare/shared';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function addMember(tx: Tx | Db, input: { recipientId: string; userId: string; role: Role }) {
  await tx.insert(schema.recipientMembers).values(input);
  await tx.insert(schema.notificationPreferences).values({
    recipientId: input.recipientId,
    userId: input.userId,
    remindersEnabled: input.role === 'owner',
    missedAlertEnabled: true,
  });
}

export async function createRecipient(
  db: Db,
  input: { ownerId: string; displayName: string; timeZone: string },
) {
  return db.transaction(async (tx) => {
    const [recipient] = await tx
      .insert(schema.recipients)
      .values({ displayName: input.displayName, timeZone: input.timeZone })
      .returning();
    await addMember(tx, { recipientId: recipient!.id, userId: input.ownerId, role: 'owner' });
    return recipient!;
  });
}
