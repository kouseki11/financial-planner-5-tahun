import { db } from "@/server/bootstrap";
import { exportBackup } from "@/server/report-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await exportBackup(await db());
  const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="financial-planner-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
