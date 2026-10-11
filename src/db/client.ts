import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

export interface DbConfig {
  url: string;
  authToken?: string;
}

/**
 * Konfigurasi koneksi:
 * - Production (Vercel) WAJIB Turso: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 * - Development: boleh LOCAL_DATABASE_URL=file:local.db bila TURSO_* tidak diset.
 * - Test: createDb({ url: ":memory:" }).
 */
export function resolveDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const tursoUrl = env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    if (!env.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN wajib diisi bila TURSO_DATABASE_URL diset.");
    return { url: tursoUrl, authToken: env.TURSO_AUTH_TOKEN };
  }
  if (env.NODE_ENV === "production" && env.VERCEL) {
    throw new Error("Production harus memakai Turso Cloud. Set TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN.");
  }
  return { url: env.LOCAL_DATABASE_URL ?? "file:local.db" };
}

export function createDb(config: DbConfig): { db: Db; client: Client } {
  const client = createClient({ url: config.url, authToken: config.authToken });
  const db = drizzle(client, { schema });
  return { db, client };
}

let cached: { db: Db; client: Client } | null = null;

/** Koneksi singleton untuk runtime Next.js. */
export function getDb(): Db {
  if (!cached) cached = createDb(resolveDbConfig());
  return cached.db;
}

export { schema };
