import { describe, expect, it } from 'vitest';
import { localDate, localDayStartUtc } from './time';

describe('time helpers', () => {
  it('localDate uses the recipient zone', () => {
    expect(localDate(new Date('2026-01-05T23:30:00Z'), 'Europe/Paris')).toBe('2026-01-06');
    expect(localDate(new Date('2026-01-05T23:30:00Z'), 'UTC')).toBe('2026-01-05');
  });
  it('localDayStartUtc returns local midnight in UTC, DST aware', () => {
    expect(localDayStartUtc('2026-01-06', 'Europe/Paris').toISOString()).toBe('2026-01-05T23:00:00.000Z');
    expect(localDayStartUtc('2026-07-06', 'Europe/Paris').toISOString()).toBe('2026-07-05T22:00:00.000Z');
  });
});
