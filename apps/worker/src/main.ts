import { createDb } from '@dosecare/db';
import { SystemClock } from '@dosecare/shared';
import { runCycle } from './cycle';
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
const everyMs = Number(process.env.CYCLE_SECONDS ?? 30) * 1000;

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick() {
  timer = undefined; // a signal during a cycle must wait for it to finish
  try {
    const r = await runCycle(db, { mailer, clock });
    console.log(`[worker] ${clock.now().toISOString()} ${JSON.stringify(r)}`);
  } catch (err) {
    console.error('[worker] cycle failed', err);
  }
  if (!stopping) timer = setTimeout(tick, everyMs);
  else await pool.end();
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    stopping = true;
    if (timer) {
      clearTimeout(timer);
      void pool.end().then(() => process.exit(0));
    }
  });
}
void tick();
