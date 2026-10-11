import Link from "next/link";
import { AllocationChart, DepositsVsGainsChart, NetWorthChart, PlanVsActualChart, SalaryChart } from "@/components/charts";
import { Disclaimer, EmptyState, Pct, Rp, StatCard, StatusBadge } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSET_KIND_LABELS } from "@/lib/projection";
import { formatMonthLabel, formatMonthShort } from "@/lib/months";
import { db } from "@/server/bootstrap";
import { getDashboardData } from "@/server/dashboard-service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData(await db());
  const salaryNow = data.salarySeries.find((p) => p.month === data.currentMonth);
  const invested = data.netWorth.invested;
  const pnl = data.netWorth.investmentPnl;
  const emergency = data.byKind.emergency;
  const moderateFinal = data.finalByScenario.moderate ?? 0;
  const yearEndModerate = data.yearEnd.moderate?.[0];
  const goalEmergency = data.goals.find((g) => g.kind === "emergency");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            Bulan berjalan <strong>{formatMonthLabel(data.currentMonth)}</strong>. Data historis terkunci sampai {data.lastActualMonth ? formatMonthLabel(data.lastActualMonth) : "— (belum ada bulan terkunci)"}.
          </>
        }
      >
        <StatusBadge status="actual" />
        <StatusBadge status="planned" />
        <StatusBadge status="projected" />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard title="Gaji bulan berjalan" value={<Rp value={salaryNow?.amount ?? 0} />} hint={salaryNow?.status ? <StatusBadge status={salaryNow.status} /> : "Belum ada gaji"} />
        <StatCard title="Total pengeluaran (rencana)" value={<Rp value={data.expensesPlanned} />} hint="Kategori non-aset bulan berjalan" />
        <StatCard title="Total investasi (rencana)" value={<Rp value={data.investPlanned} />} hint="Saham + SOL + trading per bulan" />
        <StatCard title="Total tabungan (rencana)" value={<Rp value={data.savingsPlanned + data.emergencyPlanned} />} hint="Dana darurat + tabungan per bulan" />
        <StatCard title="Saldo dana darurat" value={<Rp value={emergency?.totalValue ?? 0} />} hint={goalEmergency?.target ? <>Target <Rp value={goalEmergency.target} /> · <Pct bp={goalEmergency.achievementBp} digits={0} /></> : "Target belum diatur"} />
        <StatCard
          title={data.deficit > 0 ? "Defisit anggaran" : "Sisa anggaran"}
          value={<Rp value={data.deficit > 0 ? data.deficit : data.remaining} />}
          tone={data.deficit > 0 ? "bad" : data.remaining > 0 ? "warn" : "good"}
          hint={data.deficit > 0 ? "Alokasi melebihi gaji" : data.remaining > 0 ? "Belum dialokasikan" : "Anggaran seimbang"}
        />
        <StatCard title="Total aset bersih" value={<Rp value={data.netWorth.total} />} hint={<>Kas/tabungan <Rp value={data.netWorth.cashLike} /> · Investasi <Rp value={invested} /></>} />
        <StatCard title="Akumulasi setoran investasi" value={<Rp value={data.netWorth.investedContribution} />} hint="Σ setoran − Σ penarikan (saham, SOL, trading)" />
        <StatCard title="Estimasi untung/rugi investasi" value={<Rp value={pnl} signed />} tone={pnl > 0 ? "good" : pnl < 0 ? "bad" : "neutral"} hint="Nilai aset berisiko − setoran bersih. Dana darurat tidak termasuk." />
        <StatCard title="Proyeksi akhir tahun 1" value={<Rp value={yearEndModerate?.netWorth ?? 0} />} hint={<>Skenario moderat, {yearEndModerate ? formatMonthLabel(yearEndModerate.month) : "—"}</>} />
        <StatCard title="Proyeksi akhir 5 tahun" value={<Rp value={moderateFinal} />} hint={<>Konservatif <Rp value={data.finalByScenario.conservative ?? 0} /> · Optimistis <Rp value={data.finalByScenario.optimistic ?? 0} /></>} />
        <StatCard title="Status target" value={`${data.goals.filter((g) => g.achievementBp !== null && g.achievementBp >= 10_000).length}/${data.goals.length}`} hint="Target tercapai (dana darurat, tabungan)" />
      </div>

      <Disclaimer />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perubahan gaji bulanan</CardTitle>
            <CardDescription>Gaji efektif per bulan dari riwayat tersimpan (planned ikut ditampilkan).</CardDescription>
          </CardHeader>
          <CardContent>
            <SalaryChart data={data.charts.salary} />
            <Table className="mt-3 text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Mulai</TableHead>
                  <TableHead className="text-right">Gaji</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.salaryChanges
                  .filter((c) => c.status !== "superseded")
                  .map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{formatMonthLabel(c.effectiveMonth)}</TableCell>
                      <TableCell className="text-right"><Rp value={c.amount} /></TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alokasi gaji {formatMonthShort(data.currentMonth)}</CardTitle>
            <CardDescription>Berdasarkan snapshot anggaran bulan berjalan.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.charts.allocation.length ? (
              <>
                <AllocationChart data={data.charts.allocation} />
                <Table className="mt-3 text-xs">
                  <TableBody>
                    {data.charts.allocation.map((a) => (
                      <TableRow key={a.name}>
                        <TableCell>{a.name}</TableCell>
                        <TableCell className="text-right"><Rp value={a.value} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-medium">
                      <TableCell>{data.deficit > 0 ? "Defisit" : "Sisa"}</TableCell>
                      <TableCell className="text-right"><Rp value={data.deficit > 0 ? -data.deficit : data.remaining} /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            ) : (
              <EmptyState title="Belum ada anggaran" description="Atur kategori di halaman Anggaran." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total aset bersih dari waktu ke waktu</CardTitle>
            <CardDescription>Tiga skenario asumsi. Bulan terkunci memakai nilai aktual.</CardDescription>
          </CardHeader>
          <CardContent>
            <NetWorthChart data={data.charts.netWorth} />
            <Table className="mt-3 text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Akhir tahun</TableHead>
                  <TableHead className="text-right">Konservatif</TableHead>
                  <TableHead className="text-right">Moderat</TableHead>
                  <TableHead className="text-right">Optimistis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.yearEnd.moderate ?? []).map((p, i) => (
                  <TableRow key={p.month}>
                    <TableCell>Tahun {i + 1} · {formatMonthShort(p.month)}</TableCell>
                    <TableCell className="text-right"><Rp value={data.yearEnd.conservative?.[i]?.netWorth ?? null} /></TableCell>
                    <TableCell className="text-right"><Rp value={p.netWorth} /></TableCell>
                    <TableCell className="text-right"><Rp value={data.yearEnd.optimistic?.[i]?.netWorth ?? null} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setoran vs estimasi keuntungan investasi</CardTitle>
            <CardDescription>Akumulasi per akhir tahun, skenario moderat. Keuntungan dipisahkan dari modal yang disetor.</CardDescription>
          </CardHeader>
          <CardContent>
            <DepositsVsGainsChart data={data.charts.depositsVsGains} />
            <Table className="mt-3 text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Tahun</TableHead>
                  <TableHead className="text-right">Setoran</TableHead>
                  <TableHead className="text-right">Untung/rugi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.charts.depositsVsGains.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right"><Rp value={r.deposits as number} /></TableCell>
                    <TableCell className="text-right"><Rp value={r.gains as number} signed /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Rencana vs realisasi pengeluaran</CardTitle>
            <CardDescription>Hanya bulan yang sudah memiliki realisasi.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.charts.planVsActual.length ? (
              <PlanVsActualChart data={data.charts.planVsActual} />
            ) : (
              <EmptyState title="Belum ada realisasi" description="Catat pengeluaran aktual di halaman Realisasi untuk melihat perbandingan.">
                <Link className="text-sm underline" href="/realisasi">Buka Realisasi</Link>
              </EmptyState>
            )}
          </CardContent>
        </Card>
      </div>

      <Section title="Status target keuangan" description="Saldo saat ini vs target; estimasi tanpa bunga berdasarkan setoran bulanan saat ini.">
        <div className="grid gap-3 sm:grid-cols-3">
          {data.goals.map((g) => (
            <Card key={g.kind} className="py-4">
              <CardHeader className="px-4">
                <CardDescription>{ASSET_KIND_LABELS[g.kind]}</CardDescription>
                <CardTitle className="text-lg"><Rp value={g.current} /></CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                {g.target ? (
                  <>
                    Target <Rp value={g.target} /> · <Pct bp={g.achievementBp} digits={0} /> · {g.monthsToTarget === 0 ? "tercapai" : g.monthsToTarget === null ? "tidak ada setoran" : `≈ ${g.monthsToTarget} bulan lagi`}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, (g.achievementBp ?? 0) / 100)}%` }} />
                    </div>
                  </>
                ) : (
                  "Target belum diatur"
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Insight terbaru" description="Ringkasan; detail lengkap di halaman Analisis." aside={<Link className="text-sm underline" href="/analisis">Lihat semua</Link>}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.insights.slice(0, 4).map((i, idx) => (
            <li key={idx} className="rounded-md border p-3 text-sm">
              <span className="mr-2 text-xs uppercase text-muted-foreground">{i.kind}</span>
              <span className="font-medium">{i.title}</span>
              <p className="mt-1 text-xs text-muted-foreground">{i.detail}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
