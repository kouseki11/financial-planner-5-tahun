import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { assetTransactions, monthlyActuals } from "@/db/schema";
import { QTY_E6 } from "@/lib/portfolio";
import { assetIdentityHolds, emptyAssetState } from "@/lib/projection";
import { upsertActual } from "@/server/actuals-service";
import { addTransaction, addValuation, getAccountByKind, getPortfolioSnapshot } from "@/server/asset-service";
import { lockMonth, regenerateBudgets, listBudgets } from "@/server/budget-service";
import { defaultSalarySimulations, getProjectionBundle, simulateSalaryScenarios } from "@/server/projection-service";
import { listScenarios, updateScenario } from "@/server/scenario-service";

async function hashTable(db: Db) {
  const tx = await db.select().from(assetTransactions);
  const ac = await db.select().from(monthlyActuals);
  return createHash("sha256").update(JSON.stringify({ tx, ac })).digest("hex");
}

describe("projection service (DB)", () => {
  let db: Db;
  let stockId: number;
  let tradingId: number;
  let emergencyId: number;

  beforeAll(async () => {
    db = createDb({ url: ":memory:" }).db;
    await runMigrations(db);
    await seedDatabase(db);
    await db.transaction((tx) => regenerateBudgets(tx));
    stockId = (await getAccountByKind(db, "stock"))!.id;
    tradingId = (await getAccountByKind(db, "trading"))!.id;
    emergencyId = (await getAccountByKind(db, "emergency"))!.id;

    // Realisasi Oktober 2026
    await addTransaction(db, { accountId: emergencyId, type: "deposit", tradeDate: "2026-10-25", amount: 1_000_000 });
    await addTransaction(db, { accountId: stockId, type: "deposit", tradeDate: "2026-10-25", amount: 500_000 });
    await addTransaction(db, { accountId: tradingId, type: "deposit", tradeDate: "2026-10-25", amount: 200_000 });
    await addTransaction(db, { accountId: tradingId, type: "realized_pnl", tradeDate: "2026-10-28", amount: -50_000, symbol: "XAUUSD" });
    const budgets = await listBudgets(db);
    const kebutuhan = budgets[0].items[1].categoryId;
    await upsertActual(db, { month: "2026-10", categoryId: kebutuhan, actualAmount: 2_100_000 });
    await lockMonth(db, "2026-10", "selesai");
  });

  it("bulan terkunci memakai realisasi; bulan berikutnya memakai anggaran; identitas tetap berlaku", async () => {
    const bundle = await getProjectionBundle(db);
    expect(bundle.lastActualMonth).toBe("2026-10");
    const mod = bundle.results.find((r) => r.scenario.key === "moderate")!;
    const m0 = mod.months[0];
    expect(m0.isActual).toBe(true);
    expect(m0.assets.emergency.deposit).toBe(1_000_000);
    expect(m0.assets.stock.deposit).toBe(500_000);
    expect(m0.assets.trading.deposit).toBe(200_000);
    expect(m0.assets.trading.income).toBe(-50_000);
    expect(m0.assets.trading.closing).toBe(150_000);
    expect(m0.expenses).toBe(2_100_000); // realisasi pengeluaran, bukan rencana
    expect(m0.assets.crypto.deposit).toBe(0); // tidak ada setoran aktual → tidak diasumsikan

    const m1 = mod.months[1];
    expect(m1.isActual).toBe(false);
    expect(m1.assets.crypto.deposit).toBe(500_000);
    expect(m1.assets.stock.gain).toBeGreaterThan(0);

    for (const kind of ["emergency", "stock", "crypto", "trading"] as const) {
      let prev = emptyAssetState();
      for (const m of mod.months) {
        expect(assetIdentityHolds(prev, m.assets[kind])).toBe(true);
        prev = m.assets[kind];
      }
    }
    expect(mod.months).toHaveLength(60);
  });

  it("T8 (level service): aset bersih = kas + nilai pasar; marketAdjustment menyamakan proyeksi dengan nilai pasar aktual", async () => {
    await addTransaction(db, { accountId: stockId, type: "buy", tradeDate: "2026-10-26", symbol: "BBCA", quantityE6: 40 * QTY_E6, pricePerUnit: 10_000, fee: 4_000 });
    await addValuation(db, { accountId: stockId, symbol: "BBCA", asOfDate: "2026-10-30", pricePerUnit: 11_000 });
    const snap = await getPortfolioSnapshot(db);
    const stock = snap.byKind.stock!;
    expect(stock.cash).toBe(96_000);
    expect(stock.marketValue).toBe(440_000);
    expect(stock.totalValue).toBe(536_000);
    expect(snap.netWorth.total).toBe(1_000_000 + 536_000 + 150_000);
    expect(snap.netWorth.investmentPnl).toBe(536_000 + 150_000 - 700_000); // −14.000

    const bundle = await getProjectionBundle(db);
    const mod = bundle.results.find((r) => r.scenario.key === "moderate")!;
    expect(mod.months[0].assets.stock.closing).toBe(536_000);
    expect(mod.months[0].assets.stock.gain).toBe(40_000); // laba belum terealisasi (440.000 − 400.000)
    expect(mod.months[0].assets.stock.fee).toBe(4_000); // biaya beli dicatat terpisah, tidak digabung ke gain
    expect(mod.months[0].netWorth).toBe(snap.netWorth.total);
  });

  it("T11: mengubah asumsi skenario tidak mengubah transaksi/realisasi; proyeksi berubah", async () => {
    const before = await hashTable(db);
    const base = await getProjectionBundle(db);
    const baseFinal = base.results.find((r) => r.scenario.key === "moderate")!.totals.finalNetWorth;
    await updateScenario(db, "moderate", { stockAnnualBp: 1500 }, "uji");
    expect(await hashTable(db)).toBe(before);
    const after = await getProjectionBundle(db);
    expect(after.results.find((r) => r.scenario.key === "moderate")!.totals.finalNetWorth).toBeGreaterThan(baseFinal);
    expect((await listScenarios(db)).find((s) => s.key === "moderate")?.stockAnnualBp).toBe(1500);
    // bulan aktual tidak terpengaruh asumsi
    expect(after.results[1].months[0]).toEqual(base.results[1].months[0]);
  });

  it("§11 simulasi gaji: kenaikan hanya mengubah bulan efektif ke depan; selisih dihitung", async () => {
    const specs = await defaultSalarySimulations(db);
    const moderate = (await listScenarios(db)).find((s) => s.key === "moderate")!;
    const rows = await simulateSalaryScenarios(db, specs, moderate);
    expect(rows[0].totalIncome).toBe(450_000_000);
    expect(rows[1].totalIncome).toBe(570_000_000);
    expect(rows[1].deltaIncomeVsFirst).toBe(120_000_000);
    expect(rows[1].unallocated).toBe(rows[0].unallocated + 48 * 2_500_000); // kebijakan manual
    expect(rows[2].totalIncome).toBe(450_000_000 + 48 * 2_500_000 + 33 * 2_000_000);
  });
});
