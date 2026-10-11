import { Disclaimer } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight, InsightKind } from "@/lib/insights";
import { db } from "@/server/bootstrap";
import { getDashboardData } from "@/server/dashboard-service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financial Insights" };

const KIND_META: Record<InsightKind, { label: string; className: string; title: string }> = {
  positive: { label: "Positif", className: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", title: "Analisis positif" },
  negative: { label: "Negatif", className: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200", title: "Analisis negatif" },
  risk: { label: "Risiko", className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200", title: "Risiko" },
  recommendation: { label: "Rekomendasi", className: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200", title: "Rekomendasi perbaikan" },
  insufficient: { label: "Data belum memadai", className: "bg-muted text-muted-foreground", title: "Data belum memadai" },
};

const ORDER: InsightKind[] = ["insufficient", "positive", "negative", "risk", "recommendation"];

function InsightCard({ i }: { i: Insight }) {
  const meta = KIND_META[i.kind];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{i.title}</CardTitle>
          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
        </div>
        <CardDescription>Periode: {i.period}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{i.detail}</p>
        <dl className="grid gap-1 text-xs text-muted-foreground">
          <div><dt className="inline font-medium">Asumsi: </dt><dd className="inline">{i.assumptions}</dd></div>
          <div><dt className="inline font-medium">Keterbatasan: </dt><dd className="inline">{i.limitations}</dd></div>
        </dl>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          {i.actions.map((a, idx) => <li key={idx}>{a}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

export default async function InsightsPage() {
  const data = await getDashboardData(await db());
  const groups = ORDER.map((k) => ({ kind: k, items: data.insights.filter((i) => i.kind === k) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader title="Financial Insights" description="Analisis dihasilkan dari hasil kalkulasi aktual sistem: riwayat gaji, anggaran, realisasi, portofolio, dan proyeksi tiga skenario. Setiap insight menyebut angka, periode, asumsi, keterbatasan, dan saran praktis — bukan janji keuntungan." />
      <Disclaimer />
      <div className="mt-6">
        {groups.map((g) => (
          <Section key={g.kind} title={KIND_META[g.kind].title}>
            <div className="grid gap-3 lg:grid-cols-2">
              {g.items.map((i, idx) => <InsightCard key={idx} i={i} />)}
            </div>
          </Section>
        ))}
      </div>
    </>
  );
}
