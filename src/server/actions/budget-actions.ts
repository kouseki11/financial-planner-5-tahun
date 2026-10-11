"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/bootstrap";
import { createCategory, lockMonth, regenerateBudgets, unlockMonth, updateCategoryRule } from "@/server/budget-service";
import { boolField, errorMessage, fail, formToObject, idField, monthField, ok, percentToBpField, rupiahField, type ActionState } from "./helpers";

function revalidateAll() {
  for (const p of ["/", "/anggaran", "/realisasi", "/proyeksi", "/analisis", "/laporan"]) revalidatePath(p);
}

const ruleSchema = z.object({
  id: idField,
  name: z.string().min(1).max(80),
  groupKey: z.enum(["wajib", "dana_darurat", "tabungan", "investasi", "fleksibel"]),
  method: z.enum(["fixed", "percent", "min_plus_percent"]),
  fixedAmount: rupiahField.refine((n) => n >= 0, "Tidak boleh negatif"),
  percentBp: percentToBpField.refine((n) => n >= 0 && n <= 10_000, "Persentase 0–100"),
  priority: z.coerce.number().int().min(1).max(999),
  isActive: boolField,
});

export async function updateCategoryRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { id, ...patch } = ruleSchema.parse(formToObject(fd));
    await updateCategoryRule(await db(), id, patch, "Ubah aturan dari halaman Anggaran");
    revalidateAll();
    return ok("Aturan disimpan; bulan non-terkunci dihitung ulang.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const createSchema = ruleSchema.omit({ id: true }).extend({
  assetKind: z.preprocess((v) => (v === "" ? null : v), z.enum(["emergency", "savings_personal", "savings_wedding", "stock", "crypto", "trading"]).nullable()),
});

export async function createCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = createSchema.parse(formToObject(fd));
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    await createCategory(await db(), { ...input, slug: `${slug}-${Date.now().toString(36)}` });
    revalidateAll();
    return ok("Kategori ditambahkan.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function lockMonthAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const month = monthField.parse(fd.get("month"));
    await lockMonth(await db(), month, String(fd.get("reason") ?? "Bulan selesai"));
    revalidateAll();
    return ok(`Bulan ${month} dikunci sebagai historis.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function unlockMonthAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const month = monthField.parse(fd.get("month"));
    const reason = z.string().min(3, "Alasan minimal 3 karakter").parse(fd.get("reason"));
    if (!boolField.parse(fd.get("confirmed"))) return fail("Centang konfirmasi untuk membuka kunci bulan historis.");
    await unlockMonth(await db(), month, reason);
    revalidateAll();
    return ok(`Kunci bulan ${month} dibuka; tercatat di audit log.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function regenerateBudgetsAction(prev: ActionState, fd: FormData): Promise<ActionState> {
  void prev;
  void fd;
  try {
    const d = await db();
    const r = await d.transaction((tx) => regenerateBudgets(tx, { reason: "Regenerasi manual" }));
    revalidateAll();
    return ok(`${r.regenerated.length} bulan dihitung ulang; ${r.skippedLocked.length} bulan terkunci dilewati.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
