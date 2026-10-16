import { sql } from 'drizzle-orm';
import type { Db } from '@dosecare/db';

const count = (res: { rows: unknown[] }) => res.rows.length;

export async function enqueueReminders(db: Db, now: Date, opts: { staleMinutes?: number } = {}) {
  const stale = opts.staleMinutes ?? 30;
  return count(
    await db.execute(sql`
      insert into notification_outbox (kind, user_id, to_email, payload, dedupe_key, next_attempt_at)
      select 'reminder', u.id, u.email,
        jsonb_build_object('doseEventId', d.id, 'medication', m.name, 'strength', m.strength, 'unit', m.unit,
          'quantity', d.quantity, 'recipientName', r.display_name, 'scheduledAt', d.scheduled_at, 'timeZone', r.time_zone),
        'reminder:' || d.id || ':' || u.id, ${now}::timestamptz
      from dose_events d
      join medications m on m.id = d.medication_id
      join recipients r on r.id = d.recipient_id
      join notification_preferences p on p.recipient_id = d.recipient_id and p.reminders_enabled
      join users u on u.id = p.user_id
      where d.status = 'pending'
        and d.scheduled_at <= ${now}::timestamptz
        and d.scheduled_at > ${now}::timestamptz - make_interval(mins => ${stale}::int)
      on conflict (dedupe_key) do nothing
      returning id`),
  );
}

export async function enqueueMissedAlerts(db: Db, now: Date) {
  return count(
    await db.execute(sql`
      insert into notification_outbox (kind, user_id, to_email, payload, dedupe_key, next_attempt_at)
      select 'missed_alert', u.id, u.email,
        jsonb_build_object('doseEventId', d.id, 'medication', m.name, 'strength', m.strength, 'unit', m.unit,
          'quantity', d.quantity, 'recipientName', r.display_name, 'scheduledAt', d.scheduled_at, 'timeZone', r.time_zone,
          'delayMinutes', p.missed_alert_delay_minutes),
        'missed:' || d.id || ':' || u.id, ${now}::timestamptz
      from dose_events d
      join medications m on m.id = d.medication_id
      join recipients r on r.id = d.recipient_id
      join notification_preferences p on p.recipient_id = d.recipient_id and p.missed_alert_enabled
      join users u on u.id = p.user_id
      where d.status in ('pending', 'missed')
        and d.scheduled_at > ${now}::timestamptz - interval '24 hours'
        and d.scheduled_at + make_interval(mins => p.missed_alert_delay_minutes) <= ${now}::timestamptz
      on conflict (dedupe_key) do nothing
      returning id`),
  );
}

export async function markMissed(db: Db, now: Date, graceMinutes = 120) {
  return count(
    await db.execute(sql`
      update dose_events set status = 'missed'
      where status = 'pending' and scheduled_at + make_interval(mins => ${graceMinutes}::int) <= ${now}::timestamptz
      returning id`),
  );
}

export async function enqueueLowStock(db: Db, now: Date, thresholdDays = 7) {
  return count(
    await db.execute(sql`
      with stock as (
        select m.id as medication_id, m.name, m.recipient_id,
          coalesce(sum(sm.quantity), 0)::float8 as remaining,
          max(sm.created_at) filter (where sm.reason = 'refill') as last_refill
        from medications m
        join stock_movements sm on sm.medication_id = m.id
        where m.active
        group by m.id
        having bool_or(sm.reason <> 'dose')
      ), daily as (
        select sc.medication_id, sum(sc.quantity_per_dose * cardinality(sc.days_of_week) / 7.0)::float8 as per_day
        from schedules sc
        join medications m on m.id = sc.medication_id
        join recipients r on r.id = m.recipient_id
        where sc.end_date is null or sc.end_date >= (${now}::timestamptz at time zone r.time_zone)::date
        group by sc.medication_id
      )
      insert into notification_outbox (kind, user_id, to_email, payload, dedupe_key, next_attempt_at)
      select 'low_stock', u.id, u.email,
        jsonb_build_object('medication', s.name, 'recipientName', r.display_name,
          'daysLeft', round((s.remaining / d.per_day)::numeric, 1), 'remaining', s.remaining),
        'low_stock:' || s.medication_id || ':' || coalesce(extract(epoch from s.last_refill)::bigint::text, '0') || ':' || u.id,
        ${now}::timestamptz
      from stock s
      join daily d on d.medication_id = s.medication_id
      join recipients r on r.id = s.recipient_id
      join recipient_members rm on rm.recipient_id = s.recipient_id and rm.role in ('owner', 'editor')
      join users u on u.id = rm.user_id
      where d.per_day > 0 and s.remaining / d.per_day <= ${thresholdDays}::int
      on conflict (dedupe_key) do nothing
      returning id`),
  );
}
