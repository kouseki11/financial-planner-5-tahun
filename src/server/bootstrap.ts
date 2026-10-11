import { count } from "drizzle-orm";
import type { Db } from "@/db/client";
import { getDb } from "@/db/client";
import { monthlyBudgets } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { regenerateBudgets } from "./budget-service";

let bootstrapped = false;

/**
 * Seed data awal bila kosong dan buat snapshot anggaran 60 bulan bila belum ada.
 * Migrasi skema TIDAK dijalankan di sini (jalankan `npm run db:migrate`).
 */
export async function ensureBootstrapped(db: Db): Promise<void> {
  if (bootstrapped) return;
  await seedDatabase(db);
  const [{ n }] = await db.select({ n: count() }).from(monthlyBudgets);
  if (n === 0) await db.transaction((tx) => regenerateBudgets(tx));
  bootstrapped = true;
}

/** Helper untuk halaman/server action: DB siap pakai. */
export async function db(): Promise<Db> {
  const d = getDb();
  await ensureBootstrapped(d);
  return d;
}
