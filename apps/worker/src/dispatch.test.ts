import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock } from '@dosecare/shared';
import { createTestDb } from '@dosecare/db';
import { dispatch } from './dispatch';
import { FakeMailer } from './mailer';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const NOW = new Date('2026-01-05T08:00:00Z');
let n = 0;
async function row(over: Partial<{ kind: string; payload: object; status: string; attempts: number; nextAttemptAt: Date; lockedUntil: Date | null }> = {}) {
  const key = `k${++n}-${Math.random()}`;
  await t.pool.query(
    `insert into notification_outbox (kind, to_email, payload, dedupe_key, status, attempts, next_attempt_at, locked_until)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [over.kind ?? 'reminder', 'a@example.com', over.payload ?? { medication: 'Aspirin', unit: 'mg', quantity: 1, recipientName: 'Mum', scheduledAt: NOW.toISOString(), timeZone: 'UTC' }, key, over.status ?? 'pending', over.attempts ?? 0, over.nextAttemptAt ?? NOW, over.lockedUntil ?? null],
  );
  return key;
}
const get = async (key: string) => (await t.pool.query('select * from notification_outbox where dedupe_key=$1', [key])).rows[0];
const deps = (mailer = new FakeMailer(), clock = new FakeClock(NOW)) => ({ mailer, clock, random: () => 0.5 });

describe('dispatch', () => {
  it('sends a due row once, using the dedupe key as message id', async () => {
    const key = await row();
    const d = deps();
    const r = await dispatch(t.db, d);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(d.mailer.sent.find((m) => m.messageId === key)?.to).toBe('a@example.com');
    const after = await get(key);
    expect(after).toMatchObject({ status: 'sent', attempts: 1, locked_until: null });
    expect(after.sent_at).toBeInstanceOf(Date);
    const again = deps(d.mailer);
    await dispatch(t.db, again);
    expect(d.mailer.sent.filter((m) => m.messageId === key)).toHaveLength(1);
  });

  it('does not send rows scheduled in the future', async () => {
    const key = await row({ nextAttemptAt: new Date(NOW.getTime() + 60_000) });
    const d = deps();
    await dispatch(t.db, d);
    expect(d.mailer.sent.find((m) => m.messageId === key)).toBeUndefined();
    expect((await get(key)).status).toBe('pending');
  });

  it('removes the invitation token from the stored payload after sending', async () => {
    const key = await row({ kind: 'invitation', payload: { token: 'secret', link: 'http://x/invitations/secret', recipientName: 'Mum', inviterName: 'Ada', role: 'viewer' } });
    await dispatch(t.db, deps());
    const after = await get(key);
    expect(after.status).toBe('sent');
    expect(after.payload.token).toBeUndefined();
    expect(JSON.stringify(after.payload)).not.toContain('"secret"');
  });

  it('a failed send is retried later with exponential backoff and jitter, and keeps the error', async () => {
    const key = await row();
    const mailer = new FakeMailer();
    mailer.failWith = new Error('smtp down');
    const clock = new FakeClock(NOW);
    await dispatch(t.db, deps(mailer, clock));
    let r = await get(key);
    expect(r).toMatchObject({ status: 'pending', attempts: 1, last_error: 'smtp down' });
    expect(r.next_attempt_at.toISOString()).toBe(new Date(NOW.getTime() + 30_000).toISOString()); // 30 s * 2^0 * 1.0
    clock.advanceMs(29_000);
    await dispatch(t.db, deps(mailer, clock));
    expect((await get(key)).attempts).toBe(1); // not due yet
    clock.advanceMs(2_000);
    await dispatch(t.db, deps(mailer, clock));
    r = await get(key);
    expect(r.attempts).toBe(2);
    expect(r.next_attempt_at.toISOString()).toBe(new Date(clock.now().getTime() + 60_000).toISOString());
  });

  it('becomes failed after the maximum number of attempts', async () => {
    const key = await row({ attempts: 4 });
    const mailer = new FakeMailer();
    mailer.failWith = new Error('still down');
    const r = await dispatch(t.db, deps(mailer), { maxAttempts: 5 });
    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect(await get(key)).toMatchObject({ status: 'failed', attempts: 5, last_error: 'still down' });
  });

  it('reclaims a row left in sending by a crashed worker, but not one still locked', async () => {
    const crashed = await row({ status: 'sending', attempts: 1, lockedUntil: new Date(NOW.getTime() - 1000) });
    const busy = await row({ status: 'sending', attempts: 1, lockedUntil: new Date(NOW.getTime() + 60_000) });
    const d = deps();
    await dispatch(t.db, d);
    expect(d.mailer.sent.find((m) => m.messageId === crashed)).toBeDefined();
    expect(d.mailer.sent.find((m) => m.messageId === busy)).toBeUndefined();
    expect((await get(busy)).status).toBe('sending');
  });

  it('two dispatchers running at once send every row exactly once', async () => {
    const keys: string[] = [];
    for (let i = 0; i < 30; i++) keys.push(await row());
    const mailer = new FakeMailer();
    mailer.delayMs = 5;
    const clock = new FakeClock(NOW);
    const run = async () => {
      for (let i = 0; i < 4; i++) await dispatch(t.db, { mailer, clock, random: () => 0.5 }, { batchSize: 8 });
    };
    await Promise.all([run(), run()]);
    const ids = mailer.sent.map((m) => m.messageId).filter((id) => keys.includes(id));
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
  });
});
