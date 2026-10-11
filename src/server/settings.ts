import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import type { RaisePolicy } from "@/lib/allocation";
import { PLAN_END, PLAN_START, type MonthKey, clampToPlan, currentMonthKey } from "@/lib/months";
import type { DbOrTx } from "./audit";

export async function getSetting<T>(db: DbOrTx, key: string, fallback: T): Promise<T> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!rows.length) return fallback;
  try {
    return JSON.parse(rows[0].valueJson) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(db: DbOrTx, key: string, value: unknown): Promise<void> {
  const valueJson = JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key, valueJson })
    .onConflictDoUpdate({ target: settings.key, set: { valueJson, updatedAt: new Date().toISOString() } });
}

export async function getRaisePolicy(db: DbOrTx): Promise<RaisePolicy> {
  return getSetting<RaisePolicy>(db, "raise_policy", "manual");
}

export async function getPlanPeriod(db: DbOrTx): Promise<{ start: MonthKey; end: MonthKey }> {
  const start = await getSetting<MonthKey>(db, "plan_start", PLAN_START);
  const end = await getSetting<MonthKey>(db, "plan_end", PLAN_END);
  return { start, end };
}

/** Bulan berjalan yang dijepit ke periode rencana. */
export async function getCurrentPlanMonth(db: DbOrTx, now: Date = new Date()): Promise<MonthKey> {
  const { start, end } = await getPlanPeriod(db);
  return clampToPlan(currentMonthKey(now), start, end);
}
