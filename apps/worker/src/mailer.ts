import nodemailer from 'nodemailer';

export type Message = { to: string; subject: string; text: string; html: string; messageId: string };
export interface Mailer {
  send(m: Message): Promise<void>;
}

export class FakeMailer implements Mailer {
  sent: Message[] = [];
  failWith?: Error;
  delayMs = 0;
  async send(m: Message) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failWith) throw this.failWith;
    this.sent.push(m);
  }
}

export class SmtpMailer implements Mailer {
  private transport;
  constructor(private o: { host: string; port: number; from: string }) {
    this.transport = nodemailer.createTransport({ host: o.host, port: o.port, secure: false, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 15_000 });
  }
  async send(m: Message) {
    await this.transport.sendMail({
      from: this.o.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      messageId: `<${m.messageId}@dosecare.local>`,
    });
  }
}
