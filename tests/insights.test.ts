import { describe, expect, it } from "vitest";
import { computeAllocation } from "@/lib/allocation";
import { generateInsights } from "@/lib/insights";
import { planMonths } from "@/lib/months";
import { netWorth, summarizeAccount, type AssetAccount } from "@/lib/portfolio";
import { DEFAULT_SCENARIOS, runProjection, splitAllocation, type MonthInput } from "@/lib/projection";
import { salarySeries, type SalaryChange } from "@/lib/salary";
import { balancedRules, initialRules } from "./allocation.test";

const changes: SalaryChange[] = [
  { id: 1, amount: 7_500_000, effectiveMonth: "2026-10", status: "actual", createdAt: "a" },
  { id: 2, amount: 10_000_000, effectiveMonth: "2027-10", status: "planned", createdAt: "b" },
];

function build(rules = initialRules) {
  const months = planMonths();
  const salary = salarySeries(months, changes);
  const inputs: MonthInput[] = salary.map((p) => {
    const { contributions, expenses } = splitAllocation(computeAllocation(p.amount, rules));
    return { month: p.month, salary: p.amount, expenses, contributions };
  });
  const results = DEFAULT_SCENARIOS.map((s) => runProjection({ months: inputs, scenario: s }));
  const emergency: AssetAccount = { id: 1, kind: "emergency", name: "DD", openingBalance: 0, targetAmount: 24_000_000, targetMonthsOfExpenses: 6, lossLimitBp: null };
  const summaries = [summarizeAccount(emergency, [{ id: 1, accountId: 1, type: "deposit", tradeDate: "2026-10-25", month: "2026-10", symbol: null, quantityE6: null, pricePerUnit: null, fee: 0, amount: 1_000_000 }], [])];
  return generateInsights({
    periodStart: "2026-10",
    periodEnd: "2031-09",
    currentMonth: "2026-10",
    salary,
    currentAllocation: computeAllocation(7_500_000, rules),
    results,
    summaries,
    netWorth: netWorth(summaries),
    planVsActual: [],
    emergencyTarget: 24_000_000,
    monthlyMandatoryExpenses: 4_000_000,
  });
}

describe("insights", () => {
  it("setiap insight menyebut angka, periode, asumsi, keterbatasan, dan saran", () => {
    const list = build();
    expect(list.length).toBeGreaterThan(5);
    for (const i of list) {
      expect(i.detail.length).toBeGreaterThan(20);
      expect(i.period.length).toBeGreaterThan(0);
      expect(i.assumptions.length).toBeGreaterThan(0);
      expect(i.limitations.length).toBeGreaterThan(0);
      expect(i.actions.length).toBeGreaterThan(0);
      if (i.kind !== "insufficient" && !i.title.includes("terkendali")) expect(i.detail).toMatch(/Rp\d/);
    }
  });

  it("tanpa realisasi → ada insight 'belum memadai'; kenaikan planned ditandai belum terkonfirmasi", () => {
    const list = build();
    expect(list.some((i) => i.kind === "insufficient" && i.title.includes("Belum ada realisasi"))).toBe(true);
    const income = list.find((i) => i.title.includes("Pendapatan meningkat"))!;
    expect(income.detail).toContain("PLANNED");
    expect(income.detail).toContain("Rp10.000.000");
    expect(income.detail).toContain("Oktober 2027");
  });

  it("sisa alokasi Rp300.000 menghasilkan rekomendasi; set seimbang tidak", () => {
    expect(build(initialRules).some((i) => i.kind === "recommendation" && i.detail.includes("Rp300.000"))).toBe(true);
    expect(build(balancedRules).some((i) => i.title.includes("belum dialokasikan"))).toBe(false);
  });

  it("analisis negatif skenario konservatif menyebut nilai di bawah modal dan asumsi return", () => {
    const list = build();
    const neg = list.find((i) => i.title.includes("Penurunan pasar"))!;
    expect(neg.kind).toBe("negative");
    expect(neg.assumptions).toContain("bukan data pasar");
    expect(neg.detail).toContain("rugi");
    const inflation = list.find((i) => i.title.includes("Inflasi"))!;
    expect(inflation.detail).toMatch(/turun Rp/);
  });
});
