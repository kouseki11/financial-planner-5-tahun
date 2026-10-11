import type { Db } from "@/db/client";
import { computeAllocation, type AssetKind } from "@/lib/allocation";
import { addMonths, monthRange, type MonthKey } from "@/lib/months";
import { CASH_LIKE_KINDS } from "@/lib/portfolio";
import {
  ASSET_KINDS,
  emptyAssetState,
  runProjection,
  splitAllocation,
  type AssetState,
  type MonthInput,
  type ProjectionResult,
  type ScenarioAssumptions,
} from "@/lib/projection";
import { salarySeries, type SalaryChange } from "@/lib/salary";
import { planVsActual } from "./actuals-service";
import { getPortfolioSnapshot } from "./asset-service";
import type { DbOrTx } from "./audit";
import { getCategoryRules, getSalaryChangesRaw } from "./budget-service";
import { listScenarios } from "./scenario-service";
import { getCurrentPlanMonth, getPlanPeriod } from "./settings";

function lastDayOfMonth(month: MonthKey): string {
  const next = addMonths(month, 1);
  const d = new Date(`${next}-01T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface ProjectionInputsBundle {
  inputs: MonthInput[];
  opening: Partial<Record<AssetKind, AssetState>>;
  lastActualMonth: MonthKey | null;
  currentMonth: MonthKey;
  months: MonthKey[];
}

/**
 * Rakit input 60 bulan:
 * - Bulan `locked` → isActual: gaji snapshot, pengeluaran realisasi (bila ada), arus kas aset dari transaksi.
 *   Pada bulan aktual terakhir, selisih nilai pasar aktual vs nilai arus kas dimasukkan sebagai marketAdjustment.
 * - Bulan lain → dari snapshot anggaran (projected/planned).
 * Saldo awal akun menjadi opening state (bukan setoran).
 */
export async function buildProjectionInputs(db: DbOrTx): Promise<ProjectionInputsBundle> {
  const { start, end } = await getPlanPeriod(db);
  const months = monthRange(start, end);
  const currentMonth = await getCurrentPlanMonth(db);
  const pva = await planVsActual(db);
  const byMonth = new Map(pva.map((p) => [p.month, p]));
  const portfolio = await getPortfolioSnapshot(db);
  const kindByAccount = new Map(portfolio.accounts.map((a) => [a.id, a.kind]));

  const opening: Partial<Record<AssetKind, AssetState>> = {};
  for (const a of portfolio.accounts) {
    opening[a.kind] = { ...emptyAssetState(), value: a.openingBalance };
  }

  let lastActualMonth: MonthKey | null = null;
  const inputs: MonthInput[] = months.map((month) => {
    const p = byMonth.get(month);
    const isActual = p?.status === "locked";
    if (isActual) lastActualMonth = month;
    const contributions: Partial<Record<AssetKind, number>> = {};
    const withdrawals: Partial<Record<AssetKind, number>> = {};
    const income: Partial<Record<AssetKind, number>> = {};
    const fees: Partial<Record<AssetKind, number>> = {};

    if (isActual) {
      for (const t of portfolio.transactions) {
        if (t.month !== month) continue;
        const kind = kindByAccount.get(t.accountId);
        if (!kind) continue;
        switch (t.type) {
          case "deposit":
            contributions[kind] = (contributions[kind] ?? 0) + Math.abs(t.amount);
            break;
          case "withdraw":
            withdrawals[kind] = (withdrawals[kind] ?? 0) + Math.abs(t.amount);
            break;
          case "dividend":
            income[kind] = (income[kind] ?? 0) + Math.abs(t.amount);
            break;
          case "realized_pnl":
            income[kind] = (income[kind] ?? 0) + t.amount;
            break;
          case "fee":
            fees[kind] = (fees[kind] ?? 0) + Math.abs(t.amount);
            break;
          case "buy":
          case "sell":
            fees[kind] = (fees[kind] ?? 0) + t.fee;
            break;
        }
      }
      return {
        month,
        salary: p?.salary ?? 0,
        expenses: p?.hasActuals ? p.actualExpenses : (p?.plannedExpenses ?? 0),
        contributions,
        withdrawals,
        income,
        fees,
        isActual: true,
      };
    }

    for (const l of p?.lines ?? []) {
      if (l.assetKind) contributions[l.assetKind as AssetKind] = (contributions[l.assetKind as AssetKind] ?? 0) + l.planned;
    }
    return { month, salary: p?.salary ?? 0, expenses: p?.plannedExpenses ?? 0, contributions };
  });

  // Penyesuaian nilai pasar pada bulan aktual terakhir agar nilai = nilai pasar aktual.
  if (lastActualMonth) {
    const idx = months.indexOf(lastActualMonth);
    const zeroScenario: ScenarioAssumptions = {
      key: "moderate",
      name: "flows",
      stockAnnualBp: 0,
      cryptoAnnualBp: 0,
      tradingAnnualBp: 0,
      cashAnnualBp: 0,
      inflationAnnualBp: 0,
      tradingProjectionEnabled: false,
      tradingMaxLossBp: null,
      description: "",
    };
    const flowsOnly = runProjection({ months: inputs.slice(0, idx + 1), scenario: zeroScenario, opening });
    const actualSnapshot = await getPortfolioSnapshot(db, lastDayOfMonth(lastActualMonth));
    const adj: Partial<Record<AssetKind, number>> = {};
    for (const kind of ASSET_KINDS) {
      const flowsValue = flowsOnly.final?.assets[kind].closing ?? 0;
      const actualValue = actualSnapshot.byKind[kind]?.totalValue ?? flowsValue;
      // Kas/tabungan tidak memiliki nilai pasar; selisih hanya mungkin dari saldo awal, abaikan.
      if (CASH_LIKE_KINDS.includes(kind)) continue;
      if (actualValue !== flowsValue) adj[kind] = actualValue - flowsValue;
    }
    if (Object.keys(adj).length) inputs[idx] = { ...inputs[idx], marketAdjustment: adj };
  }

  return { inputs, opening, lastActualMonth, currentMonth, months };
}

export interface ProjectionBundle extends ProjectionInputsBundle {
  scenarios: ScenarioAssumptions[];
  results: ProjectionResult[];
}

export async function getProjectionBundle(db: Db): Promise<ProjectionBundle> {
  const base = await buildProjectionInputs(db);
  const scenarios = await listScenarios(db);
  const results = scenarios.map((s) => runProjection({ months: base.inputs, scenario: s, opening: base.opening }));
  return { ...base, scenarios, results };
}

export interface SalarySimulationSpec {
  label: string;
  changes: SalaryChange[];
}

export interface SalarySimulationRow {
  label: string;
  totalIncome: number;
  totalExpenses: number;
  totalDeposits: number;
  finalEmergency: number;
  finalNetWorth: number;
  finalInvested: number;
  unallocated: number;
  deltaNetWorthVsFirst: number;
  deltaIncomeVsFirst: number;
}

/**
 * Simulasi §11: proyeksi murni dari aturan kategori SAAT INI dengan daftar perubahan gaji alternatif.
 * Tidak membaca/menulis realisasi; hanya alat perbandingan.
 */
export async function simulateSalaryScenarios(db: DbOrTx, specs: SalarySimulationSpec[], scenario: ScenarioAssumptions): Promise<SalarySimulationRow[]> {
  const { start, end } = await getPlanPeriod(db);
  const months = monthRange(start, end);
  const rules = await getCategoryRules(db);
  const rows = specs.map((spec) => {
    const inputs: MonthInput[] = salarySeries(months, spec.changes).map((p) => {
      const alloc = computeAllocation(p.amount, rules);
      const { contributions, expenses } = splitAllocation(alloc);
      return { month: p.month, salary: p.amount, expenses, contributions };
    });
    const r = runProjection({ months: inputs, scenario });
    return {
      label: spec.label,
      totalIncome: r.totals.income,
      totalExpenses: r.totals.expenses,
      totalDeposits: r.totals.deposits,
      finalEmergency: r.final?.assets.emergency.closing ?? 0,
      finalNetWorth: r.totals.finalNetWorth,
      finalInvested: r.totals.finalInvested,
      unallocated: r.totals.unallocated,
      deltaNetWorthVsFirst: 0,
      deltaIncomeVsFirst: 0,
    };
  });
  return rows.map((r) => ({ ...r, deltaNetWorthVsFirst: r.finalNetWorth - rows[0].finalNetWorth, deltaIncomeVsFirst: r.totalIncome - rows[0].totalIncome }));
}

/** Preset simulasi §11 berdasarkan riwayat gaji saat ini. */
export async function defaultSalarySimulations(db: DbOrTx): Promise<SalarySimulationSpec[]> {
  const current = await getSalaryChangesRaw(db);
  const { start } = await getPlanPeriod(db);
  const flat: SalaryChange[] = [{ id: -1, amount: 7_500_000, effectiveMonth: start, status: "actual", createdAt: "" }];
  const raise: SalaryChange[] = [...flat, { id: -2, amount: 10_000_000, effectiveMonth: addMonths(start, 12), status: "planned", createdAt: "" }];
  const multi: SalaryChange[] = [...raise, { id: -3, amount: 12_000_000, effectiveMonth: addMonths(start, 27), status: "planned", createdAt: "" }];
  return [
    { label: "Gaji tetap Rp7.500.000", changes: flat },
    { label: "Naik ke Rp10.000.000 mulai tahun ke-2", changes: raise },
    { label: "Dua kenaikan (10 jt tahun ke-2, 12 jt Jan tahun ke-3)", changes: multi },
    { label: "Riwayat gaji saat ini", changes: current },
  ];
}
