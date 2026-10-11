import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Skema database. Semua uang = integer rupiah. Persentase = basis poin (10.000 = 100 %).
 * Bulan = text "YYYY-MM". Tanggal = text "YYYY-MM-DD". Waktu = text ISO 8601.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const salaryChanges = sqliteTable(
  "salary_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    amount: integer("amount").notNull(),
    effectiveMonth: text("effective_month").notNull(),
    status: text("status", { enum: ["planned", "actual", "superseded"] }).notNull(),
    note: text("note"),
    supersededById: integer("superseded_by_id"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("salary_changes_effective_idx").on(t.effectiveMonth, t.status)],
);

export const budgetCategories = sqliteTable("budget_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  groupKey: text("group_key", { enum: ["wajib", "dana_darurat", "tabungan", "investasi", "fleksibel"] }).notNull(),
  assetKind: text("asset_kind", { enum: ["emergency", "savings_personal", "savings_wedding", "stock", "crypto", "trading"] }),
  method: text("method", { enum: ["fixed", "percent", "min_plus_percent"] }).notNull().default("fixed"),
  fixedAmount: integer("fixed_amount").notNull().default(0),
  percentBp: integer("percent_bp").notNull().default(0),
  priority: integer("priority").notNull().default(100),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const monthlyBudgets = sqliteTable(
  "monthly_budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(),
    salaryAmount: integer("salary_amount").notNull(),
    salaryChangeId: integer("salary_change_id").references(() => salaryChanges.id),
    /** projected = otomatis & boleh dihitung ulang; planned = bulan berjalan; locked = historis, beku. */
    status: text("status", { enum: ["projected", "planned", "locked"] }).notNull().default("projected"),
    lockedAt: text("locked_at"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("monthly_budgets_month_uq").on(t.month)],
);

export const monthlyBudgetItems = sqliteTable(
  "monthly_budget_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monthlyBudgetId: integer("monthly_budget_id")
      .notNull()
      .references(() => monthlyBudgets.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => budgetCategories.id),
    plannedAmount: integer("planned_amount").notNull(),
    /** JSON {method, fixedAmount, percentBp, priority} saat snapshot dibuat. */
    ruleSnapshot: text("rule_snapshot").notNull(),
  },
  (t) => [uniqueIndex("monthly_budget_items_uq").on(t.monthlyBudgetId, t.categoryId)],
);

export const monthlyActuals = sqliteTable(
  "monthly_actuals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => budgetCategories.id),
    actualAmount: integer("actual_amount").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("monthly_actuals_uq").on(t.month, t.categoryId)],
);

export const assetAccounts = sqliteTable("asset_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["emergency", "savings_personal", "savings_wedding", "stock", "crypto", "trading"] }).notNull().unique(),
  name: text("name").notNull(),
  openingBalance: integer("opening_balance").notNull().default(0),
  targetAmount: integer("target_amount"),
  targetMonthsOfExpenses: integer("target_months_of_expenses"),
  lossLimitBp: integer("loss_limit_bp"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const assetTransactions = sqliteTable(
  "asset_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => assetAccounts.id),
    type: text("type", { enum: ["deposit", "withdraw", "buy", "sell", "dividend", "fee", "realized_pnl"] }).notNull(),
    tradeDate: text("trade_date").notNull(),
    month: text("month").notNull(),
    symbol: text("symbol"),
    quantityE6: integer("quantity_e6"),
    pricePerUnit: integer("price_per_unit"),
    fee: integer("fee").notNull().default(0),
    amount: integer("amount").notNull().default(0),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("asset_transactions_account_idx").on(t.accountId, t.tradeDate), index("asset_transactions_month_idx").on(t.month)],
);

export const assetValuations = sqliteTable(
  "asset_valuations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => assetAccounts.id),
    symbol: text("symbol").notNull(),
    asOfDate: text("as_of_date").notNull(),
    pricePerUnit: integer("price_per_unit").notNull(),
    source: text("source", { enum: ["manual", "last_known"] }).notNull().default("manual"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("asset_valuations_symbol_idx").on(t.symbol, t.asOfDate)],
);

export const projectionScenarios = sqliteTable("projection_scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key", { enum: ["conservative", "moderate", "optimistic"] }).notNull().unique(),
  name: text("name").notNull(),
  stockAnnualBp: integer("stock_annual_bp").notNull().default(0),
  cryptoAnnualBp: integer("crypto_annual_bp").notNull().default(0),
  tradingAnnualBp: integer("trading_annual_bp").notNull().default(0),
  cashAnnualBp: integer("cash_annual_bp").notNull().default(0),
  inflationAnnualBp: integer("inflation_annual_bp").notNull().default(0),
  tradingProjectionEnabled: integer("trading_projection_enabled", { mode: "boolean" }).notNull().default(true),
  tradingMaxLossBp: integer("trading_max_loss_bp"),
  description: text("description").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(now),
});

export const financialGoals = sqliteTable("financial_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  accountKind: text("account_kind", { enum: ["emergency", "savings_personal", "savings_wedding", "stock", "crypto", "trading"] }),
  targetAmount: integer("target_amount").notNull(),
  targetMonth: text("target_month"),
  createdAt: text("created_at").notNull().default(now),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("audit_logs_entity_idx").on(t.entity, t.entityId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export const watchlistStocks = sqliteTable("watchlist_stocks", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
});

export type SalaryChangeRow = typeof salaryChanges.$inferSelect;
export type BudgetCategoryRow = typeof budgetCategories.$inferSelect;
export type MonthlyBudgetRow = typeof monthlyBudgets.$inferSelect;
export type MonthlyBudgetItemRow = typeof monthlyBudgetItems.$inferSelect;
export type MonthlyActualRow = typeof monthlyActuals.$inferSelect;
export type AssetAccountRow = typeof assetAccounts.$inferSelect;
export type AssetTransactionRow = typeof assetTransactions.$inferSelect;
export type AssetValuationRow = typeof assetValuations.$inferSelect;
export type ProjectionScenarioRow = typeof projectionScenarios.$inferSelect;
export type FinancialGoalRow = typeof financialGoals.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
