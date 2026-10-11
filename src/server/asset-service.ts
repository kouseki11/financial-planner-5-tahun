import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assetAccounts, assetTransactions, assetValuations, watchlistStocks, type AssetAccountRow, type AssetTransactionRow, type AssetValuationRow } from "@/db/schema";
import type { AssetKind } from "@/lib/allocation";
import { monthKeyFromDate } from "@/lib/months";
import { netWorth, summarizeAccount, type AccountSummary, type AssetAccount, type AssetTx, type NetWorthSummary, type TxType, type Valuation } from "@/lib/portfolio";
import { logAudit, type DbOrTx } from "./audit";

export function rowToAccount(r: AssetAccountRow): AssetAccount {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    openingBalance: r.openingBalance,
    targetAmount: r.targetAmount,
    targetMonthsOfExpenses: r.targetMonthsOfExpenses,
    lossLimitBp: r.lossLimitBp,
  };
}

export function rowToTx(r: AssetTransactionRow): AssetTx {
  return {
    id: r.id,
    accountId: r.accountId,
    type: r.type,
    tradeDate: r.tradeDate,
    month: r.month,
    symbol: r.symbol,
    quantityE6: r.quantityE6,
    pricePerUnit: r.pricePerUnit,
    fee: r.fee,
    amount: r.amount,
    note: r.note,
  };
}

export function rowToValuation(r: AssetValuationRow): Valuation & { id: number; accountId: number } {
  return { id: r.id, accountId: r.accountId, symbol: r.symbol, asOfDate: r.asOfDate, pricePerUnit: r.pricePerUnit, source: r.source };
}

export async function listAccounts(db: DbOrTx): Promise<AssetAccount[]> {
  const rows = await db.select().from(assetAccounts).orderBy(asc(assetAccounts.id));
  return rows.map(rowToAccount);
}

export async function getAccountByKind(db: DbOrTx, kind: AssetKind): Promise<AssetAccount | null> {
  const rows = await db.select().from(assetAccounts).where(eq(assetAccounts.kind, kind)).limit(1);
  return rows.length ? rowToAccount(rows[0]) : null;
}

export async function listTransactions(db: DbOrTx, accountId?: number): Promise<AssetTx[]> {
  const q = db.select().from(assetTransactions);
  const rows = accountId === undefined ? await q.orderBy(asc(assetTransactions.tradeDate), asc(assetTransactions.id)) : await q.where(eq(assetTransactions.accountId, accountId)).orderBy(asc(assetTransactions.tradeDate), asc(assetTransactions.id));
  return rows.map(rowToTx);
}

export async function listValuations(db: DbOrTx, accountId?: number) {
  const q = db.select().from(assetValuations);
  const rows = accountId === undefined ? await q.orderBy(asc(assetValuations.asOfDate)) : await q.where(eq(assetValuations.accountId, accountId)).orderBy(asc(assetValuations.asOfDate));
  return rows.map(rowToValuation);
}

export async function listWatchlist(db: DbOrTx) {
  return db.select().from(watchlistStocks).orderBy(asc(watchlistStocks.symbol));
}

export interface TransactionInput {
  accountId: number;
  type: TxType;
  tradeDate: string;
  symbol?: string | null;
  quantityE6?: number | null;
  pricePerUnit?: number | null;
  fee?: number;
  amount?: number;
  note?: string | null;
}

function validateTx(input: TransactionInput, account: AssetAccount): void {
  const isCash = account.kind === "emergency" || account.kind === "savings_personal" || account.kind === "savings_wedding";
  if (isCash && !["deposit", "withdraw"].includes(input.type)) {
    throw new Error("Akun kas/tabungan hanya menerima setoran dan penarikan.");
  }
  if (account.kind === "trading" && ["buy", "sell", "dividend"].includes(input.type)) {
    throw new Error("Akun trading mencatat deposit, penarikan, profit/loss terealisasi, dan biaya.");
  }
  if (["buy", "sell"].includes(input.type)) {
    if (!input.symbol) throw new Error("Kode aset wajib diisi untuk beli/jual.");
    if (!input.quantityE6 || input.quantityE6 <= 0) throw new Error("Kuantitas harus lebih dari 0.");
    if (!input.pricePerUnit || input.pricePerUnit <= 0) throw new Error("Harga harus lebih dari 0.");
    if (account.kind === "stock" && input.quantityE6 % 1_000_000 !== 0) throw new Error("Kuantitas saham harus bilangan bulat lembar.");
  }
  if (["deposit", "withdraw", "dividend", "fee"].includes(input.type) && (input.amount ?? 0) <= 0) {
    throw new Error("Nominal harus lebih dari 0.");
  }
  if (input.type === "realized_pnl" && (input.amount ?? 0) === 0) {
    throw new Error("Profit/loss tidak boleh 0.");
  }
  if ((input.fee ?? 0) < 0) throw new Error("Biaya tidak boleh negatif.");
}

export async function addTransaction(db: Db, input: TransactionInput): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(assetAccounts).where(eq(assetAccounts.id, input.accountId)).limit(1);
    if (!rows.length) throw new Error("Akun aset tidak ditemukan.");
    const account = rowToAccount(rows[0]);
    validateTx(input, account);
    const ins = await tx
      .insert(assetTransactions)
      .values({
        accountId: input.accountId,
        type: input.type,
        tradeDate: input.tradeDate,
        month: monthKeyFromDate(input.tradeDate),
        symbol: input.symbol?.toUpperCase() ?? null,
        quantityE6: input.quantityE6 ?? null,
        pricePerUnit: input.pricePerUnit ?? null,
        fee: input.fee ?? 0,
        amount: input.amount ?? 0,
        note: input.note ?? null,
      })
      .returning({ id: assetTransactions.id });
    await logAudit(tx, { entity: "asset_transactions", entityId: ins[0].id, action: "create", after: input });
    return ins[0].id;
  });
}

export async function deleteTransaction(db: Db, id: number, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(assetTransactions).where(eq(assetTransactions.id, id)).limit(1);
    if (!rows.length) return;
    await tx.delete(assetTransactions).where(eq(assetTransactions.id, id));
    await logAudit(tx, { entity: "asset_transactions", entityId: id, action: "delete", before: rows[0], reason: reason ?? null });
  });
}

export interface ValuationInput {
  accountId: number;
  symbol: string;
  asOfDate: string;
  pricePerUnit: number;
  source?: "manual" | "last_known";
  note?: string | null;
}

export async function addValuation(db: Db, input: ValuationInput): Promise<number> {
  if (input.pricePerUnit <= 0) throw new Error("Harga harus lebih dari 0.");
  return db.transaction(async (tx) => {
    const ins = await tx
      .insert(assetValuations)
      .values({ accountId: input.accountId, symbol: input.symbol.toUpperCase(), asOfDate: input.asOfDate, pricePerUnit: input.pricePerUnit, source: input.source ?? "manual", note: input.note ?? null })
      .returning({ id: assetValuations.id });
    await logAudit(tx, { entity: "asset_valuations", entityId: ins[0].id, action: "create", after: input });
    return ins[0].id;
  });
}

export interface AccountPatch {
  name?: string;
  openingBalance?: number;
  targetAmount?: number | null;
  targetMonthsOfExpenses?: number | null;
  lossLimitBp?: number | null;
}

export async function updateAccount(db: Db, id: number, patch: AccountPatch, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(assetAccounts).where(eq(assetAccounts.id, id)).limit(1);
    if (!rows.length) throw new Error("Akun tidak ditemukan.");
    await tx.update(assetAccounts).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(assetAccounts.id, id));
    await logAudit(tx, { entity: "asset_accounts", entityId: id, action: "update", before: rowToAccount(rows[0]), after: patch, reason: reason ?? null });
  });
}

export interface PortfolioSnapshot {
  accounts: AssetAccount[];
  summaries: AccountSummary[];
  byKind: Partial<Record<AssetKind, AccountSummary>>;
  netWorth: NetWorthSummary;
  transactions: AssetTx[];
  valuations: Array<Valuation & { id: number; accountId: number }>;
}

/** Ringkasan seluruh akun per tanggal (default: semua transaksi). */
export async function getPortfolioSnapshot(db: DbOrTx, asOf?: string): Promise<PortfolioSnapshot> {
  const accounts = await listAccounts(db);
  const transactions = await listTransactions(db);
  const valuations = await listValuations(db);
  const summaries = accounts.map((a) =>
    summarizeAccount(
      a,
      transactions,
      valuations.filter((v) => v.accountId === a.id),
      asOf,
    ),
  );
  const byKind: Partial<Record<AssetKind, AccountSummary>> = {};
  for (const s of summaries) byKind[s.kind] = s;
  return { accounts, summaries, byKind, netWorth: netWorth(summaries), transactions, valuations };
}
