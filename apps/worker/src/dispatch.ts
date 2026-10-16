import { sql } from 'drizzle-orm';
import type { Db } from '@dosecare/db';
import type { Clock } from '@dosecare/shared';
import type { Mailer } from './mailer';
import { renderEmail, type Kind } from './render';

type Row = { id: string; kind: Kind; to_email: string; payload: Record<string, unknown>; dedupe_key: string; attempts: number };

export async function dispatch(
  db: Db,
  deps: { mailer: Mailer; clock: Clock; random?: () => number },
  opts: { batchSize?: number; visibilityMs?: number; maxAttempts?: number } = {},
) {
  const { batchSize = 20, visibilityMs = 60_000, maxAttempts = 5 } = opts;
  const random = deps.random ?? Math.random;
  const now = deps.clock.now();
  const lockedUntil = new Date(now.getTime() + visibilityMs);

  await db.execute(sql`
    update notification_outbox
    set status = 'failed', locked_until = null, last_error = 'worker crashed while sending (max attempts reached)'
    where status = 'sending' and locked_until <= ${now}::timestamptz and attempts >= ${maxAttempts}`);

  const claimed = await db.execute(sql`
    with c as (
      select id from notification_outbox
      where (status = 'pending' and next_attempt_at <= ${now}::timestamptz)
         or (status = 'sending' and locked_until <= ${now}::timestamptz and attempts < ${maxAttempts})
      order by next_attempt_at
      limit ${batchSize}
      for update skip locked
    )
    update notification_outbox o
    set status = 'sending', locked_until = ${lockedUntil}::timestamptz, attempts = o.attempts + 1
    from c where o.id = c.id
    returning o.id, o.kind, o.to_email, o.payload, o.dedupe_key, o.attempts`);

  const result = { sent: 0, retried: 0, failed: 0 };
  for (const row of claimed.rows as Row[]) {
    try {
      const email = renderEmail(row.kind, row.payload);
      await deps.mailer.send({ to: row.to_email, messageId: row.dedupe_key, ...email });
      const done = await db.execute(sql`
        update notification_outbox
        set status = 'sent', sent_at = ${deps.clock.now()}::timestamptz, locked_until = null, last_error = null, payload = payload - 'token' - 'link'
        where id = ${row.id} and status = 'sending' and attempts = ${row.attempts}`);
      if (done.rowCount) result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (row.attempts >= maxAttempts) {
        const done = await db.execute(sql`
          update notification_outbox set status = 'failed', locked_until = null, last_error = ${message}
          where id = ${row.id} and status = 'sending' and attempts = ${row.attempts}`);
        if (done.rowCount) result.failed++;
      } else {
        const base = Math.min(30_000 * 2 ** (row.attempts - 1), 3_600_000);
        const next = new Date(deps.clock.now().getTime() + base * (0.8 + 0.4 * random()));
        const done = await db.execute(sql`
          update notification_outbox
          set status = 'pending', locked_until = null, last_error = ${message}, next_attempt_at = ${next}::timestamptz
          where id = ${row.id} and status = 'sending' and attempts = ${row.attempts}`);
        if (done.rowCount) result.retried++;
      }
    }
  }
  return result;
}
