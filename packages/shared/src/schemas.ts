import { z } from 'zod';

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timeZone = z.string().refine(isValidTimeZone, 'Unknown time zone');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const email = z.string().trim().toLowerCase().email();

export const roleSchema = z.enum(['owner', 'editor', 'viewer']);

export const registerSchema = z.object({
  email,
  password: z.string().min(10).max(200),
  name: z.string().trim().min(1).max(100),
  timeZone: timeZone.default('UTC'),
});
export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export const recipientCreateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  timeZone,
});
export const recipientUpdateSchema = recipientCreateSchema.partial();

export const memberUpdateSchema = z.object({ role: roleSchema });
export const invitationCreateSchema = z.object({ email, role: roleSchema });

export const scheduleInputSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM'),
  quantityPerDose: z.number().positive().max(1000),
  startDate: dateOnly,
  endDate: dateOnly.nullable().optional(),
});

export const medicationCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  strength: z.string().trim().max(50).optional(),
  unit: z.string().trim().min(1).max(20),
  schedules: z.array(scheduleInputSchema).max(10),
});
export const medicationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  strength: z.string().trim().max(50).nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
});

export const stockMovementSchema = z.object({
  quantity: z.number().refine((n) => n !== 0, 'Quantity must not be zero'),
  reason: z.enum(['refill', 'adjustment']),
});

export const preferencesSchema = z.object({
  remindersEnabled: z.boolean(),
  missedAlertEnabled: z.boolean(),
  missedAlertDelayMinutes: z.number().int().min(0).max(120),
});

export const doseQuerySchema = z.object({ from: dateOnly, to: dateOnly });

export type Role = z.infer<typeof roleSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RecipientCreate = z.infer<typeof recipientCreateSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type MedicationCreate = z.infer<typeof medicationCreateSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
