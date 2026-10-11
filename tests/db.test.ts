import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { assetAccounts, budgetCategories, projectionScenarios, salaryChanges, settings, watchlistStocks } from "@/db/schema";

describe("database: migrasi + seed (libSQL in-memory)", () => {
  let db: Db;

  beforeAll(async () => {
    const created = createDb({ url: ":memory:" });
    db = created.db;
    await runMigrations(db);
  });

  it("seed memasukkan data awal spec dan idempoten", async () => {
    expect((await seedDatabase(db)).seeded).toBe(true);
    expect((await seedDatabase(db)).seeded).toBe(false);

    const [{ n: cats }] = await db.select({ n: count() }).from(budgetCategories);
    expect(cats).toBe(9);
    const [{ n: accounts }] = await db.select({ n: count() }).from(assetAccounts);
    expect(accounts).toBe(6);
    const [{ n: scenarios }] = await db.select({ n: count() }).from(projectionScenarios);
    expect(scenarios).toBe(3);
    const [{ n: watch }] = await db.select({ n: count() }).from(watchlistStocks);
    expect(watch).toBe(5);

    const salaries = await db.select().from(salaryChanges);
    expect(salaries).toHaveLength(1);
    expect(salaries[0]).toMatchObject({ amount: 7_500_000, effectiveMonth: "2026-10", status: "actual" });

    const policy = await db.select().from(settings).where(eq(settings.key, "raise_policy"));
    expect(JSON.parse(policy[0].valueJson)).toBe("manual");
  });

  it("uang tersimpan sebagai integer (tidak ada REAL)", async () => {
    const rows = await db.select().from(budgetCategories);
    for (const r of rows) {
      expect(Number.isInteger(r.fixedAmount)).toBe(true);
      expect(Number.isInteger(r.percentBp)).toBe(true);
    }
    const total = rows.reduce((s, r) => s + r.fixedAmount, 0);
    expect(total).toBe(7_200_000);
  });
});
