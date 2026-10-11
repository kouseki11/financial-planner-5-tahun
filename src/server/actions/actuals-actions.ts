"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteActual, upsertActual } from "@/server/actuals-service";
import { db } from "@/server/bootstrap";
import { boolField, errorMessage, fail, formToObject, idField, monthField, ok, optionalText, rupiahField, type ActionState } from "./helpers";

function revalidateAll() {
  for (const p of ["/", "/realisasi", "/proyeksi", "/analisis", "/laporan"]) revalidatePath(p);
}

const schema = z.object({
  month: monthField,
  categoryId: idField,
  actualAmount: rupiahField.refine((n) => n >= 0, "Tidak boleh negatif"),
  note: optionalText,
  confirmHistorical: boolField.optional(),
  reason: optionalText.optional(),
});

export async function upsertActualAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = schema.parse(formToObject(fd));
    await upsertActual(await db(), { ...input, confirmHistorical: input.confirmHistorical ?? false, reason: input.reason ?? null });
    revalidateAll();
    return ok("Realisasi disimpan.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

/** Simpan banyak kategori sekaligus untuk satu bulan: field `actual_<categoryId>`. */
export async function upsertMonthActualsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const obj = formToObject(fd);
    const month = monthField.parse(obj.month);
    const confirmHistorical = boolField.parse(obj.confirmHistorical);
    const reason = obj.reason?.trim() || null;
    const d = await db();
    let n = 0;
    for (const [k, v] of Object.entries(obj)) {
      const m = /^actual_(\d+)$/.exec(k);
      if (!m || v.trim() === "") continue;
      const actualAmount = rupiahField.parse(v);
      await upsertActual(d, { month, categoryId: Number(m[1]), actualAmount, confirmHistorical, reason });
      n++;
    }
    revalidateAll();
    return ok(`${n} realisasi disimpan untuk ${month}.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function deleteActualAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = idField.parse(fd.get("id"));
    await deleteActual(await db(), id, String(fd.get("reason") ?? ""));
    revalidateAll();
    return ok("Realisasi dihapus.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
