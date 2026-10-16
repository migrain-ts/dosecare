import { describe, expect, it } from 'vitest';
import {
  doseQuerySchema, invitationCreateSchema, isValidTimeZone, medicationCreateSchema,
  preferencesSchema, registerSchema, scheduleInputSchema, stockMovementSchema,
} from './schemas';

describe('schemas', () => {
  it('register lowercases the email, requires a 10+ char password, defaults the zone', () => {
    const r = registerSchema.parse({ email: 'A@B.io', password: '0123456789', name: 'A' });
    expect(r.email).toBe('a@b.io');
    expect(r.timeZone).toBe('UTC');
    expect(registerSchema.safeParse({ email: 'a@b.io', password: 'short', name: 'A' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.io', password: '0123456789', name: 'A', timeZone: 'Mars/Base' }).success).toBe(false);
  });
  it('schedule validates days, time and quantity', () => {
    const ok = { daysOfWeek: [1, 7], timeOfDay: '08:30', quantityPerDose: 1.5, startDate: '2026-01-01' };
    expect(scheduleInputSchema.safeParse(ok).success).toBe(true);
    expect(scheduleInputSchema.safeParse({ ...ok, daysOfWeek: [0] }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...ok, daysOfWeek: [] }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...ok, timeOfDay: '25:00' }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...ok, quantityPerDose: 0 }).success).toBe(false);
  });
  it('medication needs at least a name and a unit', () => {
    expect(medicationCreateSchema.safeParse({ name: 'X', unit: 'mg', schedules: [] }).success).toBe(true);
    expect(medicationCreateSchema.safeParse({ name: '', unit: 'mg', schedules: [] }).success).toBe(false);
  });
  it('stock movement rejects zero and the dose reason', () => {
    expect(stockMovementSchema.safeParse({ quantity: 30, reason: 'refill' }).success).toBe(true);
    expect(stockMovementSchema.safeParse({ quantity: 0, reason: 'refill' }).success).toBe(false);
    expect(stockMovementSchema.safeParse({ quantity: -1, reason: 'dose' }).success).toBe(false);
  });
  it('preferences bound the alert delay to 0..120', () => {
    const p = { remindersEnabled: true, missedAlertEnabled: true, missedAlertDelayMinutes: 30 };
    expect(preferencesSchema.safeParse(p).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...p, missedAlertDelayMinutes: 121 }).success).toBe(false);
  });
  it('invitation needs a valid email and a non-owner or owner role', () => {
    expect(invitationCreateSchema.safeParse({ email: 'x@y.io', role: 'viewer' }).success).toBe(true);
    expect(invitationCreateSchema.safeParse({ email: 'nope', role: 'viewer' }).success).toBe(false);
  });
  it('dose query needs ISO dates', () => {
    expect(doseQuerySchema.safeParse({ from: '2026-01-01', to: '2026-01-07' }).success).toBe(true);
    expect(doseQuerySchema.safeParse({ from: 'yesterday', to: '2026-01-07' }).success).toBe(false);
  });
  it('isValidTimeZone', () => {
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Nope/Zone')).toBe(false);
  });
});
