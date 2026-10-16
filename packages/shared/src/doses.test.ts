import { describe, expect, it } from 'vitest';
import { doseTimesBetween } from './doses';

const base = { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timeOfDay: '08:00', startDate: '2026-01-01' };
const iso = (ds: Date[]) => ds.map((d) => d.toISOString());

describe('doseTimesBetween', () => {
  it('converts local time to UTC for a normal winter day', () => {
    const r = doseTimesBetween({ ...base, timeZone: 'Europe/Paris', from: new Date('2026-01-05T00:00:00Z'), to: new Date('2026-01-06T00:00:00Z') });
    expect(iso(r)).toEqual(['2026-01-05T07:00:00.000Z']);
  });

  it('spring-forward gap: 02:30 does not exist, yields exactly one dose shifted forward', () => {
    const r = doseTimesBetween({ ...base, timeOfDay: '02:30', timeZone: 'Europe/Paris', from: new Date('2026-03-29T00:00:00Z'), to: new Date('2026-03-30T00:00:00Z') });
    expect(iso(r)).toEqual(['2026-03-29T01:30:00.000Z']); // 03:30 CEST
  });

  it('fall-back overlap: 02:30 happens twice, yields exactly one dose at the first occurrence', () => {
    const r = doseTimesBetween({ ...base, timeOfDay: '02:30', timeZone: 'Europe/Paris', from: new Date('2026-10-25T00:00:00Z'), to: new Date('2026-10-26T00:00:00Z') });
    expect(iso(r)).toEqual(['2026-10-25T00:30:00.000Z']); // 02:30 CEST
  });

  it('a time zone behind UTC lands on the next UTC day', () => {
    const r = doseTimesBetween({ ...base, daysOfWeek: [1], timeOfDay: '20:00', timeZone: 'America/New_York', from: new Date('2026-01-05T00:00:00Z'), to: new Date('2026-01-07T00:00:00Z') });
    expect(iso(r)).toEqual(['2026-01-06T01:00:00.000Z']); // Monday 20:00 EST
  });

  it('respects weekdays, start and end dates, and the half-open range', () => {
    const r = doseTimesBetween({ ...base, daysOfWeek: [1, 3], timeZone: 'UTC', startDate: '2026-01-07', endDate: '2026-01-12', from: new Date('2026-01-05T00:00:00Z'), to: new Date('2026-01-14T00:00:00Z') });
    expect(iso(r)).toEqual(['2026-01-07T08:00:00.000Z', '2026-01-12T08:00:00.000Z']);
    const edge = doseTimesBetween({ ...base, timeZone: 'UTC', from: new Date('2026-01-05T08:00:00Z'), to: new Date('2026-01-06T08:00:00Z') });
    expect(iso(edge)).toEqual(['2026-01-05T08:00:00.000Z']);
  });
});
