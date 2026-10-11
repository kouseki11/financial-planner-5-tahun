/**
 * Utilitas uang. Semua nominal rupiah adalah INTEGER (tidak ada float untuk uang).
 * Persentase disimpan sebagai basis poin (bp): 10.000 bp = 100 %.
 */

export const BP_DENOM = 10_000;

/** Pembulatan "half away from zero" agar simetris untuk nilai negatif. */
export function roundHalfUp(x: number): number {
  if (!Number.isFinite(x)) throw new Error(`Nilai tidak valid: ${x}`);
  return Math.sign(x) * Math.round(Math.abs(x));
}

export function assertRupiah(n: unknown, label = "nominal"): number {
  if (typeof n !== "number" || !Number.isInteger(n) || !Number.isSafeInteger(n)) {
    throw new Error(`${label} harus integer rupiah, diterima: ${String(n)}`);
  }
  return n;
}

/** amount × bp / 10.000, dibulatkan ke rupiah. */
export function applyBp(amount: number, bp: number): number {
  assertRupiah(amount, "amount");
  if (!Number.isInteger(bp)) throw new Error(`bp harus integer: ${bp}`);
  return roundHalfUp((amount * bp) / BP_DENOM);
}

/** Persen desimal (mis. 12.5) → bp (1250). */
export function percentToBp(percent: number): number {
  return roundHalfUp(percent * 100);
}

export function bpToPercent(bp: number): number {
  return bp / 100;
}

/**
 * Konversi tingkat tahunan (bp) ke tingkat bulanan desimal secara geometrik:
 * (1 + r_tahun)^(1/12) − 1. Untuk −100 % per tahun hasilnya −1 (habis).
 */
export function monthlyRateFromAnnualBp(annualBp: number): number {
  const annual = annualBp / BP_DENOM;
  if (annual <= -1) return -1;
  return Math.pow(1 + annual, 1 / 12) - 1;
}

/** Keuntungan/kerugian satu bulan atas saldo awal bulan, dibulatkan ke rupiah. */
export function applyMonthlyRate(openingValue: number, monthlyRate: number): number {
  assertRupiah(openingValue, "openingValue");
  return roundHalfUp(openingValue * monthlyRate);
}

const idFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 7500000 → "Rp7.500.000"; −500000 → "-Rp500.000". */
export function formatRupiah(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const body = idFormatter.format(abs);
  return (n < 0 ? "-" : "") + "Rp" + body;
}

/** Format ringkas untuk sumbu grafik: 7500000 → "7,5 jt"; 1200000000 → "1,2 M". */
export function formatRupiahShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} rb`;
  return `${sign}${abs}`;
}

/** Parse input pengguna "Rp 7.500.000" / "7500000" / "-500.000" → integer. null jika kosong/invalid. */
export function parseRupiahInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const negative = trimmed.startsWith("-");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const value = Number.parseInt(digits, 10);
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

/** Persentase pencapaian dalam bp (0..∞). target 0 → null. */
export function achievementBp(current: number, target: number): number | null {
  if (target <= 0) return null;
  return roundHalfUp((current * BP_DENOM) / target);
}

export function formatBp(bp: number, digits = 1): string {
  return `${(bp / 100).toFixed(digits).replace(".", ",")} %`;
}
