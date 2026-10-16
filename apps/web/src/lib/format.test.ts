import { describe, expect, it } from 'vitest';
import { formatInZone, scheduleSummary, stockLabel } from './format';

describe('scheduleSummary', () => {
  it('every day', () => {
    expect(scheduleSummary({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '08:00:00', quantityPerDose: 1 })).toBe('Every day at 08:00');
  });
  it('named days in week order, with a quantity when not 1', () => {
    expect(scheduleSummary({ daysOfWeek: [3, 1], timeOfDay: '20:30', quantityPerDose: 2 })).toBe('Mon, Wed at 20:30 · 2 per dose');
  });
});

describe('formatInZone (DST)', () => {
  it('formats a July instant in summer time and a January one in winter time', () => {
    expect(formatInZone('2026-07-15T06:00:00Z', 'Europe/Paris')).toBe('2026-07-15 08:00');
    expect(formatInZone('2026-01-15T07:00:00Z', 'Europe/Paris')).toBe('2026-01-15 08:00');
  });
  it('uses the local date, not the UTC date, across midnight', () => {
    expect(formatInZone('2026-07-14T22:30:00Z', 'Europe/Paris')).toBe('2026-07-15 00:30');
  });
});

describe('stockLabel', () => {
  it('untracked', () => {
    expect(stockLabel({ tracked: false, remaining: 0, daysLeft: null })).toEqual({ text: 'Stock not tracked', color: 'default' });
  });
  it('tracked without a schedule', () => {
    expect(stockLabel({ tracked: true, remaining: 12, daysLeft: null })).toEqual({ text: '12 left', color: 'default' });
  });
  it('colours by days left', () => {
    expect(stockLabel({ tracked: true, remaining: 3, daysLeft: 3 }).color).toBe('error');
    expect(stockLabel({ tracked: true, remaining: 6, daysLeft: 6.9 }).color).toBe('warning');
    expect(stockLabel({ tracked: true, remaining: 30, daysLeft: 30 })).toEqual({ text: '30 left · about 30 days', color: 'success' });
    expect(stockLabel({ tracked: true, remaining: -2, daysLeft: -2 }).text).toBe('-2 left · about 0 days');
  });
});
