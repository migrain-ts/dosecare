import { DateTime } from 'luxon';

type Input = {
  daysOfWeek: number[];
  timeOfDay: string; // HH:MM
  timeZone: string;
  startDate: string;
  endDate?: string | null;
  from: Date;
  to: Date;
};

function resolveLocal(day: DateTime, hour: number, minute: number): DateTime {
  const dt = day.set({ hour, minute, second: 0, millisecond: 0 }); // gap: luxon shifts forward
  const earlier = dt.minus({ hours: 1 });
  // Overlap: if one hour earlier shows the same wall-clock time, take the first occurrence.
  return earlier.hour === dt.hour && earlier.minute === dt.minute ? earlier : dt;
}

export function doseTimesBetween(o: Input): Date[] {
  const [h, m] = o.timeOfDay.split(':').map(Number) as [number, number];
  const out: Date[] = [];
  const last = DateTime.fromJSDate(o.to, { zone: o.timeZone }).startOf('day').plus({ days: 1 });
  for (let day = DateTime.fromJSDate(o.from, { zone: o.timeZone }).startOf('day').minus({ days: 1 }); day <= last; day = day.plus({ days: 1 })) {
    const iso = day.toISODate()!;
    if (iso < o.startDate || (o.endDate && iso > o.endDate)) continue;
    if (!o.daysOfWeek.includes(day.weekday)) continue;
    const t = resolveLocal(day, h, m);
    if (t.toMillis() >= o.from.getTime() && t.toMillis() < o.to.getTime()) out.push(t.toJSDate());
  }
  return out;
}
