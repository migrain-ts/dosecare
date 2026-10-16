import { sql } from 'drizzle-orm';
import type { Db } from './client';

export type Stock = { tracked: boolean; remaining: number; dailyConsumption: number; daysLeft: number | null };

export async function getStock(db: Db, medicationId: string, today: string): Promise<Stock> {
  const res = await db.execute(sql`
    select
      exists (select 1 from stock_movements where medication_id = ${medicationId} and reason <> 'dose') as tracked,
      coalesce((select sum(quantity) from stock_movements where medication_id = ${medicationId}), 0)::float8 as remaining,
      coalesce((select sum(quantity_per_dose * cardinality(days_of_week) / 7.0) from schedules
                where medication_id = ${medicationId} and (end_date is null or end_date >= ${today}::date)), 0)::float8 as daily
  `);
  const row = res.rows[0] as { tracked: boolean; remaining: number; daily: number };
  const daysLeft = row.tracked && row.daily > 0 ? row.remaining / row.daily : null;
  return { tracked: row.tracked, remaining: row.remaining, dailyConsumption: row.daily, daysLeft };
}
