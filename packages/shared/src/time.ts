import { DateTime } from 'luxon';

export function localDate(now: Date, timeZone: string): string {
  return DateTime.fromJSDate(now, { zone: timeZone }).toISODate()!;
}

export function localDayStartUtc(date: string, timeZone: string): Date {
  return DateTime.fromISO(date, { zone: timeZone }).startOf('day').toUTC().toJSDate();
}
