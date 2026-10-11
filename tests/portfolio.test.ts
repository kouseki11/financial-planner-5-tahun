import { describe, expect, it } from "vitest";
import {
  QTY_E6,
  cashEffect,
  depositsByMonth,
  grossValue,
  monthsToTarget,
  netWorth,
  summarizeAccount,
  type AssetAccount,
  type AssetTx,
  type Valuation,
} from "@/lib/portfolio";

const stockAccount: AssetAccount = { id: 1, kind: "stock", name: "Saham", openingBalance: 0, targetAmount: null, targetMonthsOfExpenses: null, lossLimitBp: null };
const tradingAccount: AssetAccount = { id: 2, kind: "trading", name: "XAUUSD", openingBalance: 0, targetAmount: null, targetMonthsOfExpenses: null, lossLimitBp: 5000 };
const emergencyAccount: AssetAccount = { id: 3, kind: "emergency", name: "Dana darurat", openingBalance: 1_000_000, targetAmount: 12_000_000, targetMonthsOfExpenses: 3, lossLimitBp: null };

let nextId = 1;
const tx = (partial: Partial<AssetTx> & Pick<AssetTx, "accountId" | "type" | "tradeDate">): AssetTx => ({
  id: nextId++,
  month: partial.tradeDate.slice(0, 7),
  symbol: null,
  quantityE6: null,
  pricePerUnit: null,
  fee: 0,
  amount: 0,
  ...partial,
});

describe("portfolio", () => {
  it("T7: profit/loss trading dihitung terpisah dari setoran modal", () => {
    const txs = [
      tx({ accountId: 2, type: "deposit", tradeDate: "2026-10-05", amount: 1_000_000 }),
      tx({ accountId: 2, type: "realized_pnl", tradeDate: "2026-10-20", amount: 100_000, symbol: "XAUUSD" }),
    ];
    const s = summarizeAccount(tradingAccount, txs, []);
    expect(s.totalDeposits).toBe(1_000_000);
    expect(s.totalRealizedPnl).toBe(100_000);
    expect(s.cash).toBe(1_100_000);
    expect(s.totalValue).toBe(1_100_000);
    expect(s.totalReturn).toBe(100_000);
    expect(s.returnOnDepositsBp).toBe(1_000); // 10 %
  });

  it("T7: setoran tambahan tidak menaikkan return; loss dan fee mengurangi", () => {
    const txs = [
      tx({ accountId: 2, type: "deposit", tradeDate: "2026-10-05", amount: 1_000_000 }),
      tx({ accountId: 2, type: "deposit", tradeDate: "2026-11-05", amount: 1_000_000 }),
      tx({ accountId: 2, type: "realized_pnl", tradeDate: "2026-11-20", amount: -300_000, symbol: "XAUUSD" }),
      tx({ accountId: 2, type: "fee", tradeDate: "2026-11-21", amount: 20_000 }),
    ];
    const s = summarizeAccount(tradingAccount, txs, []);
    expect(s.totalDeposits).toBe(2_000_000);
    expect(s.totalRealizedPnl).toBe(-300_000);
    expect(s.totalFees).toBe(20_000);
    expect(s.totalValue).toBe(1_680_000);
    expect(s.totalReturn).toBe(-320_000);
    expect(s.returnOnDepositsBp).toBe(-1_600);
    expect(s.maxDrawdown).toBe(320_000);
    expect(s.maxDrawdownBp).toBe(1_600);
  });

  it("T8: nilai aset tidak dihitung dua kali (kas + nilai pasar, bukan + setoran)", () => {
    const txs = [
      tx({ accountId: 1, type: "deposit", tradeDate: "2026-10-05", amount: 1_100_000 }),
      // beli 1 lot (100 lembar) BBCA @ Rp10.000, fee Rp10.000
      tx({ accountId: 1, type: "buy", tradeDate: "2026-10-06", symbol: "BBCA", quantityE6: 100 * QTY_E6, pricePerUnit: 10_000, fee: 10_000 }),
    ];
    const valuations: Valuation[] = [{ symbol: "BBCA", asOfDate: "2026-10-30", pricePerUnit: 10_000, source: "manual" }];
    const s = summarizeAccount(stockAccount, txs, valuations);
    expect(s.cash).toBe(90_000);
    expect(s.marketValue).toBe(1_000_000);
    expect(s.totalValue).toBe(1_090_000);
    expect(s.totalDeposits).toBe(1_100_000);
    expect(s.totalReturn).toBe(-10_000); // hanya fee
    const nw = netWorth([s]);
    expect(nw.total).toBe(1_090_000);
    expect(nw.total).not.toBe(2_100_000);
    expect(nw.investmentPnl).toBe(-10_000);
  });

  it("unrealized P/L mengikuti valuasi terakhir dan tanggalnya; dividen = pendapatan", () => {
    const txs = [
      tx({ accountId: 1, type: "deposit", tradeDate: "2026-10-05", amount: 1_100_000 }),
      tx({ accountId: 1, type: "buy", tradeDate: "2026-10-06", symbol: "BBCA", quantityE6: 100 * QTY_E6, pricePerUnit: 10_000, fee: 10_000 }),
      tx({ accountId: 1, type: "dividend", tradeDate: "2026-12-01", symbol: "BBCA", amount: 15_000 }),
    ];
    const valuations: Valuation[] = [
      { symbol: "BBCA", asOfDate: "2026-10-30", pricePerUnit: 10_000, source: "manual" },
      { symbol: "BBCA", asOfDate: "2026-12-15", pricePerUnit: 11_000, source: "manual" },
    ];
    const s = summarizeAccount(stockAccount, txs, valuations);
    const bbca = s.positions.find((p) => p.symbol === "BBCA")!;
    expect(bbca.lastPrice).toBe(11_000);
    expect(bbca.lastPriceDate).toBe("2026-12-15");
    expect(bbca.marketValue).toBe(1_100_000);
    expect(bbca.unrealizedPnl).toBe(90_000); // 1.100.000 − (1.000.000 + 10.000 fee)
    expect(s.totalDividends).toBe(15_000);
    expect(s.cash).toBe(105_000);
    expect(s.totalValue).toBe(1_205_000);
    expect(s.totalReturn).toBe(105_000); // 90.000 unrealized + 15.000 dividen
    // asOf sebelum valuasi kedua → pakai harga lama
    expect(summarizeAccount(stockAccount, txs, valuations, "2026-11-30").marketValue).toBe(1_000_000);
  });

  it("tanpa valuasi: nilai pasar = modal dan ditandai valuationMissing", () => {
    const txs = [
      tx({ accountId: 1, type: "deposit", tradeDate: "2026-10-05", amount: 1_100_000 }),
      tx({ accountId: 1, type: "buy", tradeDate: "2026-10-06", symbol: "BBCA", quantityE6: 100 * QTY_E6, pricePerUnit: 10_000, fee: 10_000 }),
    ];
    const s = summarizeAccount(stockAccount, txs, []);
    expect(s.valuationMissing).toBe(true);
    expect(s.marketValue).toBe(1_010_000);
    expect(s.unrealizedPnl).toBe(0);
  });

  it("jual sebagian: realized P/L dari modal rata-rata, posisi berkurang", () => {
    const txs = [
      tx({ accountId: 1, type: "deposit", tradeDate: "2026-10-05", amount: 2_100_000 }),
      tx({ accountId: 1, type: "buy", tradeDate: "2026-10-06", symbol: "BBRI", quantityE6: 200 * QTY_E6, pricePerUnit: 10_000, fee: 20_000 }),
      tx({ accountId: 1, type: "sell", tradeDate: "2026-11-06", symbol: "BBRI", quantityE6: 100 * QTY_E6, pricePerUnit: 12_000, fee: 12_000 }),
    ];
    const s = summarizeAccount(stockAccount, txs, [{ symbol: "BBRI", asOfDate: "2026-11-06", pricePerUnit: 12_000, source: "manual" }]);
    const p = s.positions[0];
    expect(p.quantityE6).toBe(100 * QTY_E6);
    expect(p.costBasis).toBe(1_010_000);
    // proceeds 1.188.000 − cost out 1.010.000 = 178.000
    expect(p.realizedPnl).toBe(178_000);
    expect(s.cash).toBe(2_100_000 - 2_020_000 + 1_188_000);
    expect(s.totalValue).toBe(s.cash + 1_200_000);
    expect(s.totalReturn).toBe(178_000 + 190_000);
  });

  it("T12: kuantitas pecahan SOL dibulatkan ke rupiah secara konsisten", () => {
    // 0,3333 SOL @ Rp2.000.000 = Rp666.600; fee 1.000
    expect(grossValue(333_300, 2_000_000)).toBe(666_600);
    const buy = tx({ accountId: 5, type: "buy", tradeDate: "2026-10-06", symbol: "SOL", quantityE6: 333_300, pricePerUnit: 2_000_000, fee: 1_000 });
    expect(cashEffect(buy)).toBe(-667_600);
    // 1 SOL / 3 → qtyE6 = 333.333; × 1.234.567 = 411.522,2 → 411.522
    expect(grossValue(333_333, 1_234_567)).toBe(411_522);
  });

  it("dana darurat: saldo awal + setoran − penarikan; target dan estimasi bulan", () => {
    const txs = [
      tx({ accountId: 3, type: "deposit", tradeDate: "2026-10-25", amount: 1_000_000 }),
      tx({ accountId: 3, type: "deposit", tradeDate: "2026-11-25", amount: 1_000_000 }),
      tx({ accountId: 3, type: "withdraw", tradeDate: "2026-12-02", amount: 500_000 }),
    ];
    const s = summarizeAccount(emergencyAccount, txs, []);
    expect(s.totalValue).toBe(2_500_000);
    expect(s.totalReturn).toBe(0);
    expect(monthsToTarget(s.totalValue, 12_000_000, 1_000_000)).toBe(10);
    expect(monthsToTarget(12_000_000, 12_000_000, 1_000_000)).toBe(0);
    expect(monthsToTarget(0, 12_000_000, 0)).toBeNull();
    const nw = netWorth([s]);
    expect(nw.cashLike).toBe(2_500_000);
    expect(nw.investmentPnl).toBe(0); // dana darurat bukan keuntungan investasi
  });

  it("depositsByMonth mengelompokkan setoran", () => {
    const txs = [
      tx({ accountId: 3, type: "deposit", tradeDate: "2026-10-25", amount: 1_000_000 }),
      tx({ accountId: 3, type: "deposit", tradeDate: "2026-10-28", amount: 200_000 }),
      tx({ accountId: 3, type: "withdraw", tradeDate: "2026-10-29", amount: 50_000 }),
    ];
    expect(depositsByMonth(txs).get("2026-10")).toBe(1_200_000);
  });
});
