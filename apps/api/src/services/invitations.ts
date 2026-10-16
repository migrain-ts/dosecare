import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { schema } from '@dosecare/db';
import type { Role } from '@dosecare/shared';
import type { Deps } from '../app';
import { hashToken } from '../auth/sessions';
import { ApiError } from '../errors';
import { addMember } from './recipients';

export const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

export async function createInvitation(
  deps: Deps,
  input: { recipientId: string; invitedBy: { id: string; name: string }; email: string; role: Role },
) {
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    const [recipient] = await tx.select().from(schema.recipients).where(eq(schema.recipients.id, input.recipientId));
    const existing = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.recipientMembers, eq(schema.recipientMembers.userId, schema.users.id))
      .where(and(eq(schema.users.email, input.email), eq(schema.recipientMembers.recipientId, input.recipientId)));
    if (existing.length > 0) throw new ApiError(409, 'already_member', 'This person already has access');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const [inv] = await tx
      .insert(schema.invitations)
      .values({ recipientId: input.recipientId, email: input.email, role: input.role, tokenHash: hashToken(token), invitedBy: input.invitedBy.id, expiresAt })
      .returning();
    await tx.insert(schema.notificationOutbox).values({
      kind: 'invitation',
      toEmail: input.email,
      dedupeKey: `invitation:${inv!.id}`,
      nextAttemptAt: now,
      payload: {
        token,
        link: `${deps.appUrl}/invitations/${token}`,
        recipientName: recipient!.displayName,
        inviterName: input.invitedBy.name,
        role: input.role,
      },
    });
    return { id: inv!.id, expiresAt };
  });
}

export async function acceptInvitation(deps: Deps, token: string, userId: string) {
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, hashToken(token)))
      .for('update');
    if (!inv) throw new ApiError(404, 'not_found', 'Invitation not found');
    if (inv.acceptedAt) throw new ApiError(409, 'invitation_used', 'This invitation was already used');
    if (inv.expiresAt <= now) throw new ApiError(409, 'invitation_expired', 'This invitation has expired');
    const [member] = await tx
      .select()
      .from(schema.recipientMembers)
      .where(and(eq(schema.recipientMembers.recipientId, inv.recipientId), eq(schema.recipientMembers.userId, userId)));
    if (member) throw new ApiError(409, 'already_member', 'You already have access');
    await addMember(tx, { recipientId: inv.recipientId, userId, role: inv.role });
    await tx.update(schema.invitations).set({ acceptedAt: now }).where(eq(schema.invitations.id, inv.id));
    return { recipientId: inv.recipientId, role: inv.role };
  });
}
