import type { MonthKey } from "./months";

export type SalaryStatus = "planned" | "actual" | "superseded";

export interface SalaryChange {
  id: number;
  amount: number;
  effectiveMonth: MonthKey;
  status: SalaryStatus;
  note?: string | null;
  createdAt: string;
}

export interface ResolveOptions {
  /** true (default): perubahan `planned` ikut dipakai (untuk proyeksi). false: hanya `actual`. */
  includePlanned?: boolean;
}

/**
 * Gaji yang berlaku pada bulan `month`: perubahan dengan effectiveMonth ≤ month,
 * status bukan superseded, yang paling akhir (effectiveMonth, lalu createdAt).
 * Perubahan dengan effectiveMonth > month TIDAK pernah memengaruhi bulan sebelumnya.
 */
export function resolveSalary(
  month: MonthKey,
  changes: readonly SalaryChange[],
  opts: ResolveOptions = {},
): SalaryChange | null {
  const includePlanned = opts.includePlanned ?? true;
  let best: SalaryChange | null = null;
  for (const c of changes) {
    if (c.status === "superseded") continue;
    if (!includePlanned && c.status !== "actual") continue;
    if (c.effectiveMonth > month) continue;
    if (
      best === null ||
      c.effectiveMonth > best.effectiveMonth ||
      (c.effectiveMonth === best.effectiveMonth && c.createdAt > best.createdAt) ||
      (c.effectiveMonth === best.effectiveMonth && c.createdAt === best.createdAt && c.id > best.id)
    ) {
      best = c;
    }
  }
  return best;
}

export interface SalaryPoint {
  month: MonthKey;
  amount: number;
  changeId: number | null;
  status: SalaryStatus | null;
}

export function salarySeries(
  months: readonly MonthKey[],
  changes: readonly SalaryChange[],
  opts: ResolveOptions = {},
): SalaryPoint[] {
  return months.map((month) => {
    const c = resolveSalary(month, changes, opts);
    return {
      month,
      amount: c?.amount ?? 0,
      changeId: c?.id ?? null,
      status: c?.status ?? null,
    };
  });
}

export function totalIncome(series: readonly SalaryPoint[]): number {
  return series.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Daftar perubahan yang masih berlaku (bukan superseded), berurutan effectiveMonth.
 * Dipakai untuk tampilan riwayat.
 */
export function activeChanges(changes: readonly SalaryChange[]): SalaryChange[] {
  return [...changes]
    .filter((c) => c.status !== "superseded")
    .sort((a, b) => (a.effectiveMonth < b.effectiveMonth ? -1 : a.effectiveMonth > b.effectiveMonth ? 1 : a.createdAt < b.createdAt ? -1 : 1));
}

/**
 * Simulasi penambahan perubahan gaji baru TANPA mengubah daftar lama.
 * Mengembalikan daftar perubahan baru (immutable) dengan perubahan `planned` lama
 * pada bulan efektif yang sama ditandai superseded.
 */
export function withProposedChange(
  changes: readonly SalaryChange[],
  proposal: { amount: number; effectiveMonth: MonthKey; note?: string | null },
  tempId = -1,
): SalaryChange[] {
  const now = new Date().toISOString();
  const next: SalaryChange[] = changes.map((c) =>
    c.status === "planned" && c.effectiveMonth === proposal.effectiveMonth
      ? { ...c, status: "superseded" as SalaryStatus }
      : { ...c },
  );
  next.push({
    id: tempId,
    amount: proposal.amount,
    effectiveMonth: proposal.effectiveMonth,
    status: "planned",
    note: proposal.note ?? null,
    createdAt: now,
  });
  return next;
}

export interface SalaryImpactRow {
  month: MonthKey;
  before: number;
  after: number;
  delta: number;
}

/** Preview dampak: per bulan sebelum vs sesudah. Bulan dengan delta 0 tetap disertakan. */
export function salaryImpact(
  months: readonly MonthKey[],
  before: readonly SalaryChange[],
  after: readonly SalaryChange[],
): { rows: SalaryImpactRow[]; totalBefore: number; totalAfter: number; totalDelta: number; firstChangedMonth: MonthKey | null } {
  const b = salarySeries(months, before);
  const a = salarySeries(months, after);
  const rows = months.map((month, i) => ({
    month,
    before: b[i].amount,
    after: a[i].amount,
    delta: a[i].amount - b[i].amount,
  }));
  const totalBefore = totalIncome(b);
  const totalAfter = totalIncome(a);
  const firstChangedMonth = rows.find((r) => r.delta !== 0)?.month ?? null;
  return { rows, totalBefore, totalAfter, totalDelta: totalAfter - totalBefore, firstChangedMonth };
}
