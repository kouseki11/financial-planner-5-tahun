import type { AllocationResult, AssetKind } from "./allocation";
import { BP_DENOM, applyMonthlyRate, monthlyRateFromAnnualBp, roundHalfUp } from "./money";
import type { MonthKey } from "./months";

export type ScenarioKey = "conservative" | "moderate" | "optimistic";

export interface ScenarioAssumptions {
  key: ScenarioKey;
  name: string;
  /** Asumsi return tahunan per kelas aset, bp (boleh negatif). Diinput pengguna, bukan data pasar. */
  stockAnnualBp: number;
  cryptoAnnualBp: number;
  tradingAnnualBp: number;
  cashAnnualBp: number;
  inflationAnnualBp: number;
  /** false → proyeksi profit trading dimatikan (return 0). */
  tradingProjectionEnabled: boolean;
  /** Batas kerugian trading dalam bp dari Σ setoran; proyeksi berhenti merugi di batas ini (asumsi stop-loss). null = tanpa batas. */
  tradingMaxLossBp: number | null;
  description: string;
}

/**
 * Nilai awal HANYA ilustrasi agar aplikasi bisa dijalankan; wajib dapat diubah pengguna di UI.
 * Bukan data pasar, bukan prediksi, bukan rekomendasi.
 */
export const DEFAULT_SCENARIOS: ScenarioAssumptions[] = [
  {
    key: "conservative",
    name: "Konservatif",
    stockAnnualBp: 0,
    cryptoAnnualBp: -3000,
    tradingAnnualBp: -2000,
    cashAnnualBp: 0,
    inflationAnnualBp: 400,
    tradingProjectionEnabled: true,
    tradingMaxLossBp: 5000,
    description: "Asumsi ilustratif: saham stagnan, SOL turun 30 %/tahun, trading rugi 20 %/tahun dengan batas rugi 50 % modal. Ubah sesuai pandangan Anda.",
  },
  {
    key: "moderate",
    name: "Moderat",
    stockAnnualBp: 600,
    cryptoAnnualBp: 0,
    tradingAnnualBp: 0,
    cashAnnualBp: 0,
    inflationAnnualBp: 300,
    tradingProjectionEnabled: true,
    tradingMaxLossBp: 5000,
    description: "Asumsi ilustratif: saham 6 %/tahun, SOL dan trading impas. Ubah sesuai pandangan Anda.",
  },
  {
    key: "optimistic",
    name: "Optimistis",
    stockAnnualBp: 1200,
    cryptoAnnualBp: 2000,
    tradingAnnualBp: 1000,
    cashAnnualBp: 0,
    inflationAnnualBp: 300,
    tradingProjectionEnabled: true,
    tradingMaxLossBp: 5000,
    description: "Asumsi ilustratif: saham 12 %, SOL 20 %, trading 10 % per tahun. Hasil ini tidak dijamin. Ubah sesuai pandangan Anda.",
  },
];

export const ASSET_KINDS: readonly AssetKind[] = ["emergency", "savings_personal", "savings_wedding", "stock", "crypto", "trading"];

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  emergency: "Dana darurat",
  savings_personal: "Tabungan pribadi",
  savings_wedding: "Tabungan nikah",
  stock: "Saham",
  crypto: "Crypto SOL",
  trading: "Trading XAUUSD",
};

export function annualBpFor(kind: AssetKind, s: ScenarioAssumptions): number {
  switch (kind) {
    case "stock":
      return s.stockAnnualBp;
    case "crypto":
      return s.cryptoAnnualBp;
    case "trading":
      return s.tradingProjectionEnabled ? s.tradingAnnualBp : 0;
    default:
      return s.cashAnnualBp;
  }
}

export interface AssetState {
  value: number;
  cumDeposits: number;
  cumWithdrawals: number;
  cumGains: number;
  cumIncome: number;
  cumFees: number;
}

export const emptyAssetState = (): AssetState => ({ value: 0, cumDeposits: 0, cumWithdrawals: 0, cumGains: 0, cumIncome: 0, cumFees: 0 });

export interface AssetFlows {
  deposit: number;
  withdrawal?: number;
  income?: number;
  fee?: number;
}

export interface AssetMonth extends AssetState {
  opening: number;
  gain: number;
  deposit: number;
  withdrawal: number;
  income: number;
  fee: number;
  /** = value */
  closing: number;
}

/**
 * Satu langkah bulanan untuk satu aset.
 * ASUMSI WAKTU: setoran masuk di AKHIR bulan → hanya saldo awal bulan yang mendapat return.
 * closing = opening + gain + deposit − withdrawal + income − fee.
 */
export function projectAssetMonth(prev: AssetState, flows: AssetFlows, monthlyRate: number, floorValue: number | null = null): AssetMonth {
  const opening = prev.value;
  let gain = applyMonthlyRate(opening, monthlyRate);
  const deposit = flows.deposit;
  const withdrawal = flows.withdrawal ?? 0;
  const income = flows.income ?? 0;
  const fee = flows.fee ?? 0;
  let closing = opening + gain + deposit - withdrawal + income - fee;
  if (floorValue !== null && closing < floorValue) {
    // Batas rugi: kerugian dihentikan di floorValue (asumsi stop-loss), gain disesuaikan agar identitas tetap berlaku.
    gain += floorValue - closing;
    closing = floorValue;
  }
  return {
    opening,
    gain,
    deposit,
    withdrawal,
    income,
    fee,
    closing,
    value: closing,
    cumDeposits: prev.cumDeposits + deposit,
    cumWithdrawals: prev.cumWithdrawals + withdrawal,
    cumGains: prev.cumGains + gain,
    cumIncome: prev.cumIncome + income,
    cumFees: prev.cumFees + fee,
  };
}

/** Identitas akuntansi yang wajib berlaku untuk setiap AssetState. */
export function assetIdentityHolds(opening: AssetState, s: AssetState): boolean {
  return s.value === opening.value + (s.cumDeposits - opening.cumDeposits) - (s.cumWithdrawals - opening.cumWithdrawals) + (s.cumGains - opening.cumGains) + (s.cumIncome - opening.cumIncome) - (s.cumFees - opening.cumFees);
}

export interface MonthInput {
  month: MonthKey;
  salary: number;
  /** Total pengeluaran (alokasi non-aset) bulan ini. */
  expenses: number;
  /** Setoran per kelas aset bulan ini (dari anggaran atau realisasi). */
  contributions: Partial<Record<AssetKind, number>>;
  withdrawals?: Partial<Record<AssetKind, number>>;
  income?: Partial<Record<AssetKind, number>>;
  fees?: Partial<Record<AssetKind, number>>;
  /** true = bulan historis (angka aktual); return tidak disimulasikan, nilai mengikuti flows. */
  isActual?: boolean;
  /**
   * Hanya untuk bulan aktual: selisih nilai pasar aktual terhadap nilai arus kas
   * (laba/rugi belum terealisasi yang dicatat lewat valuasi). Masuk sebagai `gain` agar
   * nilai akhir bulan = nilai pasar aktual dan identitas akumulator tetap berlaku.
   */
  marketAdjustment?: Partial<Record<AssetKind, number>>;
}

export interface ProjectionInput {
  months: readonly MonthInput[];
  scenario: ScenarioAssumptions;
  /** Keadaan awal tiap aset sebelum bulan pertama (dari realisasi). Default kosong. */
  opening?: Partial<Record<AssetKind, AssetState>>;
}

export interface MonthProjection {
  month: MonthKey;
  salary: number;
  expenses: number;
  isActual: boolean;
  assets: Record<AssetKind, AssetMonth>;
  totalContribution: number;
  netWorth: number;
  cashLike: number;
  invested: number;
  cumDeposits: number;
  cumInvestedDeposits: number;
  cumGains: number;
  cumIncome: number;
  cumFees: number;
  cumIncome_salary: number;
  cumExpenses: number;
  /** Aset bersih dalam nilai riil (daya beli bulan pertama) berdasarkan asumsi inflasi skenario. */
  netWorthReal: number;
  unallocated: number;
}

export interface ProjectionResult {
  scenario: ScenarioAssumptions;
  months: MonthProjection[];
  final: MonthProjection | null;
  totals: {
    income: number;
    expenses: number;
    deposits: number;
    investedDeposits: number;
    gains: number;
    incomeFromAssets: number;
    fees: number;
    finalNetWorth: number;
    finalNetWorthReal: number;
    finalInvested: number;
    finalCashLike: number;
    unallocated: number;
  };
  /** Asumsi waktu & compounding yang ditampilkan ke pengguna. */
  assumptionsNote: string;
}

export const ASSUMPTIONS_NOTE =
  "Perhitungan per bulan. Setoran dianggap masuk di akhir bulan sehingga baru menghasilkan return mulai bulan berikutnya. " +
  "Tingkat bulanan = (1 + return tahunan)^(1/12) − 1. Semua return adalah asumsi yang Anda tetapkan, bukan data pasar dan bukan jaminan. " +
  "Kas dan tabungan memakai return 0 kecuali diubah. Nilai riil memakai asumsi inflasi skenario.";

function floorForTrading(state: AssetState, s: ScenarioAssumptions): number | null {
  if (s.tradingMaxLossBp === null) return null;
  const base = state.cumDeposits - state.cumWithdrawals;
  return roundHalfUp((base * (BP_DENOM - s.tradingMaxLossBp)) / BP_DENOM);
}

export function runProjection(input: ProjectionInput): ProjectionResult {
  const s = input.scenario;
  const rates: Record<AssetKind, number> = {
    emergency: monthlyRateFromAnnualBp(annualBpFor("emergency", s)),
    savings_personal: monthlyRateFromAnnualBp(annualBpFor("savings_personal", s)),
    savings_wedding: monthlyRateFromAnnualBp(annualBpFor("savings_wedding", s)),
    stock: monthlyRateFromAnnualBp(annualBpFor("stock", s)),
    crypto: monthlyRateFromAnnualBp(annualBpFor("crypto", s)),
    trading: monthlyRateFromAnnualBp(annualBpFor("trading", s)),
  };
  const inflMonthly = monthlyRateFromAnnualBp(s.inflationAnnualBp);

  const state: Record<AssetKind, AssetState> = {
    emergency: { ...(input.opening?.emergency ?? emptyAssetState()) },
    savings_personal: { ...(input.opening?.savings_personal ?? emptyAssetState()) },
    savings_wedding: { ...(input.opening?.savings_wedding ?? emptyAssetState()) },
    stock: { ...(input.opening?.stock ?? emptyAssetState()) },
    crypto: { ...(input.opening?.crypto ?? emptyAssetState()) },
    trading: { ...(input.opening?.trading ?? emptyAssetState()) },
  };

  let cumSalary = 0;
  let cumExpenses = 0;
  let cumUnallocated = 0;
  const months: MonthProjection[] = [];

  input.months.forEach((m, idx) => {
    const isActual = m.isActual ?? false;
    const assets = {} as Record<AssetKind, AssetMonth>;
    let totalContribution = 0;
    for (const kind of ASSET_KINDS) {
      const flows: AssetFlows = {
        deposit: m.contributions[kind] ?? 0,
        withdrawal: m.withdrawals?.[kind] ?? 0,
        income: m.income?.[kind] ?? 0,
        fee: m.fees?.[kind] ?? 0,
      };
      const rate = isActual ? 0 : rates[kind];
      const after = { ...state[kind], cumDeposits: state[kind].cumDeposits + flows.deposit, cumWithdrawals: state[kind].cumWithdrawals + (flows.withdrawal ?? 0) };
      const floor = kind === "trading" && !isActual ? floorForTrading(after, s) : null;
      let am = projectAssetMonth(state[kind], flows, rate, floor);
      const adj = isActual ? (m.marketAdjustment?.[kind] ?? 0) : 0;
      if (adj !== 0) {
        am = { ...am, gain: am.gain + adj, closing: am.closing + adj, value: am.value + adj, cumGains: am.cumGains + adj };
      }
      assets[kind] = am;
      state[kind] = am;
      totalContribution += flows.deposit;
    }
    cumSalary += m.salary;
    cumExpenses += m.expenses;
    const unallocated = Math.max(m.salary - m.expenses - totalContribution, 0);
    cumUnallocated += unallocated;

    const cashLike = assets.emergency.closing + assets.savings_personal.closing + assets.savings_wedding.closing;
    const invested = assets.stock.closing + assets.crypto.closing + assets.trading.closing;
    const netWorthNominal = cashLike + invested;
    const deflator = Math.pow(1 + inflMonthly, idx + 1);

    months.push({
      month: m.month,
      salary: m.salary,
      expenses: m.expenses,
      isActual,
      assets,
      totalContribution,
      netWorth: netWorthNominal,
      cashLike,
      invested,
      cumDeposits: ASSET_KINDS.reduce((a, k) => a + assets[k].cumDeposits, 0),
      cumInvestedDeposits: assets.stock.cumDeposits + assets.crypto.cumDeposits + assets.trading.cumDeposits,
      cumGains: ASSET_KINDS.reduce((a, k) => a + assets[k].cumGains, 0),
      cumIncome: ASSET_KINDS.reduce((a, k) => a + assets[k].cumIncome, 0),
      cumFees: ASSET_KINDS.reduce((a, k) => a + assets[k].cumFees, 0),
      cumIncome_salary: cumSalary,
      cumExpenses,
      netWorthReal: roundHalfUp(netWorthNominal / deflator),
      unallocated,
    });
  });

  const final = months.length ? months[months.length - 1] : null;
  const openingDeposits = ASSET_KINDS.reduce((a, k) => a + (input.opening?.[k]?.cumDeposits ?? 0), 0);
  const openingInvestedDeposits = (["stock", "crypto", "trading"] as AssetKind[]).reduce((a, k) => a + (input.opening?.[k]?.cumDeposits ?? 0), 0);
  const openingGains = ASSET_KINDS.reduce((a, k) => a + (input.opening?.[k]?.cumGains ?? 0), 0);
  const openingIncome = ASSET_KINDS.reduce((a, k) => a + (input.opening?.[k]?.cumIncome ?? 0), 0);
  const openingFees = ASSET_KINDS.reduce((a, k) => a + (input.opening?.[k]?.cumFees ?? 0), 0);

  return {
    scenario: s,
    months,
    final,
    totals: {
      income: cumSalary,
      expenses: cumExpenses,
      deposits: (final?.cumDeposits ?? openingDeposits) - openingDeposits,
      investedDeposits: (final?.cumInvestedDeposits ?? openingInvestedDeposits) - openingInvestedDeposits,
      gains: (final?.cumGains ?? openingGains) - openingGains,
      incomeFromAssets: (final?.cumIncome ?? openingIncome) - openingIncome,
      fees: (final?.cumFees ?? openingFees) - openingFees,
      finalNetWorth: final?.netWorth ?? 0,
      finalNetWorthReal: final?.netWorthReal ?? 0,
      finalInvested: final?.invested ?? 0,
      finalCashLike: final?.cashLike ?? 0,
      unallocated: cumUnallocated,
    },
    assumptionsNote: ASSUMPTIONS_NOTE,
  };
}

/** Pecah hasil alokasi menjadi setoran per kelas aset + total pengeluaran (non-aset). */
export function splitAllocation(a: AllocationResult): { contributions: Partial<Record<AssetKind, number>>; expenses: number } {
  const contributions: Partial<Record<AssetKind, number>> = {};
  let expenses = 0;
  for (const l of a.lines) {
    if (l.assetKind) contributions[l.assetKind] = (contributions[l.assetKind] ?? 0) + l.amount;
    else expenses += l.amount;
  }
  return { contributions, expenses };
}

export interface ScenarioComparisonRow {
  key: ScenarioKey;
  name: string;
  finalNetWorth: number;
  finalNetWorthReal: number;
  deposits: number;
  gains: number;
  finalInvested: number;
  finalCashLike: number;
}

export function compareScenarios(results: readonly ProjectionResult[]): ScenarioComparisonRow[] {
  return results.map((r) => ({
    key: r.scenario.key,
    name: r.scenario.name,
    finalNetWorth: r.totals.finalNetWorth,
    finalNetWorthReal: r.totals.finalNetWorthReal,
    deposits: r.totals.deposits,
    gains: r.totals.gains,
    finalInvested: r.totals.finalInvested,
    finalCashLike: r.totals.finalCashLike,
  }));
}

/** Nilai per akhir tahun rencana (indeks 12, 24, ..., 60) untuk kartu "proyeksi akhir tahun". */
export function yearEndPoints(result: ProjectionResult): MonthProjection[] {
  return result.months.filter((_, i) => (i + 1) % 12 === 0);
}
