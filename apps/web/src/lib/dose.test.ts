import { describe, expect, it } from 'vitest';
import { canRecord, formatLocalTime, statusMeta, todayRange } from './dose';

describe('dose helpers', () => {
  it('only owners and editors can record', () => {
    expect([canRecord('owner'), canRecord('editor'), canRecord('viewer')]).toEqual([true, true, false]);
  });
  it('status labels and colours', () => {
    expect(statusMeta('taken')).toEqual({ label: 'Taken', color: 'success' });
    expect(statusMeta('missed')).toEqual({ label: 'Missed', color: 'error' });
    expect(statusMeta('skipped').color).toBe('warning');
    expect(statusMeta('pending').color).toBe('default');
  });
  it('formats times in the person time zone', () => {
    expect(formatLocalTime('2026-01-05T07:00:00.000Z', 'Europe/Paris')).toBe('08:00');
    expect(formatLocalTime('2026-01-05T07:00:00.000Z', 'America/New_York')).toBe('02:00');
  });
  it('today is the local date of the person, not the viewer', () => {
    expect(todayRange(new Date('2026-01-05T23:30:00Z'), 'Europe/Paris')).toEqual({ from: '2026-01-06', to: '2026-01-06' });
    expect(todayRange(new Date('2026-01-05T23:30:00Z'), 'America/New_York')).toEqual({ from: '2026-01-05', to: '2026-01-05' });
  });
});
