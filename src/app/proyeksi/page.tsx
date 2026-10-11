import { ActionForm } from "@/components/action-form";
import { AssetCompositionChart, NetWorthChart } from "@/components/charts";
import { Disclaimer, Rp } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonthLabel, formatMonthShort } from "@/lib/months";
import { ASSET_KINDS, ASSET_KIND_LABELS, ASSUMPTIONS_NOTE, compareScenarios, yearEndPoints } from "@/lib/projection";
import { updateScenarioAction } from "@/server/actions/scenario-actions";
import { db } from "@/server/bootstrap";
import { defaultSalarySimulations, getProjectionBundle, simulateSalaryScenarios } from "@/server/projection-service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proyeksi 5 Tahun" };

export default async function ProjectionPage() {
  const d = await db();
  const bundle = await getProjectionBundle(d);
  const moderate = bundle.results.find((r) => r.scenario.key === "moderate") ?? bundle.results[0];
  const rows = compareScenarios(bundle.results);
  const netWorthSeries = bundle.months.map((m, i) => ({
    label: formatMonthShort(m),
    conservative: bundle.results.find((r) => r.scenario.key === "conservative")?.months[i]?.netWorth ?? null,
    moderate: bundle.results.find((r) => r.scenario.key === "moderate")?.months[i]?.netWorth ?? null,
    optimistic: bundle.results.find((r) => r.scenario.key === "optimistic")?.months[i]?.netWorth ?? null,
  }));
  const composition = moderate.months.map((m) => {
    const o: { label: string; [k: string]: string | number } = { label: formatMonthShort(m.month) };
    for (const k of ASSET_KINDS) o[k] = m.assets[k].closing;
    return o;
  });
  const sims = await simulateSalaryScenarios(d, await defaultSalarySimulations(d), moderate.scenario);

  return (
    <>
      <PageHeader title="Proyeksi 60 bulan" description={ASSUMPTIONS_NOTE} />
      <Disclaimer />

      <Section title="Asumsi skenario (dapat diubah)" description="Return tahunan per kelas aset dalam persen; boleh negatif. Mengubah asumsi tidak mengubah transaksi atau realisasi.">
        <div className="grid gap-4 lg:grid-cols-3">
          {bundle.scenarios.map((s) => (
            <Card key={s.key}>
              <CardHeader>
                <CardTitle className="text-base">{s.name}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateScenarioAction} submitLabel="Simpan asumsi" size="sm">
                  <input type="hidden" name="key" value={s.key} />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Nama</Label><Input name="name" defaultValue={s.name} className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">Saham %/thn</Label><Input name="stockAnnualBp" defaultValue={s.stockAnnualBp / 100} inputMode="decimal" className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">SOL %/thn</Label><Input name="cryptoAnnualBp" defaultValue={s.cryptoAnnualBp / 100} inputMode="decimal" className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">Trading %/thn</Label><Input name="tradingAnnualBp" defaultValue={s.tradingAnnualBp / 100} inputMode="decimal" className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">Kas/tabungan %/thn</Label><Input name="cashAnnualBp" defaultValue={s.cashAnnualBp / 100} inputMode="decimal" className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">Inflasi %/thn</Label><Input name="inflationAnnualBp" defaultValue={s.inflationAnnualBp / 100} inputMode="decimal" className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">Batas rugi trading %</Label><Input name="tradingMaxLossBp" defaultValue={s.tradingMaxLossBp !== null ? s.tradingMaxLossBp / 100 : ""} inputMode="decimal" className="h-8" /></div>
                    <label className="col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" name="tradingProjectionEnabled" defaultChecked={s.tradingProjectionEnabled} /> Proyeksikan profit/loss trading (nonaktif = return 0)</label>
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Deskripsi asumsi</Label><Input name="description" defaultValue={s.description} className="h-8" /></div>
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Perbandingan skenario" description="Setoran identik di semua skenario; hanya asumsi return yang berbeda.">
        <Card>
          <CardContent className="pt-6">
            <NetWorthChart data={netWorthSeries} />
            <div className="mt-4 overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Skenario</TableHead>
                    <TableHead className="text-right">Total setoran</TableHead>
                    <TableHead className="text-right">Untung/rugi pasar</TableHead>
                    <TableHead className="text-right">Kas & tabungan akhir</TableHead>
                    <TableHead className="text-right">Investasi akhir</TableHead>
                    <TableHead className="text-right">Aset bersih akhir</TableHead>
                    <TableHead className="text-right">Nilai riil (inflasi)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right"><Rp value={r.deposits} /></TableCell>
                      <TableCell className="text-right"><Rp value={r.gains} signed /></TableCell>
                      <TableCell className="text-right"><Rp value={r.finalCashLike} /></TableCell>
                      <TableCell className="text-right"><Rp value={r.finalInvested} /></TableCell>
                      <TableCell className="text-right font-medium"><Rp value={r.finalNetWorth} /></TableCell>
                      <TableCell className="text-right"><Rp value={r.finalNetWorthReal} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Komposisi aset — skenario moderat" description="Nilai akhir setiap kelas aset per bulan. Bulan terkunci memakai nilai aktual.">
        <Card>
          <CardContent className="pt-6">
            <AssetCompositionChart data={composition} keys={[...ASSET_KINDS]} names={ASSET_KINDS.map((k) => ASSET_KIND_LABELS[k])} />
            <div className="mt-4 overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Akhir tahun</TableHead>
                    {ASSET_KINDS.map((k) => <TableHead key={k} className="text-right">{ASSET_KIND_LABELS[k]}</TableHead>)}
                    <TableHead className="text-right">Σ setoran</TableHead>
                    <TableHead className="text-right">Σ untung/rugi</TableHead>
                    <TableHead className="text-right">Aset bersih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearEndPoints(moderate).map((p, i) => (
                    <TableRow key={p.month}>
                      <TableCell>Tahun {i + 1} · {formatMonthShort(p.month)}</TableCell>
                      {ASSET_KINDS.map((k) => <TableCell key={k} className="text-right"><Rp value={p.assets[k].closing} /></TableCell>)}
                      <TableCell className="text-right"><Rp value={p.cumDeposits} /></TableCell>
                      <TableCell className="text-right"><Rp value={p.cumGains + p.cumIncome - p.cumFees} signed /></TableCell>
                      <TableCell className="text-right font-medium"><Rp value={p.netWorth} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Simulasi kenaikan gaji" description={`Proyeksi murni dari aturan kategori saat ini (skenario ${moderate.scenario.name}). Hanya bulan efektif ke depan yang mengikuti kenaikan; kebijakan kenaikan saat ini menentukan apakah selisih dialokasikan.`}>
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Skenario gaji</TableHead>
                <TableHead className="text-right">Total pendapatan</TableHead>
                <TableHead className="text-right">Total pengeluaran</TableHead>
                <TableHead className="text-right">Total setoran</TableHead>
                <TableHead className="text-right">Dana darurat akhir</TableHead>
                <TableHead className="text-right">Belum dialokasikan</TableHead>
                <TableHead className="text-right">Aset bersih akhir</TableHead>
                <TableHead className="text-right">Selisih vs baris 1</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sims.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right"><Rp value={r.totalIncome} /></TableCell>
                  <TableCell className="text-right"><Rp value={r.totalExpenses} /></TableCell>
                  <TableCell className="text-right"><Rp value={r.totalDeposits} /></TableCell>
                  <TableCell className="text-right"><Rp value={r.finalEmergency} /></TableCell>
                  <TableCell className="text-right"><Rp value={r.unallocated} /></TableCell>
                  <TableCell className="text-right font-medium"><Rp value={r.finalNetWorth} /></TableCell>
                  <TableCell className="text-right"><Rp value={r.deltaNetWorthVsFirst} signed /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Jika &quot;Belum dialokasikan&quot; besar, kenaikan gaji belum diarahkan ke tujuan. Terapkan kebijakan kenaikan di halaman Gaji.</p>
      </Section>

      <Section title="Tabel 60 bulan — skenario moderat" description={`Mulai ${formatMonthLabel(bundle.months[0])}; bulan aktual ditandai.`}>
        <details>
          <summary className="cursor-pointer text-sm underline">Tampilkan tabel lengkap</summary>
          <div className="mt-2 overflow-x-auto rounded-md border">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Gaji</TableHead>
                  <TableHead className="text-right">Pengeluaran</TableHead>
                  <TableHead className="text-right">Setoran</TableHead>
                  <TableHead className="text-right">Kas & tabungan</TableHead>
                  <TableHead className="text-right">Investasi</TableHead>
                  <TableHead className="text-right">Aset bersih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moderate.months.map((m) => (
                  <TableRow key={m.month} className={m.isActual ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""}>
                    <TableCell>{formatMonthShort(m.month)}</TableCell>
                    <TableCell>{m.isActual ? "Aktual" : "Proyeksi"}</TableCell>
                    <TableCell className="text-right"><Rp value={m.salary} /></TableCell>
                    <TableCell className="text-right"><Rp value={m.expenses} /></TableCell>
                    <TableCell className="text-right"><Rp value={m.totalContribution} /></TableCell>
                    <TableCell className="text-right"><Rp value={m.cashLike} /></TableCell>
                    <TableCell className="text-right"><Rp value={m.invested} /></TableCell>
                    <TableCell className="text-right"><Rp value={m.netWorth} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      </Section>
    </>
  );
}
