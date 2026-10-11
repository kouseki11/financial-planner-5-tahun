import { config } from "dotenv";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, resolveDbConfig, type Db } from "./client";

/** Jalankan semua migrasi di folder ./drizzle terhadap database yang dikonfigurasi. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
}

async function main() {
  config({ path: ".env.local" });
  config();
  const cfg = resolveDbConfig();
  const target = cfg.url.startsWith("libsql://") ? "Turso Cloud" : cfg.url;
  console.log(`Migrasi → ${target}`);
  const { db, client } = createDb(cfg);
  await runMigrations(db);
  client.close();
  console.log("Migrasi selesai.");
}

if (process.argv[1] && /migrate\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
