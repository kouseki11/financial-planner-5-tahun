"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addTransaction, addValuation, deleteTransaction, updateAccount } from "@/server/asset-service";
import { db } from "@/server/bootstrap";
import { dateField, errorMessage, fail, formToObject, idField, ok, optionalRupiahField, optionalText, quantityE6Field, rupiahField, rupiahOrZeroField, type ActionState } from "./helpers";

function revalidateAll() {
  for (const p of ["/", "/realisasi", "/investasi", "/proyeksi", "/analisis", "/laporan"]) revalidatePath(p);
}

const txSchema = z.object({
  accountId: idField,
  type: z.enum(["deposit", "withdraw", "buy", "sell", "dividend", "fee", "realized_pnl"]),
  tradeDate: dateField,
  symbol: optionalText,
  quantityE6: z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v), quantityE6Field.optional()),
  pricePerUnit: z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v), rupiahField.optional()),
  fee: rupiahOrZeroField,
  amount: rupiahOrZeroField,
  note: optionalText,
});

export async function addTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = txSchema.parse(formToObject(fd));
    await addTransaction(await db(), { ...input, symbol: input.symbol ?? null, quantityE6: input.quantityE6 ?? null, pricePerUnit: input.pricePerUnit ?? null });
    revalidateAll();
    return ok("Transaksi disimpan.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = idField.parse(fd.get("id"));
    await deleteTransaction(await db(), id, String(fd.get("reason") ?? ""));
    revalidateAll();
    return ok("Transaksi dihapus (tercatat di audit log).");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const valSchema = z.object({
  accountId: idField,
  symbol: z.string().min(1).max(12),
  asOfDate: dateField,
  pricePerUnit: rupiahField.refine((n) => n > 0, "Harga harus > 0"),
  source: z.enum(["manual", "last_known"]).default("manual"),
  note: optionalText,
});

export async function addValuationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = valSchema.parse(formToObject(fd));
    await addValuation(await db(), input);
    revalidateAll();
    return ok("Harga pasar disimpan dengan tanggal pembaruan.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const accountSchema = z.object({
  id: idField,
  name: z.string().min(1).max(80),
  openingBalance: rupiahField,
  targetAmount: optionalRupiahField,
  targetMonthsOfExpenses: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.coerce.number().int().min(0).max(60).nullable()),
  lossLimitBp: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : Math.round(Number(String(v).replace(",", ".")) * 100)), z.number().int().min(0).max(10_000).nullable()),
});

export async function updateAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { id, ...patch } = accountSchema.parse(formToObject(fd));
    await updateAccount(await db(), id, patch, "Ubah pengaturan akun");
    revalidateAll();
    return ok("Pengaturan akun disimpan.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
