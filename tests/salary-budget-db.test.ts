import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seedDatabase } from "@/db/seed";
import { auditLogs, monthlyActuals, monthlyBudgets, salaryChanges } from "@/db/schema";
import { monthRange } from "@/lib/months";
import { getBudgetForMonth, listBudgets, lockMonth, regenerateBudgets, unlockMonth, updateCategoryRule } from "@/server/budget-service";
import { addSalaryChange, confirmSalaryChange, correctHistoricalSalary, listSalaryChanges, previewSalaryChange } from "@/server/salary-service";
import { upsertActual } from "@/server/actuals-service";

describe("salary history + monthly budgets (DB)", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb({ url: ":memory:" }).db;
    await runMigrations(db);
    await seedDatabase(db);
    await db.transaction((tx) => regenerateBudgets(tx));
  });

  it("regenerasi awal membuat 60 bulan projected dengan gaji 7,5 jt", async () => {
    const all = await listBudgets(db);
    expect(all).toHaveLength(60);
    expect(all.every((b) => b.salaryAmount === 7_500_000 && b.status === "projected")).toBe(true);
    expect(all[0].allocation.total).toBe(7_200_000);
    expect(all[0].allocation.remaining).toBe(300_000);
  });

  it("T1+T3: kunci Okt 2026–Jan 2027, tambah gaji 10 jt efektif Okt 2027 → snapshot terkunci identik, Okt 2026 tetap 7,5 jt", async () => {
    // realisasi dicatat sebelum bulan dikunci
    const kebutuhan = (await listBudgets(db))[0].items[1].categoryId;
    await upsertActual(db, { month: "2026-10", categoryId: kebutuhan, actualAmount: 1_950_000 });
    const actualsBefore = await db.select().from(monthlyActuals);

    for (const m of monthRange("2026-10", "2027-01")) await lockMonth(db, m, "Bulan selesai");
    const lockedBefore = (await listBudgets(db)).filter((b) => b.status === "locked");
    expect(lockedBefore).toHaveLength(4);

    // setelah terkunci, realisasi hanya bisa dikoreksi dengan konfirmasi + alasan
    await expect(upsertActual(db, { month: "2026-10", categoryId: kebutuhan, actualAmount: 1 })).rejects.toThrow(/terkunci/);

    const preview = await previewSalaryChange(db, { amount: 10_000_000, effectiveMonth: "2027-10" });
    expect(preview.impact.firstChangedMonth).toBe("2027-10");
    expect(preview.lockedMonthsUnaffected).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(preview.allocationBefore?.remaining).toBe(300_000);
    expect(preview.allocationAfter?.remaining).toBe(2_800_000); // kebijakan manual: kenaikan belum dialokasikan

    const newId = await addSalaryChange(db, { amount: 10_000_000, effectiveMonth: "2027-10", status: "planned", note: "Kenaikan kontrak" });

    const after = await listBudgets(db);
    const lockedAfter = after.filter((b) => b.status === "locked");
    expect(lockedAfter).toEqual(lockedBefore); // deep-equal: snapshot tidak bergeser sama sekali

    expect((await getBudgetForMonth(db, "2026-10"))?.salaryAmount).toBe(7_500_000);
    expect((await getBudgetForMonth(db, "2027-09"))?.salaryAmount).toBe(7_500_000);
    expect((await getBudgetForMonth(db, "2027-10"))?.salaryAmount).toBe(10_000_000);
    expect((await getBudgetForMonth(db, "2027-10"))?.salaryChangeId).toBe(newId);
    expect((await getBudgetForMonth(db, "2031-09"))?.salaryAmount).toBe(10_000_000);

    // baris gaji awal tidak berubah
    const first = await db.select().from(salaryChanges).where(eq(salaryChanges.id, 1));
    expect(first[0]).toMatchObject({ amount: 7_500_000, effectiveMonth: "2026-10", status: "actual" });

    // realisasi tidak tersentuh
    expect(await db.select().from(monthlyActuals)).toEqual(actualsBefore);

    // audit log tercatat
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.entity === "salary_changes" && l.action === "create")).toBe(true);
    expect(logs.filter((l) => l.action === "lock")).toHaveLength(4);
  });

  it("T6: planned belum dianggap aktual; konfirmasi mengubahnya menjadi actual tanpa menyentuh baris lain", async () => {
    const changes = await listSalaryChanges(db);
    const planned = changes.find((c) => c.status === "planned")!;
    expect(planned.amount).toBe(10_000_000);
    await confirmSalaryChange(db, planned.id);
    const after = await listSalaryChanges(db);
    expect(after.find((c) => c.id === planned.id)?.status).toBe("actual");
    expect(after.find((c) => c.id === 1)).toMatchObject({ amount: 7_500_000, status: "actual" });
  });

  it("perubahan planned baru di bulan efektif sama men-supersede yang lama", async () => {
    const a = await addSalaryChange(db, { amount: 11_000_000, effectiveMonth: "2029-01", status: "planned" });
    const b = await addSalaryChange(db, { amount: 12_000_000, effectiveMonth: "2029-01", status: "planned" });
    const rows = await db.select().from(salaryChanges);
    expect(rows.find((r) => r.id === a)).toMatchObject({ status: "superseded", supersededById: b });
    expect(rows.find((r) => r.id === b)?.status).toBe("planned");
    expect((await getBudgetForMonth(db, "2029-01"))?.salaryAmount).toBe(12_000_000);
    expect((await getBudgetForMonth(db, "2028-12"))?.salaryAmount).toBe(10_000_000);
  });

  it("menolak perubahan gaji pada bulan terkunci", async () => {
    await expect(addSalaryChange(db, { amount: 1, effectiveMonth: "2026-11", status: "actual" })).rejects.toThrow(/terkunci/);
  });

  it("koreksi historis wajib konfirmasi + alasan, dicatat di audit, bulan terkunci tetap beku", async () => {
    await expect(correctHistoricalSalary(db, 1, 7_600_000, "salah input", false)).rejects.toThrow(/konfirmasi/);
    await expect(correctHistoricalSalary(db, 1, 7_600_000, "", true)).rejects.toThrow(/Alasan/);
    const lockedBefore = (await listBudgets(db)).filter((b) => b.status === "locked");
    await correctHistoricalSalary(db, 1, 7_600_000, "Slip gaji menunjukkan 7,6 jt", true);
    const lockedAfter = (await listBudgets(db)).filter((b) => b.status === "locked");
    expect(lockedAfter).toEqual(lockedBefore);
    // bulan non-locked sebelum Okt 2027 ikut koreksi
    expect((await getBudgetForMonth(db, "2027-02"))?.salaryAmount).toBe(7_600_000);
    const logs = await db.select().from(auditLogs);
    expect(logs.some((l) => l.action === "correct_historical" && l.reason?.includes("Slip gaji"))).toBe(true);
    // kembalikan agar test lain konsisten
    await correctHistoricalSalary(db, 1, 7_500_000, "revert", true);
  });

  it("ubah aturan kategori hanya meregenerasi bulan non-locked", async () => {
    const budgets = await listBudgets(db);
    const saham = budgets[0].items.find((i) => JSON.parse(i.ruleSnapshot).priority === 60)!.categoryId;
    await updateCategoryRule(db, saham, { method: "percent", percentBp: 1_000 }, "Saham jadi 10 % gaji");
    const after = await listBudgets(db);
    const locked = after.find((b) => b.month === "2026-10")!;
    expect(locked.items.find((i) => i.categoryId === saham)?.plannedAmount).toBe(500_000); // snapshot lama
    const feb = after.find((b) => b.month === "2027-02")!;
    expect(feb.items.find((i) => i.categoryId === saham)?.plannedAmount).toBe(750_000);
    const okt27 = after.find((b) => b.month === "2027-10")!;
    expect(okt27.items.find((i) => i.categoryId === saham)?.plannedAmount).toBe(1_000_000);
  });

  it("unlock memerlukan alasan dan membuat bulan bisa diregenerasi lagi", async () => {
    await expect(unlockMonth(db, "2027-01", "")).rejects.toThrow();
    await unlockMonth(db, "2027-01", "Koreksi: data Januari salah");
    expect((await db.select().from(monthlyBudgets).where(eq(monthlyBudgets.month, "2027-01")))[0].status).toBe("planned");
    await db.transaction((tx) => regenerateBudgets(tx));
    const jan = await getBudgetForMonth(db, "2027-01");
    expect(jan?.items.some((i) => i.plannedAmount === 750_000)).toBe(true);
  });
});
