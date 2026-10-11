import { describe, expect, it } from "vitest";
import { computeAllocation } from "@/lib/allocation";
import { monthlyRateFromAnnualBp } from "@/lib/money";
import { planMonths } from "@/lib/months";
import {
  DEFAULT_SCENARIOS,
  assetIdentityHolds,
  compareScenarios,
  emptyAssetState,
  projectAssetMonth,
  runProjection,
  splitAllocation,
  yearEndPoints,
  type MonthInput,
  type ScenarioAssumptions,
} from "@/lib/projection";
import { salarySeries, type SalaryChange } from "@/lib/salary";
import { balancedRules } from "./allocation.test";

const moderate = DEFAULT_SCENARIOS.find((s) => s.key === "moderate")!;

function scenario(over: Partial<ScenarioAssumptions>): ScenarioAssumptions {
  return { ...moderate, ...over };
}

function monthsFor(salaryChanges: SalaryChange[], count = 60): MonthInput[] {
  return salarySeries(planMonths().slice(0, count), salaryChanges).map((p) => {
    const alloc = computeAllocation(p.amount, balancedRules);
    const { contributions, expenses } = splitAllocation(alloc);
    return { month: p.month, salary: p.amount, expenses, contributions };
  });
}

const flat: SalaryChange[] = [{ id: 1, amount: 7_500_000, effectiveMonth: "2026-10", status: "actual", createdAt: "2026-10-01" }];
const raise: SalaryChange[] = [...flat, { id: 2, amount: 10_000_000, effectiveMonth: "2027-10", status: "planned", createdAt: "2026-11-01" }];

describe("projection", () => {
  it("contoh §4.5: setoran 500.000/bulan, 6 %/tahun → bulan 1-3 sesuai tabel", () => {
    const r = monthlyRateFromAnnualBp(600);
    const m1 = projectAssetMonth(emptyAssetState(), { deposit: 500_000 }, r);
    expect(m1.gain).toBe(0);
    expect(m1.closing).toBe(500_000);
    const m2 = projectAssetMonth(m1, { deposit: 500_000 }, r);
    expect(m2.gain).toBe(2_434);
    expect(m2.closing).toBe(1_002_434);
    const m3 = projectAssetMonth(m2, { deposit: 500_000 }, r);
    expect(m3.gain).toBe(4_879);
    expect(m3.closing).toBe(1_507_313);
    expect(m3.cumDeposits).toBe(1_500_000);
    expect(m3.cumGains).toBe(7_313);
    expect(m3.cumDeposits + m3.cumGains).toBe(m3.closing);
  });

  it("setoran bulan ini TIDAK mendapat return bulan ini", () => {
    const r = monthlyRateFromAnnualBp(1200);
    const m = projectAssetMonth(emptyAssetState(), { deposit: 10_000_000 }, r);
    expect(m.gain).toBe(0);
  });

  it("T9: return negatif (SOL −30 %/tahun) → nilai akhir < Σ setoran, identitas berlaku tiap bulan", () => {
    const s = scenario({ cryptoAnnualBp: -3000 });
    const months: MonthInput[] = planMonths()
      .slice(0, 12)
      .map((month) => ({ month, salary: 7_500_000, expenses: 7_000_000, contributions: { crypto: 500_000 } }));
    const res = runProjection({ months, scenario: s });
    const final = res.months[11].assets.crypto;
    expect(final.cumDeposits).toBe(6_000_000);
    expect(final.closing).toBeLessThan(6_000_000);
    expect(final.cumGains).toBeLessThan(0);
    let prev = emptyAssetState();
    for (const m of res.months) {
      const a = m.assets.crypto;
      expect(assetIdentityHolds(prev, a)).toBe(true);
      expect(a.gain).toBeLessThanOrEqual(0);
      prev = a;
    }
    // Rumus eksplisit bulan ke-2: gain = round(500.000 × r), r = 0,7^(1/12) − 1 ≈ −0,02928
    const r = monthlyRateFromAnnualBp(-3000);
    expect(res.months[1].assets.crypto.gain).toBe(Math.round(500_000 * r));
  });

  it("identitas akumulator berlaku untuk seluruh 60 bulan dan semua aset (skenario moderat)", () => {
    const res = runProjection({ months: monthsFor(raise), scenario: moderate });
    expect(res.months).toHaveLength(60);
    for (const kind of ["emergency", "savings_personal", "savings_wedding", "stock", "crypto", "trading"] as const) {
      let prev = emptyAssetState();
      for (const m of res.months) {
        expect(assetIdentityHolds(prev, m.assets[kind])).toBe(true);
        prev = m.assets[kind];
      }
    }
    const f = res.final!;
    expect(f.netWorth).toBe(f.cashLike + f.invested);
    expect(f.netWorth).toBe(f.cumDeposits + f.cumGains + f.cumIncome - f.cumFees);
  });

  it("kas/tabungan return 0: dana darurat 60 × 1 jt = 60 jt tepat", () => {
    const res = runProjection({ months: monthsFor(flat), scenario: moderate });
    expect(res.final!.assets.emergency.closing).toBe(60_000_000);
    expect(res.final!.assets.emergency.cumGains).toBe(0);
    expect(res.totals.income).toBe(450_000_000);
  });

  it("§11: kenaikan gaji Okt 2027 hanya mengubah bulan efektif ke depan (kebijakan manual → sisa)", () => {
    const base = runProjection({ months: monthsFor(flat), scenario: moderate });
    const withRaise = runProjection({ months: monthsFor(raise), scenario: moderate });
    for (let i = 0; i < 12; i++) {
      expect(withRaise.months[i]).toEqual(base.months[i]);
    }
    expect(withRaise.months[12].salary).toBe(10_000_000);
    expect(withRaise.months[12].unallocated).toBe(2_500_000);
    expect(withRaise.totals.income - base.totals.income).toBe(120_000_000);
    expect(withRaise.totals.unallocated).toBe(48 * 2_500_000);
    // aset identik karena aturan nominal tetap tidak berubah tanpa kebijakan
    expect(withRaise.totals.finalNetWorth).toBe(base.totals.finalNetWorth);
  });

  it("trading: proyeksi profit dimatikan → return 0; batas rugi menahan nilai di floor", () => {
    const off = scenario({ tradingAnnualBp: 1000, tradingProjectionEnabled: false });
    const res = runProjection({ months: monthsFor(flat, 24), scenario: off });
    expect(res.final!.assets.trading.cumGains).toBe(0);
    expect(res.final!.assets.trading.closing).toBe(24 * 200_000);

    const crash = scenario({ tradingAnnualBp: -9000, tradingMaxLossBp: 5000 });
    const res2 = runProjection({ months: monthsFor(flat, 24), scenario: crash });
    const t = res2.final!.assets.trading;
    expect(t.closing).toBeGreaterThanOrEqual(Math.round(t.cumDeposits * 0.5));
    let prev = emptyAssetState();
    for (const m of res2.months) {
      expect(assetIdentityHolds(prev, m.assets.trading)).toBe(true);
      prev = m.assets.trading;
    }
  });

  it("bulan aktual (isActual) tidak disimulasikan return; nilai mengikuti arus kas", () => {
    const months: MonthInput[] = [
      { month: "2026-10", salary: 7_500_000, expenses: 7_000_000, contributions: { stock: 500_000 }, isActual: true },
      { month: "2026-11", salary: 7_500_000, expenses: 7_000_000, contributions: { stock: 500_000 }, isActual: true },
      { month: "2026-12", salary: 7_500_000, expenses: 7_000_000, contributions: { stock: 500_000 } },
    ];
    const res = runProjection({ months, scenario: scenario({ stockAnnualBp: 1200 }) });
    expect(res.months[1].assets.stock.gain).toBe(0);
    expect(res.months[2].assets.stock.gain).toBeGreaterThan(0);
  });

  it("opening state dari realisasi dipakai sebagai titik awal; totals hanya menghitung periode proyeksi", () => {
    const months: MonthInput[] = [{ month: "2027-01", salary: 7_500_000, expenses: 7_000_000, contributions: { stock: 500_000 } }];
    const res = runProjection({
      months,
      scenario: scenario({ stockAnnualBp: 600 }),
      opening: { stock: { value: 1_000_000, cumDeposits: 1_000_000, cumWithdrawals: 0, cumGains: 0, cumIncome: 0, cumFees: 0 } },
    });
    expect(res.months[0].assets.stock.opening).toBe(1_000_000);
    expect(res.months[0].assets.stock.gain).toBe(4_868);
    expect(res.totals.deposits).toBe(500_000);
    expect(res.months[0].assets.stock.cumDeposits).toBe(1_500_000);
  });

  it("perbandingan tiga skenario: konservatif ≤ moderat ≤ optimistis pada aset akhir", () => {
    const results = DEFAULT_SCENARIOS.map((s) => runProjection({ months: monthsFor(raise), scenario: s }));
    const rows = compareScenarios(results);
    expect(rows.map((r) => r.key)).toEqual(["conservative", "moderate", "optimistic"]);
    expect(rows[0].finalNetWorth).toBeLessThanOrEqual(rows[1].finalNetWorth);
    expect(rows[1].finalNetWorth).toBeLessThanOrEqual(rows[2].finalNetWorth);
    // setoran identik di semua skenario — hanya asumsi return yang berbeda
    expect(new Set(rows.map((r) => r.deposits)).size).toBe(1);
    expect(yearEndPoints(results[1]).map((p) => p.month)).toEqual(["2027-09", "2028-09", "2029-09", "2030-09", "2031-09"]);
  });

  it("nilai riil ≤ nominal bila inflasi positif", () => {
    const res = runProjection({ months: monthsFor(flat), scenario: scenario({ inflationAnnualBp: 300 }) });
    expect(res.totals.finalNetWorthReal).toBeLessThan(res.totals.finalNetWorth);
    const zero = runProjection({ months: monthsFor(flat), scenario: scenario({ inflationAnnualBp: 0 }) });
    expect(zero.totals.finalNetWorthReal).toBe(zero.totals.finalNetWorth);
  });
});
