import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { budgetCategories, monthlyBudgetItems, monthlyBudgets, salaryChanges, type BudgetCategoryRow } from "@/db/schema";
import {
  applyRaisePolicy,
  computeAllocation,
  snapshotRule,
  type AllocationResult,
  type CategoryRule,
  type RaisePolicy,
} from "@/lib/allocation";
import { monthRange, type MonthKey } from "@/lib/months";
import { resolveSalary, type SalaryChange } from "@/lib/salary";
import { logAudit, type DbOrTx } from "./audit";
import { getPlanPeriod, getRaisePolicy, setSetting } from "./settings";

export function rowToRule(r: BudgetCategoryRow): CategoryRule {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    groupKey: r.groupKey,
    assetKind: r.assetKind,
    method: r.method,
    fixedAmount: r.fixedAmount,
    percentBp: r.percentBp,
    priority: r.priority,
    isActive: r.isActive,
  };
}

export function rowToSalaryChange(r: typeof salaryChanges.$inferSelect): SalaryChange {
  return {
    id: r.id,
    amount: r.amount,
    effectiveMonth: r.effectiveMonth,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
  };
}

export async function getCategoryRules(db: DbOrTx, includeInactive = true): Promise<CategoryRule[]> {
  const rows = await db.select().from(budgetCategories).orderBy(asc(budgetCategories.priority), asc(budgetCategories.id));
  return rows.filter((r) => includeInactive || r.isActive).map(rowToRule);
}

export async function getSalaryChangesRaw(db: DbOrTx): Promise<SalaryChange[]> {
  const rows = await db.select().from(salaryChanges).orderBy(asc(salaryChanges.effectiveMonth), asc(salaryChanges.createdAt), asc(salaryChanges.id));
  return rows.map(rowToSalaryChange);
}

export interface BudgetMonthView {
  id: number;
  month: MonthKey;
  salaryAmount: number;
  salaryChangeId: number | null;
  status: "projected" | "planned" | "locked";
  lockedAt: string | null;
  items: Array<{ categoryId: number; plannedAmount: number; ruleSnapshot: string }>;
  allocation: AllocationResult;
}

/**
 * Regenerasi snapshot anggaran untuk SEMUA bulan rencana yang TIDAK terkunci.
 * Bulan `locked` tidak pernah disentuh — ini jaminan utama "historical immutability".
 * Dipanggil setelah perubahan gaji atau aturan kategori. Harus dalam transaksi pemanggil.
 */
export async function regenerateBudgets(tx: DbOrTx, opts: { reason?: string } = {}): Promise<{ regenerated: MonthKey[]; skippedLocked: MonthKey[] }> {
  const { start, end } = await getPlanPeriod(tx);
  const months = monthRange(start, end);
  const rules = await getCategoryRules(tx);
  const changes = await getSalaryChangesRaw(tx);
  const existing = await tx.select().from(monthlyBudgets).where(inArray(monthlyBudgets.month, months));
  const byMonth = new Map(existing.map((b) => [b.month, b]));

  const regenerated: MonthKey[] = [];
  const skippedLocked: MonthKey[] = [];
  const nowIso = new Date().toISOString();

  for (const month of months) {
    const current = byMonth.get(month);
    if (current?.status === "locked") {
      skippedLocked.push(month);
      continue;
    }
    const salary = resolveSalary(month, changes, { includePlanned: true });
    const salaryAmount = salary?.amount ?? 0;
    const alloc = computeAllocation(salaryAmount, rules);

    let budgetId: number;
    if (current) {
      await tx
        .update(monthlyBudgets)
        .set({ salaryAmount, salaryChangeId: salary?.id ?? null, updatedAt: nowIso })
        .where(and(eq(monthlyBudgets.id, current.id), ne(monthlyBudgets.status, "locked")));
      budgetId = current.id;
      await tx.delete(monthlyBudgetItems).where(eq(monthlyBudgetItems.monthlyBudgetId, budgetId));
    } else {
      const inserted = await tx
        .insert(monthlyBudgets)
        .values({ month, salaryAmount, salaryChangeId: salary?.id ?? null, status: "projected" })
        .returning({ id: monthlyBudgets.id });
      budgetId = inserted[0].id;
    }
    if (alloc.lines.length) {
      await tx.insert(monthlyBudgetItems).values(
        alloc.lines.map((l) => {
          const rule = rules.find((r) => r.id === l.categoryId)!;
          return { monthlyBudgetId: budgetId, categoryId: l.categoryId, plannedAmount: l.amount, ruleSnapshot: JSON.stringify(snapshotRule(rule)) };
        }),
      );
    }
    regenerated.push(month);
  }
  if (opts.reason) {
    await logAudit(tx, { entity: "monthly_budgets", action: "regenerate", after: { regenerated: regenerated.length, skippedLocked }, reason: opts.reason });
  }
  return { regenerated, skippedLocked };
}

export async function listBudgets(db: DbOrTx): Promise<BudgetMonthView[]> {
  const budgets = await db.select().from(monthlyBudgets).orderBy(asc(monthlyBudgets.month));
  if (!budgets.length) return [];
  const items = await db.select().from(monthlyBudgetItems).where(inArray(monthlyBudgetItems.monthlyBudgetId, budgets.map((b) => b.id)));
  const rules = await getCategoryRules(db);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  return budgets.map((b) => {
    const its = items.filter((i) => i.monthlyBudgetId === b.id);
    // Alokasi dibangun dari SNAPSHOT item (bukan aturan terbaru) agar bulan terkunci tidak bergeser.
    const snapshotRules: CategoryRule[] = its.map((i) => {
      const base = ruleById.get(i.categoryId);
      const snap = JSON.parse(i.ruleSnapshot) as ReturnType<typeof snapshotRule>;
      return {
        id: i.categoryId,
        name: base?.name ?? `Kategori ${i.categoryId}`,
        slug: base?.slug ?? `kategori-${i.categoryId}`,
        groupKey: base?.groupKey ?? "fleksibel",
        assetKind: base?.assetKind ?? null,
        method: "fixed",
        fixedAmount: i.plannedAmount,
        percentBp: 0,
        priority: snap.priority,
        isActive: true,
      };
    });
    const allocation = computeAllocation(b.salaryAmount, snapshotRules);
    return {
      id: b.id,
      month: b.month,
      salaryAmount: b.salaryAmount,
      salaryChangeId: b.salaryChangeId,
      status: b.status,
      lockedAt: b.lockedAt,
      items: its.map((i) => ({ categoryId: i.categoryId, plannedAmount: i.plannedAmount, ruleSnapshot: i.ruleSnapshot })),
      allocation,
    };
  });
}

export async function getBudgetForMonth(db: DbOrTx, month: MonthKey): Promise<BudgetMonthView | null> {
  const all = await listBudgets(db);
  return all.find((b) => b.month === month) ?? null;
}

export async function lockMonth(db: Db, month: MonthKey, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(monthlyBudgets).where(eq(monthlyBudgets.month, month)).limit(1);
    if (!rows.length) throw new Error(`Anggaran bulan ${month} belum ada.`);
    const before = rows[0];
    if (before.status === "locked") return;
    const lockedAt = new Date().toISOString();
    await tx.update(monthlyBudgets).set({ status: "locked", lockedAt, updatedAt: lockedAt }).where(eq(monthlyBudgets.id, before.id));
    await logAudit(tx, { entity: "monthly_budgets", entityId: before.id, action: "lock", before: { status: before.status }, after: { status: "locked", month }, reason: reason ?? null });
  });
}

/** Membuka kunci = koreksi historis. Wajib alasan; dicatat di audit log. */
export async function unlockMonth(db: Db, month: MonthKey, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Alasan koreksi wajib diisi.");
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(monthlyBudgets).where(eq(monthlyBudgets.month, month)).limit(1);
    if (!rows.length) throw new Error(`Anggaran bulan ${month} belum ada.`);
    const before = rows[0];
    await tx.update(monthlyBudgets).set({ status: "planned", lockedAt: null, updatedAt: new Date().toISOString() }).where(eq(monthlyBudgets.id, before.id));
    await logAudit(tx, { entity: "monthly_budgets", entityId: before.id, action: "unlock", before: { status: before.status, lockedAt: before.lockedAt }, after: { status: "planned", month }, reason });
  });
}

export interface CategoryRulePatch {
  name?: string;
  groupKey?: CategoryRule["groupKey"];
  assetKind?: CategoryRule["assetKind"];
  method?: CategoryRule["method"];
  fixedAmount?: number;
  percentBp?: number;
  priority?: number;
  isActive?: boolean;
}

export async function updateCategoryRule(db: Db, id: number, patch: CategoryRulePatch, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(budgetCategories).where(eq(budgetCategories.id, id)).limit(1);
    if (!rows.length) throw new Error("Kategori tidak ditemukan.");
    const before = rowToRule(rows[0]);
    await tx.update(budgetCategories).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(budgetCategories.id, id));
    const afterRows = await tx.select().from(budgetCategories).where(eq(budgetCategories.id, id)).limit(1);
    await logAudit(tx, { entity: "budget_categories", entityId: id, action: "update", before, after: rowToRule(afterRows[0]), reason: reason ?? null });
    await regenerateBudgets(tx);
  });
}

export async function createCategory(db: Db, input: Omit<CategoryRule, "id">): Promise<number> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(budgetCategories).values(input).returning({ id: budgetCategories.id });
    await logAudit(tx, { entity: "budget_categories", entityId: inserted[0].id, action: "create", after: input });
    await regenerateBudgets(tx);
    return inserted[0].id;
  });
}

export async function setRaisePolicy(db: Db, policy: RaisePolicy): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await getRaisePolicy(tx);
    await setSetting(tx, "raise_policy", policy);
    await logAudit(tx, { entity: "settings", entityId: "raise_policy", action: "update", before, after: policy });
  });
}

/**
 * Terapkan kebijakan kenaikan gaji ke aturan kategori `fixed` (mengubah aturan, lalu regenerasi
 * bulan non-locked). Dipanggil secara eksplisit oleh pengguna dari halaman gaji — tidak otomatis.
 */
export async function applyRaisePolicyToRules(db: Db, oldSalary: number, newSalary: number, policy: RaisePolicy, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rules = await getCategoryRules(tx);
    const next = applyRaisePolicy(rules, oldSalary, newSalary, policy);
    const nowIso = new Date().toISOString();
    for (let i = 0; i < rules.length; i++) {
      if (rules[i].fixedAmount !== next[i].fixedAmount) {
        await tx.update(budgetCategories).set({ fixedAmount: next[i].fixedAmount, updatedAt: nowIso }).where(eq(budgetCategories.id, rules[i].id));
      }
    }
    await logAudit(tx, {
      entity: "budget_categories",
      action: "apply_raise_policy",
      before: rules.map((r) => ({ id: r.id, fixedAmount: r.fixedAmount })),
      after: next.map((r) => ({ id: r.id, fixedAmount: r.fixedAmount })),
      reason: reason ?? `Kebijakan ${policy}: ${oldSalary} → ${newSalary}`,
    });
    await regenerateBudgets(tx);
  });
}
