import { config } from "dotenv";
import { count } from "drizzle-orm";
import { DEFAULT_SCENARIOS } from "@/lib/projection";
import { PLAN_END, PLAN_START } from "@/lib/months";
import { createDb, resolveDbConfig, type Db } from "./client";
import { assetAccounts, budgetCategories, projectionScenarios, salaryChanges, settings, watchlistStocks } from "./schema";

/**
 * Data awal dari spec §3. Semua nilai dapat diubah lewat UI.
 * Catatan: jumlah nominal tabel spec = Rp7.200.000 (bukan Rp7.500.000). Sisa Rp300.000
 * ditampilkan aplikasi sebagai "belum dialokasikan" — tidak diubah diam-diam.
 */
export const SEED_CATEGORIES = [
  { name: "Bantuan orang tua", slug: "bantuan-orang-tua", groupKey: "wajib", assetKind: null, fixedAmount: 2_000_000, priority: 10 },
  { name: "Kebutuhan pribadi", slug: "kebutuhan-pribadi", groupKey: "wajib", assetKind: null, fixedAmount: 2_000_000, priority: 20 },
  { name: "Dana darurat", slug: "dana-darurat", groupKey: "dana_darurat", assetKind: "emergency", fixedAmount: 1_000_000, priority: 30 },
  { name: "Tabungan nikah", slug: "tabungan-nikah", groupKey: "tabungan", assetKind: "savings_wedding", fixedAmount: 200_000, priority: 40 },
  { name: "Tabungan pribadi", slug: "tabungan-pribadi", groupKey: "tabungan", assetKind: "savings_personal", fixedAmount: 300_000, priority: 50 },
  { name: "Saham", slug: "saham", groupKey: "investasi", assetKind: "stock", fixedAmount: 500_000, priority: 60 },
  { name: "Crypto SOL", slug: "crypto-sol", groupKey: "investasi", assetKind: "crypto", fixedAmount: 500_000, priority: 70 },
  { name: "Modal trading XAUUSD", slug: "trading-xauusd", groupKey: "investasi", assetKind: "trading", fixedAmount: 200_000, priority: 80 },
  { name: "Pacar", slug: "pacar", groupKey: "fleksibel", assetKind: null, fixedAmount: 500_000, priority: 90 },
] as const;

export const SEED_ACCOUNTS = [
  { kind: "emergency", name: "Dana darurat", targetMonthsOfExpenses: 6 },
  { kind: "savings_personal", name: "Tabungan pribadi", targetAmount: 20_000_000 },
  { kind: "savings_wedding", name: "Tabungan nikah", targetAmount: 50_000_000 },
  { kind: "stock", name: "Saham" },
  { kind: "crypto", name: "Crypto SOL" },
  { kind: "trading", name: "Trading XAUUSD", lossLimitBp: 5000 },
] as const;

export const SEED_WATCHLIST = [
  { symbol: "BBCA", name: "Bank Central Asia" },
  { symbol: "BBRI", name: "Bank Rakyat Indonesia" },
  { symbol: "BMRI", name: "Bank Mandiri" },
  { symbol: "TLKM", name: "Telkom Indonesia" },
  { symbol: "ASII", name: "Astra International" },
];

export async function seedDatabase(db: Db): Promise<{ seeded: boolean }> {
  const [{ n }] = await db.select({ n: count() }).from(budgetCategories);
  if (n > 0) return { seeded: false };

  await db.transaction(async (tx) => {
    await tx.insert(salaryChanges).values({
      amount: 7_500_000,
      effectiveMonth: PLAN_START,
      status: "actual",
      note: "Gaji awal (data awal spec)",
    });

    await tx.insert(budgetCategories).values(
      SEED_CATEGORIES.map((c) => ({
        name: c.name,
        slug: c.slug,
        groupKey: c.groupKey,
        assetKind: c.assetKind,
        method: "fixed" as const,
        fixedAmount: c.fixedAmount,
        percentBp: 0,
        priority: c.priority,
        isActive: true,
      })),
    );

    await tx.insert(assetAccounts).values(
      SEED_ACCOUNTS.map((a) => ({
        kind: a.kind,
        name: a.name,
        openingBalance: 0,
        targetAmount: "targetAmount" in a ? a.targetAmount : null,
        targetMonthsOfExpenses: "targetMonthsOfExpenses" in a ? a.targetMonthsOfExpenses : null,
        lossLimitBp: "lossLimitBp" in a ? a.lossLimitBp : null,
      })),
    );

    await tx.insert(projectionScenarios).values(
      DEFAULT_SCENARIOS.map((s) => ({
        key: s.key,
        name: s.name,
        stockAnnualBp: s.stockAnnualBp,
        cryptoAnnualBp: s.cryptoAnnualBp,
        tradingAnnualBp: s.tradingAnnualBp,
        cashAnnualBp: s.cashAnnualBp,
        inflationAnnualBp: s.inflationAnnualBp,
        tradingProjectionEnabled: s.tradingProjectionEnabled,
        tradingMaxLossBp: s.tradingMaxLossBp,
        description: s.description,
      })),
    );

    await tx.insert(watchlistStocks).values(SEED_WATCHLIST);

    await tx.insert(settings).values([
      { key: "plan_start", valueJson: JSON.stringify(PLAN_START) },
      { key: "plan_end", valueJson: JSON.stringify(PLAN_END) },
      { key: "raise_policy", valueJson: JSON.stringify("manual") },
    ]);
  });

  return { seeded: true };
}

async function main() {
  config({ path: ".env.local" });
  config();
  const cfg = resolveDbConfig();
  const { db, client } = createDb(cfg);
  const r = await seedDatabase(db);
  console.log(r.seeded ? "Seed selesai." : "Database sudah berisi data; seed dilewati.");
  client.close();
}

if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
