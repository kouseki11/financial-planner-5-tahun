import type { Db } from "@/db/client";
import type { AllocationResult, AssetKind } from "@/lib/allocation";
import { generateInsights, type Insight } from "@/lib/insights";
import { formatMonthShort, monthRange, type MonthKey } from "@/lib/months";
import { monthsToTarget, type AccountSummary, type NetWorthSummary } from "@/lib/portfolio";
import { yearEndPoints, type ProjectionResult, type ScenarioKey } from "@/lib/projection";
import { salarySeries, type SalaryChange, type SalaryPoint } from "@/lib/salary";
import { planVsActual, type PlanVsActualMonth } from "./actuals-service";
import { getPortfolioSnapshot } from "./asset-service";
import { getCategoryRules, getSalaryChangesRaw, listBudgets, type BudgetMonthView } from "./budget-service";
import { getProjectionBundle } from "./projection-service";
import { getCurrentPlanMonth, getPlanPeriod } from "./settings";

export interface GoalStatus {
  kind: AssetKind;
  name: string;
  current: number;
  target: number | null;
  achievementBp: number | null;
  monthsToTarget: number | null;
  monthlyDeposit: number;
}

export interface SeriesPoint {
  month: MonthKey;
  label: string;
  [k: string]: string | number | null;
}

export interface DashboardData {
  currentMonth: MonthKey;
  periodStart: MonthKey;
  periodEnd: MonthKey;
  salaryChanges: SalaryChange[];
  salarySeries: SalaryPoint[];
  currentBudget: BudgetMonthView | null;
  currentAllocation: AllocationResult | null;
  expensesPlanned: number;
  investPlanned: number;
  savingsPlanned: number;
  emergencyPlanned: number;
  remaining: number;
  deficit: number;
  summaries: AccountSummary[];
  byKind: Partial<Record<AssetKind, AccountSummary>>;
  netWorth: NetWorthSummary;
  projections: ProjectionResult[];
  yearEnd: Record<ScenarioKey, { month: MonthKey; netWorth: number }[]>;
  finalByScenario: Record<ScenarioKey, number>;
  goals: GoalStatus[];
  planVsActual: PlanVsActualMonth[];
  insights: Insight[];
  charts: {
    salary: SeriesPoint[];
    allocation: { name: string; value: number; group: string }[];
    netWorth: SeriesPoint[];
    depositsVsGains: SeriesPoint[];
    planVsActual: SeriesPoint[];
  };
  lastActualMonth: MonthKey | null;
}

export async function getDashboardData(db: Db): Promise<DashboardData> {
  const { start, end } = await getPlanPeriod(db);
  const currentMonth = await getCurrentPlanMonth(db);
  const months = monthRange(start, end);
  const salaryChanges = await getSalaryChangesRaw(db);
  const series = salarySeries(months, salaryChanges);
  const budgets = await listBudgets(db);
  const currentBudget = budgets.find((b) => b.month === currentMonth) ?? null;
  const currentAllocation = currentBudget?.allocation ?? null;
  const portfolio = await getPortfolioSnapshot(db);
  const bundle = await getProjectionBundle(db);
  const pva = await planVsActual(db);
  const rules = await getCategoryRules(db);

  const sumWhere = (pred: (l: AllocationResult["lines"][number]) => boolean) => currentAllocation?.lines.filter(pred).reduce((s, l) => s + l.amount, 0) ?? 0;
  const expensesPlanned = sumWhere((l) => !l.assetKind);
  const investPlanned = sumWhere((l) => l.assetKind === "stock" || l.assetKind === "crypto" || l.assetKind === "trading");
  const savingsPlanned = sumWhere((l) => l.assetKind === "savings_personal" || l.assetKind === "savings_wedding");
  const emergencyPlanned = sumWhere((l) => l.assetKind === "emergency");

  const mandatory = sumWhere((l) => l.groupKey === "wajib");
  const goals: GoalStatus[] = portfolio.accounts
    .filter((a) => a.kind === "emergency" || a.kind === "savings_personal" || a.kind === "savings_wedding")
    .map((a) => {
      const s = portfolio.byKind[a.kind]!;
      const target = a.kind === "emergency" && a.targetMonthsOfExpenses ? a.targetMonthsOfExpenses * mandatory : a.targetAmount;
      const monthly = sumWhere((l) => l.assetKind === a.kind);
      return {
        kind: a.kind,
        name: a.name,
        current: s.totalValue,
        target: target ?? null,
        achievementBp: target && target > 0 ? Math.round((s.totalValue / target) * 10_000) : null,
        monthsToTarget: target ? monthsToTarget(s.totalValue, target, monthly) : null,
        monthlyDeposit: monthly,
      };
    });

  const yearEnd = {} as DashboardData["yearEnd"];
  const finalByScenario = {} as DashboardData["finalByScenario"];
  for (const r of bundle.results) {
    yearEnd[r.scenario.key] = yearEndPoints(r).map((p) => ({ month: p.month, netWorth: p.netWorth }));
    finalByScenario[r.scenario.key] = r.totals.finalNetWorth;
  }

  const moderate = bundle.results.find((r) => r.scenario.key === "moderate") ?? bundle.results[0];
  const emergencyGoal = goals.find((g) => g.kind === "emergency");
  const insights = generateInsights({
    periodStart: start,
    periodEnd: end,
    currentMonth,
    salary: series,
    currentAllocation,
    results: bundle.results,
    summaries: portfolio.summaries,
    netWorth: portfolio.netWorth,
    planVsActual: pva,
    emergencyTarget: emergencyGoal?.target ?? null,
    monthlyMandatoryExpenses: mandatory,
  });

  const byMonth = new Map(bundle.results.map((r) => [r.scenario.key, r.months]));
  const netWorthSeries: SeriesPoint[] = months.map((m, i) => ({
    month: m,
    label: formatMonthShort(m),
    conservative: byMonth.get("conservative")?.[i]?.netWorth ?? null,
    moderate: byMonth.get("moderate")?.[i]?.netWorth ?? null,
    optimistic: byMonth.get("optimistic")?.[i]?.netWorth ?? null,
  }));

  const depositsVsGains: SeriesPoint[] = yearEndPoints(moderate).map((p) => ({
    month: p.month,
    label: `Tahun ${Math.floor(months.indexOf(p.month) / 12) + 1}`,
    deposits: p.cumInvestedDeposits,
    gains: p.assets.stock.cumGains + p.assets.crypto.cumGains + p.assets.trading.cumGains + p.cumIncome - p.cumFees,
  }));

  const pvaSeries: SeriesPoint[] = pva
    .filter((m) => m.hasActuals)
    .map((m) => ({ month: m.month, label: formatMonthShort(m.month), planned: m.plannedExpenses, actual: m.actualExpenses }));

  const groupLabel = (id: number) => rules.find((r) => r.id === id)?.groupKey ?? "fleksibel";

  return {
    currentMonth,
    periodStart: start,
    periodEnd: end,
    salaryChanges,
    salarySeries: series,
    currentBudget,
    currentAllocation,
    expensesPlanned,
    investPlanned,
    savingsPlanned,
    emergencyPlanned,
    remaining: currentAllocation?.remaining ?? 0,
    deficit: currentAllocation?.deficit ?? 0,
    summaries: portfolio.summaries,
    byKind: portfolio.byKind,
    netWorth: portfolio.netWorth,
    projections: bundle.results,
    yearEnd,
    finalByScenario,
    goals,
    planVsActual: pva,
    insights,
    charts: {
      salary: series.map((p) => ({ month: p.month, label: formatMonthShort(p.month), amount: p.amount, status: p.status })),
      allocation: (currentAllocation?.lines ?? []).map((l) => ({ name: l.name, value: l.amount, group: groupLabel(l.categoryId) })),
      netWorth: netWorthSeries,
      depositsVsGains,
      planVsActual: pvaSeries,
    },
    lastActualMonth: bundle.lastActualMonth,
  };
}
