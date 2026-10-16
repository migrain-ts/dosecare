import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, type Db } from '@dosecare/db';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(db: Db, userId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

export async function findSession(db: Db, token: string, now: Date) {
  const [row] = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        isNull(schema.sessions.revokedAt),
        gt(schema.sessions.expiresAt, now),
      ),
    );
  return row ?? null;
}

export async function revokeSession(db: Db, token: string, now: Date) {
  await db.update(schema.sessions).set({ revokedAt: now }).where(eq(schema.sessions.tokenHash, hashToken(token)));
}
