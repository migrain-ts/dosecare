import type { Db } from '@dosecare/db';
import type { Clock } from '@dosecare/shared';
import { dispatch } from './dispatch';
import { enqueueLowStock, enqueueMissedAlerts, enqueueReminders, markMissed } from './enqueue';
import type { Mailer } from './mailer';
import { materializeDoses } from './materialize';

export async function runCycle(db: Db, deps: { mailer: Mailer; clock: Clock; random?: () => number }) {
  const now = deps.clock.now();
  const materialized = await materializeDoses(db, now);
  const reminders = await enqueueReminders(db, now);
  const missedAlerts = await enqueueMissedAlerts(db, now);
  const markedMissed = await markMissed(db, now);
  const lowStock = await enqueueLowStock(db, now);
  const { sent } = await dispatch(db, deps);
  return { materialized, reminders, missedAlerts, markedMissed, lowStock, sent };
}
