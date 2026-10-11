import { describe, expect, it } from "vitest";
import {
  applyBp,
  applyMonthlyRate,
  formatRupiah,
  formatRupiahShort,
  monthlyRateFromAnnualBp,
  parseRupiahInput,
  percentToBp,
  roundHalfUp,
  achievementBp,
} from "@/lib/money";

describe("money", () => {
  it("T12: format rupiah sesuai spec 'Rp7.500.000'", () => {
    expect(formatRupiah(7_500_000)).toBe("Rp7.500.000");
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(-500_000)).toBe("-Rp500.000");
    expect(formatRupiah(1_234_567_890)).toBe("Rp1.234.567.890");
  });

  it("T12: persentase dalam bp dibulatkan konsisten tanpa error float", () => {
    expect(applyBp(7_500_000, 3_333)).toBe(2_499_750);
    expect(applyBp(10_000_000, 1_000)).toBe(1_000_000);
    expect(applyBp(7_500_000, 1_000)).toBe(750_000);
    // 7.500.000 × 0,01 % = 750 tepat; 7.500.001 × 0,01 % = 750,0001 → 750
    expect(applyBp(7_500_001, 1)).toBe(750);
  });

  it("menolak nominal non-integer", () => {
    expect(() => applyBp(1.5, 100)).toThrow();
    expect(() => applyBp(100, 1.5)).toThrow();
  });

  it("pembulatan simetris (half away from zero)", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4)).toBe(2);
  });

  it("tingkat bulanan dari tahunan secara geometrik (6 % → ≈0,48676 %)", () => {
    const r = monthlyRateFromAnnualBp(600);
    expect(r).toBeCloseTo(0.0048675505, 9);
    expect(Math.pow(1 + r, 12)).toBeCloseTo(1.06, 9);
    expect(monthlyRateFromAnnualBp(0)).toBe(0);
    expect(monthlyRateFromAnnualBp(-3000)).toBeLessThan(0);
    expect(monthlyRateFromAnnualBp(-10_000)).toBe(-1);
  });

  it("gain bulanan dibulatkan ke rupiah", () => {
    const r = monthlyRateFromAnnualBp(600);
    expect(applyMonthlyRate(500_000, r)).toBe(2_434);
    expect(applyMonthlyRate(1_002_434, r)).toBe(4_879);
  });

  it("parse input pengguna", () => {
    expect(parseRupiahInput("Rp 7.500.000")).toBe(7_500_000);
    expect(parseRupiahInput("7500000")).toBe(7_500_000);
    expect(parseRupiahInput("-500.000")).toBe(-500_000);
    expect(parseRupiahInput("")).toBeNull();
    expect(parseRupiahInput("abc")).toBeNull();
  });

  it("percentToBp dan achievementBp", () => {
    expect(percentToBp(12.5)).toBe(1250);
    expect(achievementBp(5_000_000, 20_000_000)).toBe(2_500);
    expect(achievementBp(1, 0)).toBeNull();
  });

  it("format ringkas", () => {
    expect(formatRupiahShort(7_500_000)).toBe("7,5 jt");
    expect(formatRupiahShort(1_200_000_000)).toBe("1,2 M");
    expect(formatRupiahShort(250_000)).toBe("250 rb");
  });
});
