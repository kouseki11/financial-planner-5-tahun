"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/bootstrap";
import { updateScenario } from "@/server/scenario-service";
import { boolField, errorMessage, fail, formToObject, ok, percentToBpField, type ActionState } from "./helpers";

const schema = z.object({
  key: z.enum(["conservative", "moderate", "optimistic"]),
  name: z.string().min(1).max(60),
  stockAnnualBp: percentToBpField.refine((n) => n >= -10_000 && n <= 50_000, "−100 % s.d. 500 %"),
  cryptoAnnualBp: percentToBpField.refine((n) => n >= -10_000 && n <= 50_000, "−100 % s.d. 500 %"),
  tradingAnnualBp: percentToBpField.refine((n) => n >= -10_000 && n <= 50_000, "−100 % s.d. 500 %"),
  cashAnnualBp: percentToBpField.refine((n) => n >= -10_000 && n <= 10_000, "−100 % s.d. 100 %"),
  inflationAnnualBp: percentToBpField.refine((n) => n >= 0 && n <= 10_000, "0–100 %"),
  tradingProjectionEnabled: boolField,
  tradingMaxLossBp: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), percentToBpField.refine((n) => n >= 0 && n <= 10_000, "0–100 %").nullable()),
  description: z.string().max(500).default(""),
});

export async function updateScenarioAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { key, ...patch } = schema.parse(formToObject(fd));
    await updateScenario(await db(), key, patch, "Ubah asumsi dari halaman Proyeksi");
    for (const p of ["/", "/proyeksi", "/analisis"]) revalidatePath(p);
    return ok("Asumsi skenario disimpan. Transaksi dan realisasi tidak berubah.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
