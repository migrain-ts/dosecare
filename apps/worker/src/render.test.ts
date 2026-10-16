import { describe, expect, it } from 'vitest';
import { renderEmail } from './render';

const dose = { medication: 'Aspirin', strength: '100', unit: 'mg', quantity: 1, recipientName: 'Mum', scheduledAt: '2026-01-05T07:00:00.000Z', timeZone: 'Europe/Paris' };
const DISCLAIMER = 'DoseCare is a tracking tool and does not provide medical advice.';

describe('renderEmail', () => {
  it('reminder shows the local time', () => {
    const m = renderEmail('reminder', dose);
    expect(m.subject).toBe('Time for Mum to take Aspirin at 08:00');
    expect(m.text).toContain('1 mg');
    expect(m.text).toContain(DISCLAIMER);
    expect(m.html).toContain(DISCLAIMER);
  });
  it('missed alert', () => {
    expect(renderEmail('missed_alert', { ...dose, delayMinutes: 30 }).subject).toBe('Missed dose: Aspirin for Mum (due 08:00)');
  });
  it('low stock', () => {
    const m = renderEmail('low_stock', { medication: 'Aspirin', recipientName: 'Mum', daysLeft: 2.5, remaining: 5 });
    expect(m.subject).toBe('Low stock: Aspirin for Mum (about 2.5 days left)');
  });
  it('invitation carries the link', () => {
    const m = renderEmail('invitation', { link: 'http://localhost:3001/invitations/abc', recipientName: 'Mum', inviterName: 'Ada', role: 'editor' });
    expect(m.subject).toBe("Ada invited you to help with Mum's medication");
    expect(m.text).toContain('http://localhost:3001/invitations/abc');
  });
  it('escapes HTML in user supplied names', () => {
    const m = renderEmail('reminder', { ...dose, medication: '<script>x</script>' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
});
