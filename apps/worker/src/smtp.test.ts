import { describe, expect, it } from 'vitest';
import { SmtpMailer } from './mailer';

const enabled = process.env.SMTP_TEST === '1';

describe.skipIf(!enabled)('SmtpMailer against Mailpit', () => {
  it('delivers a message that Mailpit can list', async () => {
    const mailer = new SmtpMailer({ host: 'localhost', port: 1026, from: 'DoseCare <no-reply@dosecare.local>' });
    const id = `smtp-test-${Date.now()}`;
    await mailer.send({ to: 'x@example.com', subject: id, text: 'hello', html: '<p>hello</p>', messageId: id });
    const res = await fetch('http://localhost:8026/api/v1/messages');
    const body = (await res.json()) as { messages: { Subject: string }[] };
    expect(body.messages.some((m) => m.Subject === id)).toBe(true);
  });
});
