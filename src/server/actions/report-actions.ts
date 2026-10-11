"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/bootstrap";
import { restoreBackup } from "@/server/report-service";
import { boolField, errorMessage, fail, ok, type ActionState } from "./helpers";

export async function restoreBackupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Pilih file backup JSON.");
    if (file.size > 20 * 1024 * 1024) return fail("File terlalu besar (maks 20 MB).");
    const confirmed = boolField.parse(fd.get("confirmed"));
    if (!confirmed) return fail("Centang konfirmasi: restore mengganti seluruh data saat ini.");
    const raw = JSON.parse(await file.text());
    const r = await restoreBackup(await db(), raw, true);
    for (const p of ["/", "/gaji", "/anggaran", "/realisasi", "/investasi", "/proyeksi", "/analisis", "/laporan"]) revalidatePath(p);
    const total = Object.values(r.restored).reduce((s, n) => s + n, 0);
    return ok(`Restore selesai: ${total} baris dipulihkan.`);
  } catch (e) {
    return fail(errorMessage(e));
  }
}
