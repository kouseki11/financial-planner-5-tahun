import { db } from "@/server/bootstrap";
import { exportCsv, type ExportType } from "@/server/report-service";

export const dynamic = "force-dynamic";

const TYPES: ExportType[] = ["bulanan", "tahunan", "gaji", "aset"];

export async function GET(_req: Request, ctx: { params: Promise<{ type: string }> }) {
  const { type } = await ctx.params;
  if (!TYPES.includes(type as ExportType)) {
    return new Response("Jenis ekspor tidak dikenal", { status: 404 });
  }
  const { filename, csv } = await exportCsv(await db(), type as ExportType);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
