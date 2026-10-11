/**
 * Representasi bulan: string "YYYY-MM". Pengurutan string = pengurutan kronologis.
 */

export type MonthKey = string;

export const PLAN_START: MonthKey = "2026-10";
export const PLAN_END: MonthKey = "2031-09";
export const PLAN_MONTH_COUNT = 60;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export const MONTH_NAMES_SHORT_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

export function isValidMonthKey(key: string): key is MonthKey {
  return MONTH_RE.test(key);
}

export function parseMonth(key: MonthKey): { year: number; month: number } {
  const m = MONTH_RE.exec(key);
  if (!m) throw new Error(`Format bulan tidak valid: ${key} (harus YYYY-MM)`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function toMonthKey(year: number, month: number): MonthKey {
  if (month < 1 || month > 12) throw new Error(`Bulan di luar rentang: ${month}`);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonth(key);
  const total = year * 12 + (month - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toMonthKey(y, m);
}

/** b − a dalam bulan (positif jika b setelah a). */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function monthRange(start: MonthKey, endInclusive: MonthKey): MonthKey[] {
  const n = monthDiff(start, endInclusive);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addMonths(start, i));
}

export function planMonths(start: MonthKey = PLAN_START, count = PLAN_MONTH_COUNT): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/** "2026-10" → "Oktober 2026" */
export function formatMonthLabel(key: MonthKey): string {
  const { year, month } = parseMonth(key);
  return `${MONTH_NAMES_ID[month - 1]} ${year}`;
}

/** "2026-10" → "Okt 2026" */
export function formatMonthShort(key: MonthKey): string {
  const { year, month } = parseMonth(key);
  return `${MONTH_NAMES_SHORT_ID[month - 1]} ${year}`;
}

/** "2026-10-15" → "2026-10" */
export function monthKeyFromDate(dateStr: string): MonthKey {
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!m) throw new Error(`Format tanggal tidak valid: ${dateStr}`);
  const key = `${m[1]}-${m[2]}`;
  if (!isValidMonthKey(key)) throw new Error(`Bulan tidak valid: ${key}`);
  return key;
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return toMonthKey(now.getFullYear(), now.getMonth() + 1);
}

/** Indeks tahun rencana (1..5) relatif terhadap PLAN_START. */
export function planYearIndex(key: MonthKey, start: MonthKey = PLAN_START): number {
  return Math.floor(monthDiff(start, key) / 12) + 1;
}

export function compareMonth(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clampToPlan(key: MonthKey, start = PLAN_START, end = PLAN_END): MonthKey {
  if (key < start) return start;
  if (key > end) return end;
  return key;
}
