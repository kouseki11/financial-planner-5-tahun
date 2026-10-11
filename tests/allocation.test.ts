import { describe, expect, it } from "vitest";
import { applyRaisePolicy, computeAllocation, type CategoryRule } from "@/lib/allocation";

/** Alokasi awal spec §3 — semua nominal tetap. */
export const initialRules: CategoryRule[] = [
  { id: 1, name: "Bantuan orang tua", slug: "bantuan-orang-tua", groupKey: "wajib", assetKind: null, method: "fixed", fixedAmount: 2_000_000, percentBp: 0, priority: 10, isActive: true },
  { id: 2, name: "Kebutuhan pribadi", slug: "kebutuhan-pribadi", groupKey: "wajib", assetKind: null, method: "fixed", fixedAmount: 2_000_000, percentBp: 0, priority: 20, isActive: true },
  { id: 3, name: "Dana darurat", slug: "dana-darurat", groupKey: "dana_darurat", assetKind: "emergency", method: "fixed", fixedAmount: 1_000_000, percentBp: 0, priority: 30, isActive: true },
  { id: 4, name: "Tabungan nikah", slug: "tabungan-nikah", groupKey: "tabungan", assetKind: "savings_wedding", method: "fixed", fixedAmount: 200_000, percentBp: 0, priority: 40, isActive: true },
  { id: 5, name: "Tabungan pribadi", slug: "tabungan-pribadi", groupKey: "tabungan", assetKind: "savings_personal", method: "fixed", fixedAmount: 300_000, percentBp: 0, priority: 50, isActive: true },
  { id: 6, name: "Saham", slug: "saham", groupKey: "investasi", assetKind: "stock", method: "fixed", fixedAmount: 500_000, percentBp: 0, priority: 60, isActive: true },
  { id: 7, name: "Crypto SOL", slug: "crypto-sol", groupKey: "investasi", assetKind: "crypto", method: "fixed", fixedAmount: 500_000, percentBp: 0, priority: 70, isActive: true },
  { id: 8, name: "Modal trading XAUUSD", slug: "trading-xauusd", groupKey: "investasi", assetKind: "trading", method: "fixed", fixedAmount: 200_000, percentBp: 0, priority: 80, isActive: true },
  { id: 9, name: "Pacar", slug: "pacar", groupKey: "fleksibel", assetKind: null, method: "fixed", fixedAmount: 500_000, percentBp: 0, priority: 90, isActive: true },
];

/**
 * Catatan: tabel spec §3 menuliskan total Rp7.500.000, tetapi jumlah nominalnya Rp7.200.000.
 * Aplikasi menampilkan selisih Rp300.000 sebagai sisa (tidak disembunyikan). Untuk kasus
 * "anggaran seimbang" dipakai set berikut (Kebutuhan pribadi dinaikkan menjadi Rp2.300.000).
 */
export const balancedRules: CategoryRule[] = initialRules.map((c) => (c.id === 2 ? { ...c, fixedAmount: 2_300_000 } : c));

describe("allocation", () => {
  it("data awal spec: total Rp7.200.000 → sisa Rp300.000 ditampilkan, bukan disembunyikan", () => {
    const r = computeAllocation(7_500_000, initialRules);
    expect(r.total).toBe(7_200_000);
    expect(r.remaining).toBe(300_000);
    expect(r.status).toBe("surplus");
  });

  it("T4: alokasi seimbang → total = gaji, sisa 0", () => {
    const r = computeAllocation(7_500_000, balancedRules);
    expect(r.total).toBe(7_500_000);
    expect(r.remaining).toBe(0);
    expect(r.deficit).toBe(0);
    expect(r.status).toBe("balanced");
    expect(r.byGroup).toEqual({ wajib: 4_300_000, dana_darurat: 1_000_000, tabungan: 500_000, investasi: 1_200_000, fleksibel: 500_000 });
  });

  it("T5: alokasi melebihi gaji → defisit dan kategori penyebab (prioritas terendah dulu)", () => {
    const rules = balancedRules.map((c) => (c.id === 2 ? { ...c, fixedAmount: 3_300_000 } : c));
    const r = computeAllocation(7_500_000, rules);
    expect(r.status).toBe("deficit");
    expect(r.deficit).toBe(1_000_000);
    expect(r.remaining).toBe(0);
    // penyebab: Pacar (500k) + XAUUSD (200k) + SOL (500k) = 1,2 jt ≥ 1 jt
    expect(r.deficitCauses.map((l) => l.slug)).toEqual(["pacar", "trading-xauusd", "crypto-sol"]);
  });

  it("kenaikan gaji TIDAK otomatis menaikkan investasi (kebijakan manual → sisa tampil)", () => {
    const r = computeAllocation(10_000_000, applyRaisePolicy(balancedRules, 7_500_000, 10_000_000, "manual"));
    expect(r.total).toBe(7_500_000);
    expect(r.remaining).toBe(2_500_000);
    expect(r.status).toBe("surplus");
    expect(r.lines.find((l) => l.slug === "saham")?.amount).toBe(500_000);
  });

  it("kebijakan emergency_first mengarahkan seluruh kenaikan ke dana darurat", () => {
    const rules = applyRaisePolicy(balancedRules, 7_500_000, 10_000_000, "emergency_first");
    const r = computeAllocation(10_000_000, rules);
    expect(r.lines.find((l) => l.slug === "dana-darurat")?.amount).toBe(3_500_000);
    expect(r.remaining).toBe(0);
    expect(r.status).toBe("balanced");
    // input tidak dimutasi
    expect(initialRules[2].fixedAmount).toBe(1_000_000);
  });

  it("kebijakan proportional: sisa pembulatan tampil sebagai sisa, bukan ditambahkan diam-diam", () => {
    const rules = applyRaisePolicy(balancedRules, 7_500_000, 10_000_000, "proportional");
    const r = computeAllocation(10_000_000, rules);
    expect(r.lines.find((l) => l.slug === "saham")?.amount).toBe(666_667);
    expect(r.lines.find((l) => l.slug === "bantuan-orang-tua")?.amount).toBe(2_666_667);
    expect(r.total + r.remaining - r.deficit).toBe(10_000_000);
    expect(Math.abs(r.total - 10_000_000)).toBeLessThan(10);
  });

  it("metode percent dari gaji mengikuti gaji baru", () => {
    const rules = initialRules.map((c) => (c.id === 6 ? { ...c, method: "percent" as const, percentBp: 1_000 } : c));
    expect(computeAllocation(7_500_000, rules).lines.find((l) => l.slug === "saham")?.amount).toBe(750_000);
    expect(computeAllocation(10_000_000, rules).lines.find((l) => l.slug === "saham")?.amount).toBe(1_000_000);
  });

  it("metode min_plus_percent: minimum + bp × sisa setelah fixed/percent/minimum", () => {
    // Hanya 3 kategori: wajib 4 jt fixed, dana darurat min 500k + 50 % sisa, saham min 0 + 50 % sisa
    const rules: CategoryRule[] = [
      { ...initialRules[0], fixedAmount: 4_000_000 },
      { ...initialRules[2], method: "min_plus_percent", fixedAmount: 500_000, percentBp: 5_000 },
      { ...initialRules[5], method: "min_plus_percent", fixedAmount: 0, percentBp: 5_000 },
    ];
    const r = computeAllocation(7_500_000, rules);
    // sisa = 7,5 jt − 4 jt − 0,5 jt = 3 jt → masing-masing +1,5 jt
    expect(r.lines.find((l) => l.slug === "dana-darurat")?.amount).toBe(2_000_000);
    expect(r.lines.find((l) => l.slug === "saham")?.amount).toBe(1_500_000);
    expect(r.status).toBe("balanced");
  });

  it("kategori nonaktif diabaikan", () => {
    const rules = balancedRules.map((c) => (c.slug === "pacar" ? { ...c, isActive: false } : c));
    const r = computeAllocation(7_500_000, rules);
    expect(r.lines.some((l) => l.slug === "pacar")).toBe(false);
    expect(r.remaining).toBe(500_000);
  });

  it("menolak gaji non-integer", () => {
    expect(() => computeAllocation(7_500_000.5, initialRules)).toThrow();
  });
});
