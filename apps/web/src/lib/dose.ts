import { localDate } from '@dosecare/shared';

export type Role = 'owner' | 'editor' | 'viewer';
export type DoseStatus = 'pending' | 'taken' | 'skipped' | 'missed';

export const canRecord = (role: Role) => role === 'owner' || role === 'editor';

const META: Record<DoseStatus, { label: string; color: 'default' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'Pending', color: 'default' },
  taken: { label: 'Taken', color: 'success' },
  skipped: { label: 'Skipped', color: 'warning' },
  missed: { label: 'Missed', color: 'error' },
};
export const statusMeta = (s: DoseStatus) => META[s];

export const formatLocalTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export function todayRange(now: Date, timeZone: string) {
  const d = localDate(now, timeZone);
  return { from: d, to: d };
}
