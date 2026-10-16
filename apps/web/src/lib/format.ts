const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function scheduleSummary(s: { daysOfWeek: number[]; timeOfDay: string; quantityPerDose: number }) {
  const days = [...s.daysOfWeek].sort((a, b) => a - b);
  const when = days.length === 7 ? 'Every day' : days.map((d) => DAY[d]).join(', ');
  const qty = s.quantityPerDose === 1 ? '' : ` · ${s.quantityPerDose} per dose`;
  return `${when} at ${s.timeOfDay.slice(0, 5)}${qty}`;
}

/** "YYYY-MM-DD HH:mm" of an instant in the given time zone (DST-aware). */
export function formatInZone(iso: string, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function stockLabel(s: { tracked: boolean; remaining: number; daysLeft: number | null }) {
  if (!s.tracked) return { text: 'Stock not tracked', color: 'default' as const };
  if (s.daysLeft === null) return { text: `${s.remaining} left`, color: 'default' as const };
  const color = s.daysLeft <= 3 ? ('error' as const) : s.daysLeft <= 7 ? ('warning' as const) : ('success' as const);
  return { text: `${s.remaining} left · about ${Math.max(0, Math.floor(s.daysLeft))} days`, color };
}
