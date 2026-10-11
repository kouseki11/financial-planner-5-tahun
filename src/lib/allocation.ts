import { applyBp, assertRupiah, roundHalfUp } from "./money";

export type AllocationMethod = "fixed" | "percent" | "min_plus_percent";
export type GroupKey = "wajib" | "dana_darurat" | "tabungan" | "investasi" | "fleksibel";
export type AssetKind = "emergency" | "savings_personal" | "savings_wedding" | "stock" | "crypto" | "trading";
export type RaisePolicy = "manual" | "proportional" | "emergency_first";

export const GROUP_LABELS: Record<GroupKey, string> = {
  wajib: "Pengeluaran wajib",
  dana_darurat: "Dana darurat",
  tabungan: "Target tabungan penting",
  investasi: "Investasi",
  fleksibel: "Pengeluaran fleksibel",
};

export const METHOD_LABELS: Record<AllocationMethod, string> = {
  fixed: "Nominal tetap",
  percent: "Persentase dari gaji",
  min_plus_percent: "Minimum + persentase dari sisa",
};

export const RAISE_POLICY_LABELS: Record<RaisePolicy, string> = {
  manual: "Manual (sisa kenaikan dibiarkan belum dialokasikan)",
  proportional: "Proporsional (semua kategori nominal tetap dinaikkan sebanding)",
  emergency_first: "Diarahkan ke dana darurat",
};

export interface CategoryRule {
  id: number;
  name: string;
  slug: string;
  groupKey: GroupKey;
  assetKind: AssetKind | null;
  method: AllocationMethod;
  /** fixed: nominal; min_plus_percent: minimum. */
  fixedAmount: number;
  /** percent: dari gaji; min_plus_percent: dari sisa. */
  percentBp: number;
  priority: number;
  isActive: boolean;
}

export interface AllocationLine {
  categoryId: number;
  name: string;
  slug: string;
  groupKey: GroupKey;
  assetKind: AssetKind | null;
  method: AllocationMethod;
  priority: number;
  amount: number;
}

export type AllocationStatus = "balanced" | "surplus" | "deficit";

export interface AllocationResult {
  salary: number;
  lines: AllocationLine[];
  total: number;
  /** gaji − total (≥ 0). */
  remaining: number;
  /** total − gaji (≥ 0). */
  deficit: number;
  status: AllocationStatus;
  /** Kategori yang bila dikurangi (dari prioritas terendah) menutup defisit. */
  deficitCauses: AllocationLine[];
  byGroup: Record<GroupKey, number>;
}

function sortByPriority<T extends { priority: number; id?: number; categoryId?: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.priority - b.priority || (a.id ?? a.categoryId ?? 0) - (b.id ?? b.categoryId ?? 0));
}

/**
 * Hitung alokasi untuk satu gaji.
 * Urutan: (1) fixed, (2) percent dari gaji, (3) sisa = gaji − (1) − (2) − Σ minimum,
 * (4) min_plus_percent = minimum + bp × max(sisa, 0).
 * Semua pembulatan ke rupiah di tiap kategori; selisih tampil sebagai sisa/defisit, tidak disembunyikan.
 */
export function computeAllocation(salary: number, rules: readonly CategoryRule[]): AllocationResult {
  assertRupiah(salary, "gaji");
  const active = sortByPriority(rules.filter((r) => r.isActive));

  const amounts = new Map<number, number>();
  let fixedAndPercent = 0;
  let minimums = 0;

  for (const r of active) {
    if (r.method === "fixed") {
      amounts.set(r.id, r.fixedAmount);
      fixedAndPercent += r.fixedAmount;
    } else if (r.method === "percent") {
      const v = applyBp(salary, r.percentBp);
      amounts.set(r.id, v);
      fixedAndPercent += v;
    } else {
      minimums += r.fixedAmount;
    }
  }

  const distributable = Math.max(salary - fixedAndPercent - minimums, 0);
  for (const r of active) {
    if (r.method === "min_plus_percent") {
      amounts.set(r.id, r.fixedAmount + applyBp(distributable, r.percentBp));
    }
  }

  const lines: AllocationLine[] = active.map((r) => ({
    categoryId: r.id,
    name: r.name,
    slug: r.slug,
    groupKey: r.groupKey,
    assetKind: r.assetKind,
    method: r.method,
    priority: r.priority,
    amount: amounts.get(r.id) ?? 0,
  }));

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const remaining = Math.max(salary - total, 0);
  const deficit = Math.max(total - salary, 0);
  const status: AllocationStatus = deficit > 0 ? "deficit" : remaining > 0 ? "surplus" : "balanced";

  const deficitCauses: AllocationLine[] = [];
  if (deficit > 0) {
    let covered = 0;
    for (const l of [...lines].reverse()) {
      if (covered >= deficit) break;
      if (l.amount <= 0) continue;
      deficitCauses.push(l);
      covered += l.amount;
    }
  }

  const byGroup: Record<GroupKey, number> = {
    wajib: 0,
    dana_darurat: 0,
    tabungan: 0,
    investasi: 0,
    fleksibel: 0,
  };
  for (const l of lines) byGroup[l.groupKey] += l.amount;

  return { salary, lines, total, remaining, deficit, status, deficitCauses, byGroup };
}

/**
 * Terapkan kebijakan kenaikan gaji ke aturan kategori. Mengembalikan aturan BARU (tidak memutasi input).
 * Hanya kategori `fixed` yang berubah; `percent` otomatis mengikuti gaji; `min_plus_percent` mengikuti sisa.
 * - manual: tidak ada perubahan.
 * - proportional: fixedAmount × newSalary / oldSalary, dibulatkan per kategori.
 * - emergency_first: seluruh kenaikan (newSalary − oldSalary) ditambahkan ke kategori assetKind = emergency
 *   (prioritas terkecil bila lebih dari satu). Bila tidak ada kategori dana darurat, tidak ada perubahan.
 */
export function applyRaisePolicy(
  rules: readonly CategoryRule[],
  oldSalary: number,
  newSalary: number,
  policy: RaisePolicy,
): CategoryRule[] {
  assertRupiah(oldSalary, "gaji lama");
  assertRupiah(newSalary, "gaji baru");
  const cloned = rules.map((r) => ({ ...r }));
  if (policy === "manual" || newSalary === oldSalary) return cloned;

  if (policy === "proportional") {
    if (oldSalary <= 0) return cloned;
    return cloned.map((r) =>
      r.method === "fixed" && r.isActive ? { ...r, fixedAmount: roundHalfUp((r.fixedAmount * newSalary) / oldSalary) } : r,
    );
  }

  // emergency_first
  const target = sortByPriority(cloned.filter((r) => r.isActive && r.assetKind === "emergency" && r.method === "fixed"))[0];
  if (!target) return cloned;
  const delta = newSalary - oldSalary;
  return cloned.map((r) => (r.id === target.id ? { ...r, fixedAmount: Math.max(r.fixedAmount + delta, 0) } : r));
}

/** Snapshot aturan untuk disimpan bersama item anggaran (tidak bergantung aturan terbaru). */
export interface RuleSnapshot {
  method: AllocationMethod;
  fixedAmount: number;
  percentBp: number;
  priority: number;
}

export function snapshotRule(r: CategoryRule): RuleSnapshot {
  return { method: r.method, fixedAmount: r.fixedAmount, percentBp: r.percentBp, priority: r.priority };
}
