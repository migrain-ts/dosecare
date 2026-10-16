import { createDb } from '@dosecare/db';
import { numberFromEnv, SystemClock } from '@dosecare/shared';
import { runCycle } from './cycle';
import { createLifecycle } from './lifecycle';
import { SmtpMailer } from './mailer';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, pool } = createDb(url);
const mailer = new SmtpMailer({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1026),
  from: process.env.MAIL_FROM ?? 'DoseCare <no-reply@dosecare.local>',
});
const clock = new SystemClock();
const everyMs = numberFromEnv(process.env.CYCLE_SECONDS, 30) * 1000;

const lifecycle = createLifecycle({
  pool,
  cycle: () => runCycle(db, { mailer, clock }),
  everyMs,
  log: (line) => console.log(`[worker] ${clock.now().toISOString()} ${line}`),
  logError: (msg, err) => console.error(msg, err),
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => void lifecycle.stop().then(() => process.exit(0)));
}
lifecycle.start();
