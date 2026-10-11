import type { AssetKind } from "./allocation";
import { BP_DENOM, roundHalfUp } from "./money";
import type { MonthKey } from "./months";

export type TxType = "deposit" | "withdraw" | "buy" | "sell" | "dividend" | "fee" | "realized_pnl";

export const TX_TYPE_LABELS: Record<TxType, string> = {
  deposit: "Setoran modal",
  withdraw: "Penarikan",
  buy: "Beli",
  sell: "Jual",
  dividend: "Dividen",
  fee: "Biaya",
  realized_pnl: "Profit/Loss terealisasi",
};

/** Kuantitas disimpan × 1.000.000 agar SOL pecahan tetap integer. */
export const QTY_E6 = 1_000_000;

export interface AssetTx {
  id: number;
  accountId: number;
  type: TxType;
  tradeDate: string; // YYYY-MM-DD
  month: MonthKey;
  symbol: string | null;
  quantityE6: number | null;
  pricePerUnit: number | null;
  fee: number;
  /**
   * deposit/withdraw/dividend/fee: magnitudo positif.
   * realized_pnl: bertanda (+ profit, − loss).
   * buy/sell: diabaikan (dihitung dari qty × harga ± fee).
   */
  amount: number;
  note?: string | null;
}

export interface Valuation {
  symbol: string;
  asOfDate: string;
  pricePerUnit: number;
  source: "manual" | "last_known";
}

export interface AssetAccount {
  id: number;
  kind: AssetKind;
  name: string;
  openingBalance: number;
  targetAmount: number | null;
  targetMonthsOfExpenses: number | null;
  lossLimitBp: number | null;
}

/** Nilai kotor transaksi beli/jual (qty × harga) dibulatkan ke rupiah. */
export function grossValue(quantityE6: number, pricePerUnit: number): number {
  return roundHalfUp((quantityE6 * pricePerUnit) / QTY_E6);
}

/** Efek bertanda transaksi terhadap KAS akun. */
export function cashEffect(tx: AssetTx): number {
  switch (tx.type) {
    case "deposit":
      return Math.abs(tx.amount);
    case "withdraw":
      return -Math.abs(tx.amount);
    case "dividend":
      return Math.abs(tx.amount);
    case "fee":
      return -Math.abs(tx.amount);
    case "realized_pnl":
      return tx.amount;
    case "buy":
      return -(grossValue(tx.quantityE6 ?? 0, tx.pricePerUnit ?? 0) + tx.fee);
    case "sell":
      return grossValue(tx.quantityE6 ?? 0, tx.pricePerUnit ?? 0) - tx.fee;
  }
}

export interface PositionSummary {
  symbol: string;
  quantityE6: number;
  /** Modal tersisa untuk posisi terbuka (rata-rata), termasuk fee beli. */
  costBasis: number;
  avgCostPerUnit: number | null;
  lastPrice: number | null;
  lastPriceDate: string | null;
  priceSource: Valuation["source"] | null;
  /** qty × harga terakhir; null jika belum ada valuasi. */
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
  dividends: number;
}

export interface AccountSummary {
  accountId: number;
  kind: AssetKind;
  openingBalance: number;
  /** Kas di akun = saldo awal + Σ efek kas. Untuk saham/crypto = dana belum terpakai (carry-over). */
  cash: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalDividends: number;
  totalFees: number;
  /** Trading: Σ realized_pnl; saham/crypto: Σ laba jual (harga jual − modal rata-rata). */
  totalRealizedPnl: number;
  positions: PositionSummary[];
  /** Σ marketValue posisi (costBasis dipakai bila valuasi belum ada, ditandai valuationMissing). */
  marketValue: number;
  valuationMissing: boolean;
  /** Nilai total akun = cash + marketValue. Ini SATU-SATUNYA angka yang masuk aset bersih. */
  totalValue: number;
  /** Σ setoran − Σ penarikan. Metrik terpisah, TIDAK ditambahkan ke totalValue. */
  netContribution: number;
  unrealizedPnl: number;
  /** totalValue − openingBalance − netContribution = realized + unrealized + dividen − fee. */
  totalReturn: number;
  /** totalReturn / Σ setoran, dalam bp; null jika belum ada setoran. */
  returnOnDepositsBp: number | null;
  /** Drawdown maksimum saldo akun (rupiah dan bp dari puncak). */
  maxDrawdown: number;
  maxDrawdownBp: number | null;
  lastTxDate: string | null;
}

function sortTx(txs: readonly AssetTx[]): AssetTx[] {
  return [...txs].sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : a.id - b.id));
}

export function latestValuation(valuations: readonly Valuation[], symbol: string, asOfDate?: string): Valuation | null {
  let best: Valuation | null = null;
  for (const v of valuations) {
    if (v.symbol !== symbol) continue;
    if (asOfDate && v.asOfDate > asOfDate) continue;
    if (!best || v.asOfDate > best.asOfDate) best = v;
  }
  return best;
}

/**
 * Ringkasan satu akun aset dari seluruh transaksi + valuasi.
 * `asOf` (opsional, YYYY-MM-DD) membatasi transaksi dan valuasi hingga tanggal tersebut.
 */
export function summarizeAccount(
  account: AssetAccount,
  txs: readonly AssetTx[],
  valuations: readonly Valuation[],
  asOf?: string,
): AccountSummary {
  const ordered = sortTx(txs.filter((t) => t.accountId === account.id && (!asOf || t.tradeDate <= asOf)));

  let cash = account.openingBalance;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividends = 0;
  let totalFees = 0;
  let totalRealizedPnl = 0;
  let peak = account.openingBalance;
  let maxDrawdown = 0;
  let maxDrawdownBp: number | null = null;

  const positions = new Map<string, { quantityE6: number; costBasis: number; realizedPnl: number; dividends: number }>();
  const pos = (symbol: string) => {
    let p = positions.get(symbol);
    if (!p) {
      p = { quantityE6: 0, costBasis: 0, realizedPnl: 0, dividends: 0 };
      positions.set(symbol, p);
    }
    return p;
  };

  for (const tx of ordered) {
    const effect = cashEffect(tx);
    cash += effect;
    totalFees += tx.type === "fee" ? Math.abs(tx.amount) : tx.type === "buy" || tx.type === "sell" ? tx.fee : 0;

    switch (tx.type) {
      case "deposit":
        totalDeposits += Math.abs(tx.amount);
        break;
      case "withdraw":
        totalWithdrawals += Math.abs(tx.amount);
        break;
      case "dividend":
        totalDividends += Math.abs(tx.amount);
        if (tx.symbol) pos(tx.symbol).dividends += Math.abs(tx.amount);
        break;
      case "realized_pnl":
        totalRealizedPnl += tx.amount;
        break;
      case "buy": {
        if (!tx.symbol) break;
        const p = pos(tx.symbol);
        p.quantityE6 += tx.quantityE6 ?? 0;
        p.costBasis += grossValue(tx.quantityE6 ?? 0, tx.pricePerUnit ?? 0) + tx.fee;
        break;
      }
      case "sell": {
        if (!tx.symbol) break;
        const p = pos(tx.symbol);
        const qty = tx.quantityE6 ?? 0;
        const proceeds = grossValue(qty, tx.pricePerUnit ?? 0) - tx.fee;
        const costOut = p.quantityE6 > 0 ? roundHalfUp((p.costBasis * qty) / p.quantityE6) : 0;
        p.quantityE6 -= qty;
        p.costBasis -= costOut;
        const pnl = proceeds - costOut;
        p.realizedPnl += pnl;
        totalRealizedPnl += pnl;
        break;
      }
      case "fee":
        break;
    }

    // Drawdown saldo akun: hanya untuk arus yang bukan setoran/penarikan modal.
    if (tx.type !== "deposit" && tx.type !== "withdraw") {
      if (cash > peak) peak = cash;
      const dd = peak - cash;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        maxDrawdownBp = peak > 0 ? roundHalfUp((dd * BP_DENOM) / peak) : null;
      }
    } else {
      peak = Math.max(peak + effect, cash);
    }
  }

  let marketValue = 0;
  let valuationMissing = false;
  let unrealizedPnl = 0;
  const positionList: PositionSummary[] = [];
  for (const [symbol, p] of positions) {
    const v = latestValuation(valuations, symbol, asOf);
    const mv = v ? grossValue(p.quantityE6, v.pricePerUnit) : null;
    if (p.quantityE6 > 0) {
      if (mv === null) {
        valuationMissing = true;
        marketValue += p.costBasis;
      } else {
        marketValue += mv;
        unrealizedPnl += mv - p.costBasis;
      }
    }
    positionList.push({
      symbol,
      quantityE6: p.quantityE6,
      costBasis: p.costBasis,
      avgCostPerUnit: p.quantityE6 > 0 ? roundHalfUp((p.costBasis * QTY_E6) / p.quantityE6) : null,
      lastPrice: v?.pricePerUnit ?? null,
      lastPriceDate: v?.asOfDate ?? null,
      priceSource: v?.source ?? null,
      marketValue: mv,
      unrealizedPnl: mv === null ? null : mv - p.costBasis,
      realizedPnl: p.realizedPnl,
      dividends: p.dividends,
    });
  }

  const totalValue = cash + marketValue;
  const netContribution = totalDeposits - totalWithdrawals;
  const totalReturn = totalValue - account.openingBalance - netContribution;

  return {
    accountId: account.id,
    kind: account.kind,
    openingBalance: account.openingBalance,
    cash,
    totalDeposits,
    totalWithdrawals,
    totalDividends,
    totalFees,
    totalRealizedPnl,
    positions: positionList,
    marketValue,
    valuationMissing,
    totalValue,
    netContribution,
    unrealizedPnl,
    totalReturn,
    returnOnDepositsBp: totalDeposits > 0 ? roundHalfUp((totalReturn * BP_DENOM) / totalDeposits) : null,
    maxDrawdown,
    maxDrawdownBp,
    lastTxDate: ordered.length ? ordered[ordered.length - 1].tradeDate : null,
  };
}

export const CASH_LIKE_KINDS: readonly AssetKind[] = ["emergency", "savings_personal", "savings_wedding"];
export const RISKY_KINDS: readonly AssetKind[] = ["stock", "crypto", "trading"];

export interface NetWorthSummary {
  total: number;
  byKind: Partial<Record<AssetKind, number>>;
  cashLike: number;
  invested: number;
  /** Σ setoran bersih ke aset berisiko (metrik terpisah). */
  investedContribution: number;
  /** invested − investedContribution − saldo awal aset berisiko. Dana darurat & tabungan TIDAK termasuk. */
  investmentPnl: number;
}

/**
 * Total aset bersih = Σ totalValue tiap akun (kas + nilai pasar), masing-masing dihitung SEKALI.
 * Setoran, dividen, dan laba tidak ditambahkan lagi karena sudah tercermin dalam kas / nilai pasar.
 */
export function netWorth(summaries: readonly AccountSummary[]): NetWorthSummary {
  const byKind: Partial<Record<AssetKind, number>> = {};
  let total = 0;
  let cashLike = 0;
  let invested = 0;
  let investedContribution = 0;
  let investedOpening = 0;
  for (const s of summaries) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + s.totalValue;
    total += s.totalValue;
    if (CASH_LIKE_KINDS.includes(s.kind)) cashLike += s.totalValue;
    if (RISKY_KINDS.includes(s.kind)) {
      invested += s.totalValue;
      investedContribution += s.netContribution;
      investedOpening += s.openingBalance;
    }
  }
  return {
    total,
    byKind,
    cashLike,
    invested,
    investedContribution,
    investmentPnl: invested - investedContribution - investedOpening,
  };
}

/** Σ setoran (deposit) per bulan per akun — untuk rencana vs realisasi dan titik awal proyeksi. */
export function depositsByMonth(txs: readonly AssetTx[]): Map<MonthKey, number> {
  const m = new Map<MonthKey, number>();
  for (const t of txs) {
    if (t.type !== "deposit") continue;
    m.set(t.month, (m.get(t.month) ?? 0) + Math.abs(t.amount));
  }
  return m;
}

/** Estimasi bulan target tercapai dengan setoran bulanan tetap (tanpa bunga). null jika tidak tercapai. */
export function monthsToTarget(current: number, target: number, monthlyDeposit: number): number | null {
  if (target <= current) return 0;
  if (monthlyDeposit <= 0) return null;
  return Math.ceil((target - current) / monthlyDeposit);
}
