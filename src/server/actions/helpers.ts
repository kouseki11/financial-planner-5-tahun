import { z } from "zod";
import { parseRupiahInput } from "@/lib/money";
import { isValidMonthKey } from "@/lib/months";

export type ActionState = { ok: boolean; message: string; data?: unknown } | null;

export function ok(message = "Tersimpan.", data?: unknown): ActionState {
  return { ok: true, message, data };
}

export function fail(message: string): ActionState {
  return { ok: false, message };
}

export function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  return "Terjadi kesalahan.";
}

/** Zod: input rupiah dari form (menerima "Rp 7.500.000"). */
export const rupiahField = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const n = parseRupiahInput(v);
  return n === null ? undefined : n;
}, z.number().int().safe());

export const optionalRupiahField = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  if (v.trim() === "") return null;
  const n = parseRupiahInput(v);
  return n === null ? undefined : n;
}, z.number().int().safe().nullable());

/** Persen desimal dari form ("12,5") → bp integer. */
export const percentToBpField = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  if (v.trim() === "") return 0;
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}, z.number().int());

export const monthField = z.string().refine(isValidMonthKey, "Format bulan harus YYYY-MM");
export const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");
export const idField = z.coerce.number().int().positive();
export const boolField = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());
/** Teks opsional: field tidak ada / kosong → null. */
export const optionalText = z.preprocess((v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v), z.string().max(500).nullable());

/** Rupiah opsional dengan default 0: field tidak ada / kosong → 0. */
export const rupiahOrZeroField = z.preprocess((v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? "0" : v), rupiahField);

/** Kuantitas desimal ("0,5") → integer × 1e6. */
export const quantityE6Field = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : undefined;
}, z.number().int().positive());

export function formToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}
