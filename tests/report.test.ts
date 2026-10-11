import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { parseCsv, toCsv } from "@/lib/csv";
import { upsertActual } from "@/server/actuals-service";
import { addTransaction, getAccountByKind } from "@/server/asset-service";
import { listBudgets, regenerateBudgets } from "@/server/budget-service";
import { exportBackup, exportCsv, monthlyReport, MONTHLY_COLUMNS, restoreBackup, yearlyReport } from "@/server/report-service";

describe("laporan, ekspor, backup", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb({ url: ":memory:" }).db;
    await runMigrations(db);
    await seedDatabase(db);
    await db.transaction((tx) => regenerateBudgets(tx));
    const cat = (await listBudgets(db))[0].items[0].categoryId;
    await upsertActual(db, { month: "2026-10", categoryId: cat, actualAmount: 2_000_000 });
    const em = (await getAccountByKind(db, "emergency"))!;
    await addTransaction(db, { accountId: em.id, type: "deposit", tradeDate: "2026-10-25", amount: 1_000_000 });
  });

  it("csv: escape & parse round-trip", () => {
    const rows = [{ a: 'x,"y"', b: 12, c: null }];
    const csv = toCsv(rows, [{ key: "a", header: "A" }, { key: "b", header: "B" }, { key: "c", header: "C" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    const parsed = parseCsv(csv);
    expect(parsed).toEqual([{ A: 'x,"y"', B: "12", C: "" }]);
  });

  it("T10: ekspor CSV bulanan sama dengan data laporan yang ditampilkan", async () => {
    const rows = await monthlyReport(db);
    const { csv, filename } = await exportCsv(db, "bulanan");
    expect(filename).toBe("laporan-bulanan.csv");
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(rows.length);
    expect(parsed).toHaveLength(60);
    for (let i = 0; i < rows.length; i++) {
      for (const c of MONTHLY_COLUMNS) {
        const v = rows[i][c.key];
        expect(parsed[i][c.header]).toBe(v === null ? "" : String(v));
      }
    }
    expect(parsed[0].realisasi_pengeluaran).toBe("2000000");
    expect(parsed[0].realisasi_setoran).toBe("1000000");
    expect(parsed[1].realisasi_pengeluaran).toBe("");
  });

  it("laporan tahunan: 5 tahun, total pendapatan = 60 × 7,5 jt", async () => {
    const yearly = yearlyReport(await monthlyReport(db), "2026-10");
    expect(yearly).toHaveLength(5);
    expect(yearly.reduce((s, y) => s + y.income, 0)).toBe(450_000_000);
    expect(yearly[0].label).toContain("Okt 2026");
    expect(yearly[0].monthsWithActuals).toBe(1);
  });

  it("backup → restore memulihkan data identik; tanpa konfirmasi ditolak", async () => {
    const backup = await exportBackup(db);
    expect(backup.version).toBe(1);
    expect(backup.tables.monthly_budgets).toHaveLength(60);
    await expect(restoreBackup(db, backup, false)).rejects.toThrow(/konfirmasi/);
    await expect(restoreBackup(db, { version: 1, exportedAt: "x", tables: { tabel_asing: [] } }, true)).rejects.toThrow(/tidak dikenal/);

    const fresh = createDb({ url: ":memory:" }).db;
    await runMigrations(fresh);
    await restoreBackup(fresh, backup, true);
    const again = await exportBackup(fresh);
    for (const t of Object.keys(backup.tables)) {
      if (t === "audit_logs") continue; // restore menambah 1 log
      expect(again.tables[t]).toEqual(backup.tables[t]);
    }
    expect(again.tables.audit_logs.length).toBe(backup.tables.audit_logs.length + 1);
  });
});
