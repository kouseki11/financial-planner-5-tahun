import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { monthlyActuals, monthlyBudgets } from "@/db/schema";
import type { MonthKey } from "@/lib/months";
import { logAudit, type DbOrTx } from "./audit";
import { getCategoryRules, listBudgets } from "./budget-service";

export interface ActualInput {
  month: MonthKey;
  categoryId: number;
  actualAmount: number;
  note?: string | null;
  /** Wajib true bila bulan sudah terkunci (koreksi historis). */
  confirmHistorical?: boolean;
  reason?: string | null;
}

/**
 * Simpan/ubah realisasi satu kategori pada satu bulan.
 * Bulan terkunci → butuh confirmHistorical + alasan, dicatat di audit log.
 * Tidak pernah dipanggil oleh proses perubahan gaji/aturan.
 */
export async function upsertActual(db: Db, input: ActualInput): Promise<void> {
  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: monthlyBudgets.id })
      .from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.month, input.month), eq(monthlyBudgets.status, "locked")))
      .limit(1);
    if (locked.length && !input.confirmHistorical) {
      throw new Error(`Bulan ${input.month} sudah terkunci. Konfirmasi koreksi historis diperlukan.`);
    }
    if (locked.length && !(input.reason ?? "").trim()) {
      throw new Error("Alasan koreksi historis wajib diisi.");
    }
    const existing = await tx
      .select()
      .from(monthlyActuals)
      .where(and(eq(monthlyActuals.month, input.month), eq(monthlyActuals.categoryId, input.categoryId)))
      .limit(1);
    const nowIso = new Date().toISOString();
    if (existing.length) {
      await tx
        .update(monthlyActuals)
        .set({ actualAmount: input.actualAmount, note: input.note ?? null, updatedAt: nowIso })
        .where(eq(monthlyActuals.id, existing[0].id));
      await logAudit(tx, {
        entity: "monthly_actuals",
        entityId: existing[0].id,
        action: locked.length ? "correct_historical" : "update",
        before: { actualAmount: existing[0].actualAmount },
        after: { actualAmount: input.actualAmount, month: input.month, categoryId: input.categoryId },
        reason: input.reason ?? null,
      });
    } else {
      const ins = await tx
        .insert(monthlyActuals)
        .values({ month: input.month, categoryId: input.categoryId, actualAmount: input.actualAmount, note: input.note ?? null })
        .returning({ id: monthlyActuals.id });
      await logAudit(tx, {
        entity: "monthly_actuals",
        entityId: ins[0].id,
        action: locked.length ? "correct_historical" : "create",
        after: { actualAmount: input.actualAmount, month: input.month, categoryId: input.categoryId },
        reason: input.reason ?? null,
      });
    }
  });
}

export async function deleteActual(db: Db, id: number, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(monthlyActuals).where(eq(monthlyActuals.id, id)).limit(1);
    if (!rows.length) return;
    await tx.delete(monthlyActuals).where(eq(monthlyActuals.id, id));
    await logAudit(tx, { entity: "monthly_actuals", entityId: id, action: "delete", before: rows[0], reason: reason ?? null });
  });
}

export async function listActuals(db: DbOrTx, month?: MonthKey) {
  const q = db.select().from(monthlyActuals);
  const rows = month ? await q.where(eq(monthlyActuals.month, month)) : await q.orderBy(asc(monthlyActuals.month));
  return rows;
}

export interface PlanVsActualLine {
  categoryId: number;
  name: string;
  groupKey: string;
  assetKind: string | null;
  planned: number;
  actual: number | null;
  variance: number | null;
}

export interface PlanVsActualMonth {
  month: MonthKey;
  status: "projected" | "planned" | "locked";
  salary: number;
  lines: PlanVsActualLine[];
  plannedTotal: number;
  actualTotal: number;
  hasActuals: boolean;
  /** Realisasi pengeluaran (non-aset) saja. */
  actualExpenses: number;
  plannedExpenses: number;
}

/** Rencana vs realisasi per bulan per kategori. */
export async function planVsActual(db: DbOrTx): Promise<PlanVsActualMonth[]> {
  const budgets = await listBudgets(db);
  const actuals = await listActuals(db);
  const rules = await getCategoryRules(db);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  return budgets.map((b) => {
    const monthActuals = actuals.filter((a) => a.month === b.month);
    const lines: PlanVsActualLine[] = b.items.map((i) => {
      const r = ruleById.get(i.categoryId);
      const a = monthActuals.find((x) => x.categoryId === i.categoryId);
      return {
        categoryId: i.categoryId,
        name: r?.name ?? `Kategori ${i.categoryId}`,
        groupKey: r?.groupKey ?? "fleksibel",
        assetKind: r?.assetKind ?? null,
        planned: i.plannedAmount,
        actual: a?.actualAmount ?? null,
        variance: a ? a.actualAmount - i.plannedAmount : null,
      };
    });
    // realisasi untuk kategori yang tidak ada di anggaran bulan itu
    for (const a of monthActuals) {
      if (!lines.some((l) => l.categoryId === a.categoryId)) {
        const r = ruleById.get(a.categoryId);
        lines.push({ categoryId: a.categoryId, name: r?.name ?? `Kategori ${a.categoryId}`, groupKey: r?.groupKey ?? "fleksibel", assetKind: r?.assetKind ?? null, planned: 0, actual: a.actualAmount, variance: a.actualAmount });
      }
    }
    const plannedTotal = lines.reduce((s, l) => s + l.planned, 0);
    const actualTotal = lines.reduce((s, l) => s + (l.actual ?? 0), 0);
    return {
      month: b.month,
      status: b.status,
      salary: b.salaryAmount,
      lines,
      plannedTotal,
      actualTotal,
      hasActuals: monthActuals.length > 0,
      actualExpenses: lines.filter((l) => !l.assetKind).reduce((s, l) => s + (l.actual ?? 0), 0),
      plannedExpenses: lines.filter((l) => !l.assetKind).reduce((s, l) => s + l.planned, 0),
    };
  });
}
