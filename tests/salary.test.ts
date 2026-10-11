import { describe, expect, it } from "vitest";
import { monthRange, planMonths } from "@/lib/months";
import {
  activeChanges,
  resolveSalary,
  salaryImpact,
  salarySeries,
  totalIncome,
  withProposedChange,
  type SalaryChange,
} from "@/lib/salary";

const base: SalaryChange[] = [
  { id: 1, amount: 7_500_000, effectiveMonth: "2026-10", status: "actual", note: "Gaji awal", createdAt: "2026-10-01T00:00:00Z" },
];

const withRaise: SalaryChange[] = [
  ...base,
  { id: 2, amount: 10_000_000, effectiveMonth: "2027-10", status: "planned", note: "Kenaikan", createdAt: "2026-11-01T00:00:00Z" },
];

describe("salary", () => {
  it("T1: gaji Oktober 2026 – September 2027 tetap Rp7.500.000 setelah kenaikan Oktober 2027 ditambahkan", () => {
    const beforeSeries = salarySeries(monthRange("2026-10", "2027-09"), base);
    const afterSeries = salarySeries(monthRange("2026-10", "2027-09"), withRaise);
    expect(afterSeries).toEqual(beforeSeries);
    for (const p of afterSeries) {
      expect(p.amount).toBe(7_500_000);
      expect(p.changeId).toBe(1);
    }
    // baris lama tidak dimutasi
    expect(withRaise[0]).toEqual(base[0]);
  });

  it("T2: Oktober 2027 dan sesudahnya memakai gaji baru", () => {
    expect(resolveSalary("2027-10", withRaise)?.amount).toBe(10_000_000);
    expect(resolveSalary("2029-05", withRaise)?.amount).toBe(10_000_000);
    expect(resolveSalary("2031-09", withRaise)?.amount).toBe(10_000_000);
    expect(resolveSalary("2027-09", withRaise)?.amount).toBe(7_500_000);
  });

  it("total pendapatan 5 tahun: 12 × 7,5 jt + 48 × 10 jt = Rp570.000.000", () => {
    const series = salarySeries(planMonths(), withRaise);
    expect(totalIncome(series)).toBe(570_000_000);
    expect(totalIncome(salarySeries(planMonths(), base))).toBe(450_000_000);
  });

  it("T6: perubahan planned tidak dihitung sebagai kenaikan aktual", () => {
    expect(resolveSalary("2027-10", withRaise, { includePlanned: false })?.amount).toBe(7_500_000);
    expect(resolveSalary("2027-10", withRaise, { includePlanned: true })?.amount).toBe(10_000_000);
    const confirmed = withRaise.map((c) => (c.id === 2 ? { ...c, status: "actual" as const } : c));
    expect(resolveSalary("2027-10", confirmed, { includePlanned: false })?.amount).toBe(10_000_000);
  });

  it("superseded diabaikan; bulan sebelum perubahan pertama = null", () => {
    const changes: SalaryChange[] = [
      ...withRaise,
      { id: 3, amount: 9_000_000, effectiveMonth: "2027-10", status: "superseded", createdAt: "2026-10-15T00:00:00Z" },
    ];
    expect(resolveSalary("2027-10", changes)?.id).toBe(2);
    expect(resolveSalary("2026-09", changes)).toBeNull();
    expect(activeChanges(changes).map((c) => c.id)).toEqual([1, 2]);
  });

  it("dua perubahan di bulan efektif sama: yang terakhir dibuat menang", () => {
    const changes: SalaryChange[] = [
      ...base,
      { id: 5, amount: 9_000_000, effectiveMonth: "2027-10", status: "planned", createdAt: "2026-11-01T00:00:00Z" },
      { id: 6, amount: 9_500_000, effectiveMonth: "2027-10", status: "planned", createdAt: "2026-12-01T00:00:00Z" },
    ];
    expect(resolveSalary("2027-10", changes)?.id).toBe(6);
  });

  it("withProposedChange tidak memutasi input dan men-supersede planned di bulan yang sama", () => {
    const proposed = withProposedChange(withRaise, { amount: 11_000_000, effectiveMonth: "2027-10" });
    expect(withRaise.find((c) => c.id === 2)?.status).toBe("planned");
    expect(proposed.find((c) => c.id === 2)?.status).toBe("superseded");
    expect(proposed.find((c) => c.id === 1)?.status).toBe("actual");
    expect(resolveSalary("2027-10", proposed)?.amount).toBe(11_000_000);
  });

  it("preview dampak: hanya bulan efektif ke depan yang berubah", () => {
    const impact = salaryImpact(planMonths(), base, withRaise);
    expect(impact.firstChangedMonth).toBe("2027-10");
    expect(impact.rows.filter((r) => r.delta !== 0)).toHaveLength(48);
    expect(impact.rows.slice(0, 12).every((r) => r.delta === 0)).toBe(true);
    expect(impact.totalDelta).toBe(120_000_000);
  });
});
