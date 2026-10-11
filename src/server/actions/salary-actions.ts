"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/bootstrap";
import { applyRaisePolicyToRules, setRaisePolicy } from "@/server/budget-service";
import { addSalaryChange, confirmSalaryChange, correctHistoricalSalary, previewSalaryChange, supersedeSalaryChange } from "@/server/salary-service";
import { boolField, errorMessage, fail, formToObject, idField, monthField, ok, optionalText, rupiahField, type ActionState } from "./helpers";

const addSchema = z.object({
  amount: rupiahField.refine((n) => n > 0, "Gaji harus lebih dari 0"),
  effectiveMonth: monthField,
  note: optionalText,
  status: z.enum(["planned", "actual"]),
});

function revalidateAll() {
  for (const p of ["/", "/gaji", "/anggaran", "/realisasi", "/proyeksi", "/analisis", "/laporan"]) revalidatePath(p);
}

export async function addSalaryChangeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = addSchema.parse(formToObject(fd));
    const id = await addSalaryChange(await db(), input);
    revalidateAll();
    return ok(`Perubahan gaji #${id} disimpan. Bulan sebelum ${input.effectiveMonth} tidak berubah.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function previewSalaryChangeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = addSchema.omit({ status: true }).parse(formToObject(fd));
    const preview = await previewSalaryChange(await db(), input);
    return ok("Preview dampak", preview);
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function confirmSalaryChangeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = idField.parse(fd.get("id"));
    await confirmSalaryChange(await db(), id);
    revalidateAll();
    return ok("Perubahan gaji dikonfirmasi sebagai aktual.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

export async function supersedeSalaryChangeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const id = idField.parse(fd.get("id"));
    await supersedeSalaryChange(await db(), id, String(fd.get("reason") ?? ""));
    revalidateAll();
    return ok("Rencana kenaikan dibatalkan (superseded).");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const correctSchema = z.object({ id: idField, amount: rupiahField, reason: z.string().min(3, "Alasan minimal 3 karakter"), confirmed: boolField });

export async function correctHistoricalSalaryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = correctSchema.parse(formToObject(fd));
    await correctHistoricalSalary(await db(), input.id, input.amount, input.reason, input.confirmed);
    revalidateAll();
    return ok("Koreksi historis tersimpan dan dicatat di audit log.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const policySchema = z.object({ policy: z.enum(["manual", "proportional", "emergency_first"]) });

export async function setRaisePolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { policy } = policySchema.parse(formToObject(fd));
    await setRaisePolicy(await db(), policy);
    revalidateAll();
    return ok("Kebijakan kenaikan disimpan.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}

const applySchema = z.object({ oldSalary: rupiahField, newSalary: rupiahField, policy: z.enum(["manual", "proportional", "emergency_first"]) });

export async function applyRaisePolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const input = applySchema.parse(formToObject(fd));
    await applyRaisePolicyToRules(await db(), input.oldSalary, input.newSalary, input.policy);
    revalidateAll();
    return ok("Aturan kategori diperbarui sesuai kebijakan; bulan terkunci tidak berubah.");
  } catch (e) {
    return fail(errorMessage(e));
  }
}
