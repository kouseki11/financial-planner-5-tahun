import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { monthlyBudgets, salaryChanges } from "@/db/schema";
import { computeAllocation, type AllocationResult } from "@/lib/allocation";
import { monthRange, type MonthKey } from "@/lib/months";
import { resolveSalary, salaryImpact, withProposedChange, type SalaryChange } from "@/lib/salary";
import { logAudit } from "./audit";
import { getCategoryRules, getSalaryChangesRaw, regenerateBudgets } from "./budget-service";
import { getPlanPeriod } from "./settings";

export interface SalaryChangeInput {
  amount: number;
  effectiveMonth: MonthKey;
  note?: string | null;
  status: "planned" | "actual";
}

export async function listSalaryChanges(db: Db): Promise<SalaryChange[]> {
  return getSalaryChangesRaw(db);
}

/**
 * Tambah perubahan gaji. Dalam satu transaksi:
 * 1. Tolak jika bulan efektif sudah terkunci (historis) — koreksi historis lewat jalur terpisah.
 * 2. Perubahan `planned` lama pada bulan efektif yang sama → superseded.
 * 3. Insert baris baru. Baris `actual` lama TIDAK pernah diubah.
 * 4. Audit log, lalu regenerasi anggaran non-locked.
 */
export async function addSalaryChange(db: Db, input: SalaryChangeInput): Promise<number> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: monthlyBudgets.id })
      .from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.month, input.effectiveMonth), eq(monthlyBudgets.status, "locked")))
      .limit(1);
    if (locked.length) {
      throw new Error(`Bulan ${input.effectiveMonth} sudah terkunci. Gunakan koreksi historis (dengan konfirmasi) bila memang perlu.`);
    }

    const inserted = await tx
      .insert(salaryChanges)
      .values({ amount: input.amount, effectiveMonth: input.effectiveMonth, note: input.note ?? null, status: input.status })
      .returning({ id: salaryChanges.id });
    const newId = inserted[0].id;

    const samePlanned = await tx
      .select()
      .from(salaryChanges)
      .where(and(eq(salaryChanges.effectiveMonth, input.effectiveMonth), eq(salaryChanges.status, "planned")));
    for (const old of samePlanned) {
      if (old.id === newId) continue;
      await tx.update(salaryChanges).set({ status: "superseded", supersededById: newId }).where(eq(salaryChanges.id, old.id));
      await logAudit(tx, { entity: "salary_changes", entityId: old.id, action: "supersede", before: { status: "planned" }, after: { status: "superseded", supersededById: newId } });
    }

    await logAudit(tx, { entity: "salary_changes", entityId: newId, action: "create", after: input });
    await regenerateBudgets(tx);
    return newId;
  });
}

export async function confirmSalaryChange(db: Db, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(salaryChanges).where(eq(salaryChanges.id, id)).limit(1);
    if (!rows.length) throw new Error("Perubahan gaji tidak ditemukan.");
    if (rows[0].status !== "planned") throw new Error("Hanya perubahan berstatus planned yang bisa dikonfirmasi.");
    await tx.update(salaryChanges).set({ status: "actual" }).where(eq(salaryChanges.id, id));
    await logAudit(tx, { entity: "salary_changes", entityId: id, action: "confirm", before: { status: "planned" }, after: { status: "actual" } });
  });
}

export async function supersedeSalaryChange(db: Db, id: number, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(salaryChanges).where(eq(salaryChanges.id, id)).limit(1);
    if (!rows.length) throw new Error("Perubahan gaji tidak ditemukan.");
    if (rows[0].status === "actual") throw new Error("Perubahan aktual tidak bisa dibatalkan; gunakan koreksi historis.");
    await tx.update(salaryChanges).set({ status: "superseded" }).where(eq(salaryChanges.id, id));
    await logAudit(tx, { entity: "salary_changes", entityId: id, action: "supersede", before: { status: rows[0].status }, after: { status: "superseded" }, reason: reason ?? null });
    await regenerateBudgets(tx);
  });
}

/**
 * Koreksi gaji historis (jalur khusus): mengubah nominal baris `actual`.
 * Memerlukan `confirmed = true` dan alasan. Bulan terkunci TIDAK dihitung ulang — hanya baris
 * gaji dan audit log yang berubah; pengguna harus membuka kunci bulan secara eksplisit bila ingin regenerasi.
 */
export async function correctHistoricalSalary(db: Db, id: number, newAmount: number, reason: string, confirmed: boolean): Promise<void> {
  if (!confirmed) throw new Error("Koreksi historis memerlukan konfirmasi eksplisit.");
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi.");
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(salaryChanges).where(eq(salaryChanges.id, id)).limit(1);
    if (!rows.length) throw new Error("Perubahan gaji tidak ditemukan.");
    const before = rows[0];
    await tx.update(salaryChanges).set({ amount: newAmount }).where(eq(salaryChanges.id, id));
    await logAudit(tx, { entity: "salary_changes", entityId: id, action: "correct_historical", before: { amount: before.amount }, after: { amount: newAmount }, reason });
    await regenerateBudgets(tx, { reason: `Koreksi historis gaji #${id}` });
  });
}

export interface SalaryPreview {
  impact: ReturnType<typeof salaryImpact>;
  allocationBefore: AllocationResult | null;
  allocationAfter: AllocationResult | null;
  lockedMonthsUnaffected: MonthKey[];
}

/** Preview dampak sebelum simpan: per bulan sebelum/sesudah + alokasi pada bulan efektif. */
export async function previewSalaryChange(db: Db, proposal: { amount: number; effectiveMonth: MonthKey; note?: string | null }): Promise<SalaryPreview> {
  const { start, end } = await getPlanPeriod(db);
  const months = monthRange(start, end);
  const current = await getSalaryChangesRaw(db);
  const proposed = withProposedChange(current, proposal);
  const impact = salaryImpact(months, current, proposed);
  const rules = await getCategoryRules(db);
  const before = resolveSalary(proposal.effectiveMonth, current);
  const after = resolveSalary(proposal.effectiveMonth, proposed);
  const lockedRows = await db.select({ month: monthlyBudgets.month }).from(monthlyBudgets).where(eq(monthlyBudgets.status, "locked"));
  return {
    impact,
    allocationBefore: before ? computeAllocation(before.amount, rules) : null,
    allocationAfter: after ? computeAllocation(after.amount, rules) : null,
    lockedMonthsUnaffected: lockedRows.map((r) => r.month).sort(),
  };
}
