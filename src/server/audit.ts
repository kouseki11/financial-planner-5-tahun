import { desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLogs } from "@/db/schema";

/** Transaksi Drizzle libSQL memiliki API yang sama dengan Db untuk operasi dasar. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export interface AuditEntry {
  entity: string;
  entityId?: string | number | null;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export async function logAudit(db: DbOrTx, e: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    entity: e.entity,
    entityId: e.entityId === undefined || e.entityId === null ? null : String(e.entityId),
    action: e.action,
    beforeJson: e.before === undefined ? null : JSON.stringify(e.before),
    afterJson: e.after === undefined ? null : JSON.stringify(e.after),
    reason: e.reason ?? null,
  });
}

export async function listAuditLogs(db: Db, limit = 100) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(limit);
}
