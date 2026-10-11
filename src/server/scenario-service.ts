import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projectionScenarios, type ProjectionScenarioRow } from "@/db/schema";
import type { ScenarioAssumptions, ScenarioKey } from "@/lib/projection";
import { logAudit, type DbOrTx } from "./audit";

const ORDER: ScenarioKey[] = ["conservative", "moderate", "optimistic"];

export function rowToScenario(r: ProjectionScenarioRow): ScenarioAssumptions {
  return {
    key: r.key,
    name: r.name,
    stockAnnualBp: r.stockAnnualBp,
    cryptoAnnualBp: r.cryptoAnnualBp,
    tradingAnnualBp: r.tradingAnnualBp,
    cashAnnualBp: r.cashAnnualBp,
    inflationAnnualBp: r.inflationAnnualBp,
    tradingProjectionEnabled: r.tradingProjectionEnabled,
    tradingMaxLossBp: r.tradingMaxLossBp,
    description: r.description,
  };
}

export async function listScenarios(db: DbOrTx): Promise<ScenarioAssumptions[]> {
  const rows = await db.select().from(projectionScenarios).orderBy(asc(projectionScenarios.id));
  return rows.map(rowToScenario).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
}

export type ScenarioPatch = Partial<Omit<ScenarioAssumptions, "key">>;

/** Mengubah asumsi skenario. Tidak menyentuh transaksi/realisasi apa pun (T11). */
export async function updateScenario(db: Db, key: ScenarioKey, patch: ScenarioPatch, reason?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(projectionScenarios).where(eq(projectionScenarios.key, key)).limit(1);
    if (!rows.length) throw new Error("Skenario tidak ditemukan.");
    await tx.update(projectionScenarios).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(projectionScenarios.key, key));
    await logAudit(tx, { entity: "projection_scenarios", entityId: key, action: "update", before: rowToScenario(rows[0]), after: patch, reason: reason ?? null });
  });
}
