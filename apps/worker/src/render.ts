// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;
export type Kind = 'reminder' | 'missed_alert' | 'low_stock' | 'invitation';

const DISCLAIMER = 'DoseCare is a tracking tool and does not provide medical advice.';
const esc = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const time = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const dosage = (p: Payload) => `${p.quantity} ${p.unit}${p.strength ? ` (${p.strength})` : ''}`;

function build(subject: string, lines: string[]) {
  const text = [...lines, '', DISCLAIMER].join('\n');
  const html = `<div style="font-family:sans-serif">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<hr><p style="color:#666;font-size:12px">${esc(DISCLAIMER)}</p></div>`;
  return { subject, text, html };
}

export function renderEmail(kind: Kind, p: Payload) {
  switch (kind) {
    case 'reminder': {
      const at = time(p.scheduledAt, p.timeZone);
      return build(`Time for ${p.recipientName} to take ${p.medication} at ${at}`, [
        `${p.recipientName} is due to take ${p.medication} at ${at}.`,
        `Dose: ${dosage(p)}.`,
      ]);
    }
    case 'missed_alert': {
      const at = time(p.scheduledAt, p.timeZone);
      return build(`Missed dose: ${p.medication} for ${p.recipientName} (due ${at})`, [
        `The ${at} dose of ${p.medication} for ${p.recipientName} has not been recorded ${p.delayMinutes} minutes after it was due.`,
      ]);
    }
    case 'low_stock':
      return build(`Low stock: ${p.medication} for ${p.recipientName} (about ${p.daysLeft} days left)`, [
        `${p.medication} for ${p.recipientName} is running low: ${p.remaining} left, about ${p.daysLeft} days at the current schedule.`,
      ]);
    case 'invitation':
      return build(`${p.inviterName} invited you to help with ${p.recipientName}'s medication`, [
        `${p.inviterName} invited you to follow ${p.recipientName}'s medication as ${p.role}.`,
        `Accept the invitation: ${p.link}`,
      ]);
  }
}
