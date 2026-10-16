import { describe, expect, it } from 'vitest';
import { FakeClock, SystemClock } from './clock';

describe('FakeClock', () => {
  it('returns the start date and a copy each time', () => {
    const c = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    const a = c.now();
    a.setFullYear(2000);
    expect(c.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('advances by minutes and milliseconds', () => {
    const c = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    c.advanceMinutes(90);
    c.advanceMs(1000);
    expect(c.now().toISOString()).toBe('2026-01-01T01:30:01.000Z');
  });
  it('can be set', () => {
    const c = new FakeClock(new Date(0));
    c.set(new Date('2027-05-05T05:05:05Z'));
    expect(c.now().toISOString()).toBe('2027-05-05T05:05:05.000Z');
  });
});
describe('SystemClock', () => {
  it('returns a recent date', () => {
    expect(Math.abs(new SystemClock().now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
