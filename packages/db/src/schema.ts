import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, time,
  timestamp, unique, uuid,
} from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['owner', 'editor', 'viewer']);
export const doseStatus = pgEnum('dose_status', ['pending', 'taken', 'skipped', 'missed']);
export const stockReason = pgEnum('stock_reason', ['refill', 'dose', 'adjustment']);
export const outboxKind = pgEnum('outbox_kind', ['reminder', 'missed_alert', 'low_stock', 'invitation']);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'sending', 'sent', 'failed']);

const ts = (name: string) => timestamp(name, { withTimezone: true });
const qty = (name: string) => numeric(name, { precision: 10, scale: 2, mode: 'number' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const recipients = pgTable('recipients', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  timeZone: text('time_zone').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const recipientMembers = pgTable(
  'recipient_members',
  {
    recipientId: uuid('recipient_id').notNull().references(() => recipients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.recipientId, t.userId] }), index('members_user_idx').on(t.userId)],
);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').notNull().references(() => recipients.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: memberRole('role').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const medications = pgTable(
  'medications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id').notNull().references(() => recipients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    strength: text('strength'),
    unit: text('unit').notNull(),
    active: boolean('active').notNull().default(true),
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('medications_recipient_idx').on(t.recipientId)],
);

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  daysOfWeek: integer('days_of_week').array().notNull(),
  timeOfDay: time('time_of_day').notNull(),
  quantityPerDose: qty('quantity_per_dose').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
});

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
    quantity: qty('quantity').notNull(),
    reason: stockReason('reason').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('stock_med_idx').on(t.medicationId)],
);

export const doseEvents = pgTable(
  'dose_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id').notNull().references(() => recipients.id, { onDelete: 'cascade' }),
    scheduledAt: ts('scheduled_at').notNull(),
    quantity: qty('quantity').notNull(),
    status: doseStatus('status').notNull().default('pending'),
    takenAt: ts('taken_at'),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('dose_schedule_time_uq').on(t.scheduleId, t.scheduledAt),
    index('dose_recipient_time_idx').on(t.recipientId, t.scheduledAt),
    index('dose_status_time_idx').on(t.status, t.scheduledAt),
  ],
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: outboxKind('kind').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    toEmail: text('to_email').notNull(),
    payload: jsonb('payload').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at').notNull(),
    lockedUntil: ts('locked_until'),
    lastError: text('last_error'),
    sentAt: ts('sent_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('outbox_claim_idx').on(t.status, t.nextAttemptAt)],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    recipientId: uuid('recipient_id').notNull().references(() => recipients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    remindersEnabled: boolean('reminders_enabled').notNull().default(false),
    missedAlertEnabled: boolean('missed_alert_enabled').notNull().default(true),
    missedAlertDelayMinutes: integer('missed_alert_delay_minutes').notNull().default(30),
  },
  (t) => [primaryKey({ columns: [t.recipientId, t.userId] })],
);
