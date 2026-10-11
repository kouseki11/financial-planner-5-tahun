import { z } from "zod";
import type { Db } from "@/db/client";
import {
  assetAccounts,
  assetTransactions,
  assetValuations,
  auditLogs,
  budgetCategories,
  financialGoals,
  monthlyActuals,
  monthlyBudgetItems,
  monthlyBudgets,
  projectionScenarios,
  salaryChanges,
  settings,
  watchlistStocks,
} from "@/db/schema";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { formatMonthLabel, formatMonthShort, planYearIndex, type MonthKey } from "@/lib/months";
import { planVsActual } from "./actuals-service";
import { getPortfolioSnapshot } from "./asset-service";
import { logAudit, type DbOrTx } from "./audit";
import { getSalaryChangesRaw } from "./budget-service";
import { getPlanPeriod } from "./settings";

export interface MonthlyReportRow extends Record<string, string | number | null> {
  month: MonthKey;
  label: string;
  status: string;
  salary: number;
  plannedExpenses: number;
  actualExpenses: number | null;
  plannedContributions: number;
  actualDeposits: number | null;
  plannedTotal: number;
  remaining: number;
  deficit: number;
}

export async function monthlyReport(db: DbOrTx): Promise<MonthlyReportRow[]> {
  const pva = await planVsActual(db);
  const portfolio = await getPortfolioSnapshot(db);
  const depositsByMonth = new Map<MonthKey, number>();
  for (const t of portfolio.transactions) {
    if (t.type === "deposit") depositsByMonth.set(t.month, (depositsByMonth.get(t.month) ?? 0) + Math.abs(t.amount));
  }
  return pva.map((m) => {
    const plannedContributions = m.lines.filter((l) => l.assetKind).reduce((s, l) => s + l.planned, 0);
    const hasDeposits = depositsByMonth.has(m.month);
    return {
      month: m.month,
      label: formatMonthLabel(m.month),
      status: m.status,
      salary: m.salary,
      plannedExpenses: m.plannedExpenses,
      actualExpenses: m.hasActuals ? m.actualExpenses : null,
      plannedContributions,
      actualDeposits: hasDeposits ? (depositsByMonth.get(m.month) ?? 0) : null,
      plannedTotal: m.plannedTotal,
      remaining: Math.max(m.salary - m.plannedTotal, 0),
      deficit: Math.max(m.plannedTotal - m.salary, 0),
    };
  });
}

export interface YearlyReportRow extends Record<string, string | number | null> {
  year: number;
  label: string;
  income: number;
  plannedExpenses: number;
  actualExpenses: number;
  plannedContributions: number;
  actualDeposits: number;
  monthsWithActuals: number;
}

export function yearlyReport(rows: readonly MonthlyReportRow[], start: MonthKey): YearlyReportRow[] {
  const byYear = new Map<number, YearlyReportRow>();
  for (const r of rows) {
    const y = planYearIndex(r.month, start);
    let acc = byYear.get(y);
    if (!acc) {
      acc = { year: y, label: `Tahun ${y}`, income: 0, plannedExpenses: 0, actualExpenses: 0, plannedContributions: 0, actualDeposits: 0, monthsWithActuals: 0 };
      byYear.set(y, acc);
    }
    acc.income += r.salary;
    acc.plannedExpenses += r.plannedExpenses;
    acc.actualExpenses += r.actualExpenses ?? 0;
    acc.plannedContributions += r.plannedContributions;
    acc.actualDeposits += r.actualDeposits ?? 0;
    if (r.actualExpenses !== null) acc.monthsWithActuals += 1;
  }
  const out = [...byYear.values()].sort((a, b) => a.year - b.year);
  for (const y of out) {
    const months = rows.filter((r) => planYearIndex(r.month, start) === y.year);
    y.label = `Tahun ${y.year} (${formatMonthShort(months[0].month)} – ${formatMonthShort(months[months.length - 1].month)})`;
  }
  return out;
}

export const MONTHLY_COLUMNS: CsvColumn<MonthlyReportRow>[] = [
  { key: "month", header: "bulan" },
  { key: "label", header: "label" },
  { key: "status", header: "status" },
  { key: "salary", header: "gaji" },
  { key: "plannedExpenses", header: "rencana_pengeluaran" },
  { key: "actualExpenses", header: "realisasi_pengeluaran" },
  { key: "plannedContributions", header: "rencana_setoran" },
  { key: "actualDeposits", header: "realisasi_setoran" },
  { key: "plannedTotal", header: "total_alokasi" },
  { key: "remaining", header: "sisa" },
  { key: "deficit", header: "defisit" },
];

export const YEARLY_COLUMNS: CsvColumn<YearlyReportRow>[] = [
  { key: "year", header: "tahun_ke" },
  { key: "label", header: "label" },
  { key: "income", header: "pendapatan" },
  { key: "plannedExpenses", header: "rencana_pengeluaran" },
  { key: "actualExpenses", header: "realisasi_pengeluaran" },
  { key: "plannedContributions", header: "rencana_setoran" },
  { key: "actualDeposits", header: "realisasi_setoran" },
  { key: "monthsWithActuals", header: "bulan_dengan_realisasi" },
];

export interface SalaryHistoryRow extends Record<string, string | number | null> {
  id: number;
  effectiveMonth: string;
  label: string;
  amount: number;
  status: string;
  note: string | null;
  createdAt: string;
}

export async function salaryHistoryReport(db: DbOrTx): Promise<SalaryHistoryRow[]> {
  const rows = await getSalaryChangesRaw(db);
  return rows.map((r) => ({ id: r.id, effectiveMonth: r.effectiveMonth, label: formatMonthLabel(r.effectiveMonth), amount: r.amount, status: r.status, note: r.note ?? null, createdAt: r.createdAt }));
}

export const SALARY_COLUMNS: CsvColumn<SalaryHistoryRow>[] = [
  { key: "id", header: "id" },
  { key: "effectiveMonth", header: "bulan_efektif" },
  { key: "label", header: "label" },
  { key: "amount", header: "gaji" },
  { key: "status", header: "status" },
  { key: "note", header: "catatan" },
  { key: "createdAt", header: "dibuat" },
];

export interface AssetPerformanceRow extends Record<string, string | number | null> {
  kind: string;
  name: string;
  openingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  cash: number;
  marketValue: number;
  totalValue: number;
  totalReturn: number;
  returnOnDepositsBp: number | null;
  totalDividends: number;
  totalFees: number;
  totalRealizedPnl: number;
  unrealizedPnl: number;
  maxDrawdown: number;
}

export async function assetPerformanceReport(db: DbOrTx): Promise<AssetPerformanceRow[]> {
  const snap = await getPortfolioSnapshot(db);
  return snap.summaries.map((s) => {
    const acc = snap.accounts.find((a) => a.id === s.accountId)!;
    return {
      kind: s.kind,
      name: acc.name,
      openingBalance: s.openingBalance,
      totalDeposits: s.totalDeposits,
      totalWithdrawals: s.totalWithdrawals,
      cash: s.cash,
      marketValue: s.marketValue,
      totalValue: s.totalValue,
      totalReturn: s.totalReturn,
      returnOnDepositsBp: s.returnOnDepositsBp,
      totalDividends: s.totalDividends,
      totalFees: s.totalFees,
      totalRealizedPnl: s.totalRealizedPnl,
      unrealizedPnl: s.unrealizedPnl,
      maxDrawdown: s.maxDrawdown,
    };
  });
}

export const ASSET_COLUMNS: CsvColumn<AssetPerformanceRow>[] = [
  { key: "kind", header: "jenis" },
  { key: "name", header: "nama" },
  { key: "openingBalance", header: "saldo_awal" },
  { key: "totalDeposits", header: "total_setoran" },
  { key: "totalWithdrawals", header: "total_penarikan" },
  { key: "cash", header: "kas" },
  { key: "marketValue", header: "nilai_pasar" },
  { key: "totalValue", header: "nilai_total" },
  { key: "totalReturn", header: "total_return" },
  { key: "returnOnDepositsBp", header: "return_bp" },
  { key: "totalDividends", header: "dividen" },
  { key: "totalFees", header: "biaya" },
  { key: "totalRealizedPnl", header: "pnl_terealisasi" },
  { key: "unrealizedPnl", header: "pnl_belum_terealisasi" },
  { key: "maxDrawdown", header: "max_drawdown" },
];

export type ExportType = "bulanan" | "tahunan" | "gaji" | "aset";

export async function exportCsv(db: DbOrTx, type: ExportType): Promise<{ filename: string; csv: string }> {
  switch (type) {
    case "bulanan":
      return { filename: "laporan-bulanan.csv", csv: toCsv(await monthlyReport(db), MONTHLY_COLUMNS) };
    case "tahunan": {
      const { start } = await getPlanPeriod(db);
      return { filename: "laporan-tahunan.csv", csv: toCsv(yearlyReport(await monthlyReport(db), start), YEARLY_COLUMNS) };
    }
    case "gaji":
      return { filename: "riwayat-gaji.csv", csv: toCsv(await salaryHistoryReport(db), SALARY_COLUMNS) };
    case "aset":
      return { filename: "performa-aset.csv", csv: toCsv(await assetPerformanceReport(db), ASSET_COLUMNS) };
  }
}

// ---------- Backup & restore ----------

export const BACKUP_VERSION = 1;

const tables = {
  salary_changes: salaryChanges,
  budget_categories: budgetCategories,
  monthly_budgets: monthlyBudgets,
  monthly_budget_items: monthlyBudgetItems,
  monthly_actuals: monthlyActuals,
  asset_accounts: assetAccounts,
  asset_transactions: assetTransactions,
  asset_valuations: assetValuations,
  projection_scenarios: projectionScenarios,
  financial_goals: financialGoals,
  audit_logs: auditLogs,
  settings,
  watchlist_stocks: watchlistStocks,
} as const;

type TableName = keyof typeof tables;
const TABLE_ORDER: TableName[] = [
  "settings",
  "watchlist_stocks",
  "salary_changes",
  "budget_categories",
  "monthly_budgets",
  "monthly_budget_items",
  "monthly_actuals",
  "asset_accounts",
  "asset_transactions",
  "asset_valuations",
  "projection_scenarios",
  "financial_goals",
  "audit_logs",
];

export const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type BackupPayload = z.infer<typeof backupSchema>;

export async function exportBackup(db: DbOrTx): Promise<BackupPayload> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const name of TABLE_ORDER) {
    out[name] = (await db.select().from(tables[name])) as Record<string, unknown>[];
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: out };
}

/**
 * Restore MENGGANTI seluruh data dengan isi backup, dalam satu transaksi.
 * Wajib `confirmed = true`. Payload divalidasi Zod; nama tabel tak dikenal ditolak.
 */
export async function restoreBackup(db: Db, raw: unknown, confirmed: boolean): Promise<{ restored: Record<string, number> }> {
  if (!confirmed) throw new Error("Restore memerlukan konfirmasi eksplisit karena mengganti seluruh data.");
  const payload = backupSchema.parse(raw);
  for (const name of Object.keys(payload.tables)) {
    if (!(name in tables)) throw new Error(`Tabel tidak dikenal dalam backup: ${name}`);
  }
  const restored: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const name of [...TABLE_ORDER].reverse()) await tx.delete(tables[name]);
    for (const name of TABLE_ORDER) {
      const rows = payload.tables[name] ?? [];
      if (rows.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.insert(tables[name]).values(rows as any);
      }
      restored[name] = rows.length;
    }
    await logAudit(tx, { entity: "backup", action: "restore", after: { exportedAt: payload.exportedAt, restored }, reason: "Restore dari file backup" });
  });
  return { restored };
}
