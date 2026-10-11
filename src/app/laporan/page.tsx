import { ActionForm } from "@/components/action-form";
import { Pct, Rp, StatusBadge } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonthShort } from "@/lib/months";
import { ASSET_KIND_LABELS } from "@/lib/projection";
import type { AssetKind } from "@/lib/allocation";
import { restoreBackupAction } from "@/server/actions/report-actions";
import { listAuditLogs } from "@/server/audit";
import { db } from "@/server/bootstrap";
import { assetPerformanceReport, monthlyReport, salaryHistoryReport, yearlyReport } from "@/server/report-service";
import { getPlanPeriod } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Laporan & Ekspor" };

export default async function ReportPage() {
  const d = await db();
  const { start } = await getPlanPeriod(d);
  const monthly = await monthlyReport(d);
  const yearly = yearlyReport(monthly, start);
  const assets = await assetPerformanceReport(d);
  const salary = await salaryHistoryReport(d);
  const logs = await listAuditLogs(d, 50);
  const five = yearly.reduce(
    (a, y) => ({ income: a.income + y.income, plannedExpenses: a.plannedExpenses + y.plannedExpenses, actualExpenses: a.actualExpenses + y.actualExpenses, plannedContributions: a.plannedContributions + y.plannedContributions, actualDeposits: a.actualDeposits + y.actualDeposits }),
    { income: 0, plannedExpenses: 0, actualExpenses: 0, plannedContributions: 0, actualDeposits: 0 },
  );

  return (
    <>
      <PageHeader title="Laporan & ekspor" description="Semua laporan berasal dari data tersimpan yang sama dengan halaman lain. Ekspor CSV memakai angka yang ditampilkan.">
        {/* eslint-disable @next/next/no-html-link-for-pages -- route handler unduhan file, bukan halaman */}
        <Button asChild variant="outline" size="sm"><a href="/api/export/bulanan">CSV bulanan</a></Button>
        <Button asChild variant="outline" size="sm"><a href="/api/export/tahunan">CSV tahunan</a></Button>
        <Button asChild variant="outline" size="sm"><a href="/api/export/gaji">CSV riwayat gaji</a></Button>
        <Button asChild variant="outline" size="sm"><a href="/api/export/aset">CSV performa aset</a></Button>
        <Button asChild size="sm"><a href="/api/backup">Backup JSON</a></Button>
        {/* eslint-enable @next/next/no-html-link-for-pages */}
      </PageHeader>

      <Section title="Laporan 5 tahun" description="Ringkasan seluruh periode rencana.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Total pendapatan", five.income],
            ["Rencana pengeluaran", five.plannedExpenses],
            ["Realisasi pengeluaran", five.actualExpenses],
            ["Rencana setoran", five.plannedContributions],
            ["Realisasi setoran", five.actualDeposits],
          ].map(([label, v]) => (
            <Card key={label as string} className="py-4">
              <CardHeader className="px-4"><CardDescription className="text-xs">{label}</CardDescription><CardTitle className="text-lg"><Rp value={v as number} /></CardTitle></CardHeader>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Laporan tahunan">
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Tahun</TableHead>
                <TableHead className="text-right">Pendapatan</TableHead>
                <TableHead className="text-right">Rencana pengeluaran</TableHead>
                <TableHead className="text-right">Realisasi pengeluaran</TableHead>
                <TableHead className="text-right">Rencana setoran</TableHead>
                <TableHead className="text-right">Realisasi setoran</TableHead>
                <TableHead className="text-right">Bulan dgn realisasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearly.map((y) => (
                <TableRow key={y.year}>
                  <TableCell>{y.label}</TableCell>
                  <TableCell className="text-right"><Rp value={y.income} /></TableCell>
                  <TableCell className="text-right"><Rp value={y.plannedExpenses} /></TableCell>
                  <TableCell className="text-right"><Rp value={y.actualExpenses} /></TableCell>
                  <TableCell className="text-right"><Rp value={y.plannedContributions} /></TableCell>
                  <TableCell className="text-right"><Rp value={y.actualDeposits} /></TableCell>
                  <TableCell className="text-right">{y.monthsWithActuals}/12</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Laporan bulanan — rencana vs realisasi">
        <div className="max-h-[32rem] overflow-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gaji</TableHead>
                <TableHead className="text-right">Rencana pengeluaran</TableHead>
                <TableHead className="text-right">Realisasi pengeluaran</TableHead>
                <TableHead className="text-right">Rencana setoran</TableHead>
                <TableHead className="text-right">Realisasi setoran</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead className="text-right">Defisit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{formatMonthShort(m.month)}</TableCell>
                  <TableCell><StatusBadge status={m.status} /></TableCell>
                  <TableCell className="text-right"><Rp value={m.salary} /></TableCell>
                  <TableCell className="text-right"><Rp value={m.plannedExpenses} /></TableCell>
                  <TableCell className="text-right"><Rp value={m.actualExpenses} /></TableCell>
                  <TableCell className="text-right"><Rp value={m.plannedContributions} /></TableCell>
                  <TableCell className="text-right"><Rp value={m.actualDeposits} /></TableCell>
                  <TableCell className="text-right"><Rp value={m.remaining} /></TableCell>
                  <TableCell className="text-right">{m.deficit > 0 ? <Rp value={m.deficit} className="text-red-600" /> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Performa per aset" description="Nilai total = kas + nilai pasar. Return = (nilai total − saldo awal − setoran bersih) / setoran.">
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Aset</TableHead>
                <TableHead className="text-right">Setoran</TableHead>
                <TableHead className="text-right">Penarikan</TableHead>
                <TableHead className="text-right">Kas</TableHead>
                <TableHead className="text-right">Nilai pasar</TableHead>
                <TableHead className="text-right">Nilai total</TableHead>
                <TableHead className="text-right">Untung/rugi</TableHead>
                <TableHead className="text-right">Return</TableHead>
                <TableHead className="text-right">Biaya</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => (
                <TableRow key={a.kind}>
                  <TableCell>{ASSET_KIND_LABELS[a.kind as AssetKind]}</TableCell>
                  <TableCell className="text-right"><Rp value={a.totalDeposits} /></TableCell>
                  <TableCell className="text-right"><Rp value={a.totalWithdrawals} /></TableCell>
                  <TableCell className="text-right"><Rp value={a.cash} /></TableCell>
                  <TableCell className="text-right"><Rp value={a.marketValue} /></TableCell>
                  <TableCell className="text-right font-medium"><Rp value={a.totalValue} /></TableCell>
                  <TableCell className="text-right"><Rp value={a.totalReturn} signed /></TableCell>
                  <TableCell className="text-right"><Pct bp={a.returnOnDepositsBp} /></TableCell>
                  <TableCell className="text-right"><Rp value={a.totalFees} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Riwayat perubahan gaji">
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow><TableHead>ID</TableHead><TableHead>Bulan efektif</TableHead><TableHead className="text-right">Gaji</TableHead><TableHead>Status</TableHead><TableHead>Catatan</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {salary.map((s) => (
                <TableRow key={s.id}><TableCell>#{s.id}</TableCell><TableCell>{s.label}</TableCell><TableCell className="text-right"><Rp value={s.amount} /></TableCell><TableCell><StatusBadge status={s.status} /></TableCell><TableCell>{s.note ?? "—"}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Backup & restore" description="Backup JSON berisi seluruh tabel. Restore MENGGANTI semua data saat ini dalam satu transaksi dan dicatat di audit log.">
        <Card>
          <CardContent className="pt-6">
            <ActionForm action={restoreBackupAction} submitLabel="Restore dari file" variant="destructive" confirmText="Restore akan menghapus seluruh data saat ini dan menggantinya dengan isi file. Pastikan Anda sudah mengunduh backup terbaru. Lanjutkan?">
              <Input type="file" name="file" accept="application/json,.json" required />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmed" required /> Saya memahami restore mengganti seluruh data</label>
            </ActionForm>
          </CardContent>
        </Card>
      </Section>

      <Section title="Audit log" description="50 perubahan penting terakhir.">
        <div className="max-h-[24rem] overflow-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow><TableHead>Waktu</TableHead><TableHead>Entitas</TableHead><TableHead>ID</TableHead><TableHead>Aksi</TableHead><TableHead>Alasan</TableHead><TableHead>Perubahan</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap">{l.createdAt.replace("T", " ").slice(0, 19)}</TableCell>
                  <TableCell>{l.entity}</TableCell>
                  <TableCell>{l.entityId ?? "—"}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell className="max-w-[12rem] truncate">{l.reason ?? "—"}</TableCell>
                  <TableCell className="max-w-[20rem] truncate font-mono text-[10px] text-muted-foreground">{l.beforeJson ? `${l.beforeJson} → ` : ""}{l.afterJson ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </>
  );
}
