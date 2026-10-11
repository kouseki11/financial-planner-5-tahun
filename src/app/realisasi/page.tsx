import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Pct, Rp, StatusBadge } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonthLabel, formatMonthShort, isValidMonthKey, monthRange } from "@/lib/months";
import { monthsToTarget, TX_TYPE_LABELS } from "@/lib/portfolio";
import { ASSET_KIND_LABELS } from "@/lib/projection";
import { upsertMonthActualsAction } from "@/server/actions/actuals-actions";
import { addTransactionAction, deleteTransactionAction, updateAccountAction } from "@/server/actions/asset-actions";
import { planVsActual } from "@/server/actuals-service";
import { getPortfolioSnapshot } from "@/server/asset-service";
import { db } from "@/server/bootstrap";
import { getCurrentPlanMonth, getPlanPeriod } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Realisasi" };

const CASH_KINDS = ["emergency", "savings_personal", "savings_wedding"] as const;

export default async function ActualsPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const d = await db();
  const sp = await searchParams;
  const currentMonth = await getCurrentPlanMonth(d);
  const { start } = await getPlanPeriod(d);
  const month = sp.bulan && isValidMonthKey(sp.bulan) ? sp.bulan : currentMonth;
  const pva = await planVsActual(d);
  const selected = pva.find((m) => m.month === month) ?? null;
  const portfolio = await getPortfolioSnapshot(d);
  const months = monthRange(start, currentMonth);
  const mandatory = selected?.lines.filter((l) => l.groupKey === "wajib").reduce((s, l) => s + l.planned, 0) ?? 0;

  return (
    <>
      <PageHeader title="Realisasi" description="Catat pengeluaran aktual per kategori dan setoran/penarikan tabungan. Realisasi tidak pernah diubah oleh perubahan gaji atau asumsi proyeksi." />

      <Section title="Pilih bulan" description="Bulan dari awal periode sampai bulan berjalan.">
        <div className="flex flex-wrap gap-1">
          {months.map((m) => {
            const row = pva.find((p) => p.month === m);
            return (
              <Link key={m} href={`/realisasi?bulan=${m}`} className={`rounded-md border px-2 py-1 text-xs ${m === month ? "bg-primary text-primary-foreground" : row?.hasActuals ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : ""}`}>
                {formatMonthShort(m)}
              </Link>
            );
          })}
        </div>
      </Section>

      <Section title={`Pengeluaran ${formatMonthLabel(month)}`} description="Isi nominal realisasi untuk kategori pengeluaran. Setoran aset dicatat di bagian tabungan/investasi agar tidak dihitung dua kali.">
        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Gaji <Rp value={selected.salary} /> <StatusBadge status={selected.status} />
              </CardTitle>
              <CardDescription>
                Rencana pengeluaran <Rp value={selected.plannedExpenses} /> · Realisasi <Rp value={selected.actualExpenses} /> · Selisih <Rp value={selected.actualExpenses - selected.plannedExpenses} signed />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={upsertMonthActualsAction} submitLabel="Simpan realisasi" confirmText={selected.status === "locked" ? "Bulan ini terkunci. Perubahan dicatat sebagai koreksi historis di audit log. Lanjutkan?" : undefined}>
                <input type="hidden" name="month" value={month} />
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Rencana</TableHead>
                      <TableHead className="w-44">Realisasi</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.lines
                      .filter((l) => !l.assetKind)
                      .map((l) => (
                        <TableRow key={l.categoryId}>
                          <TableCell>{l.name}</TableCell>
                          <TableCell className="text-right"><Rp value={l.planned} /></TableCell>
                          <TableCell><Input name={`actual_${l.categoryId}`} defaultValue={l.actual ?? ""} placeholder="—" inputMode="numeric" className="h-8" /></TableCell>
                          <TableCell className="text-right"><Rp value={l.variance} signed /></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {selected.status === "locked" && (
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950">
                    <p>Bulan terkunci: koreksi memerlukan konfirmasi dan alasan.</p>
                    <Input name="reason" placeholder="Alasan koreksi (wajib)" />
                    <label className="flex items-center gap-2"><input type="checkbox" name="confirmHistorical" /> Saya mengonfirmasi koreksi data historis</label>
                  </div>
                )}
              </ActionForm>
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Belum ada anggaran untuk bulan ini" />
        )}
      </Section>

      <Section title="Dana darurat & tabungan" description="Saldo = saldo awal + setoran − penarikan. Tanpa bunga kecuali diatur di skenario. Dana darurat terpisah dari aset berisiko dan tidak dihitung sebagai keuntungan investasi.">
        <div className="grid gap-4 lg:grid-cols-3">
          {CASH_KINDS.map((kind) => {
            const acc = portfolio.accounts.find((a) => a.kind === kind);
            const s = portfolio.byKind[kind];
            if (!acc || !s) return null;
            const monthly = selected?.lines.find((l) => l.assetKind === kind)?.planned ?? 0;
            const target = kind === "emergency" && acc.targetMonthsOfExpenses ? acc.targetMonthsOfExpenses * mandatory : acc.targetAmount;
            const n = target ? monthsToTarget(s.totalValue, target, monthly) : null;
            const txs = portfolio.transactions.filter((t) => t.accountId === acc.id).slice(-6).reverse();
            return (
              <Card key={kind}>
                <CardHeader>
                  <CardDescription>{ASSET_KIND_LABELS[kind]}</CardDescription>
                  <CardTitle className="text-xl"><Rp value={s.totalValue} /></CardTitle>
                  <CardDescription>
                    {target ? <>Target <Rp value={target} /> · <Pct bp={Math.round((s.totalValue / target) * 10_000)} digits={0} /> · {n === 0 ? "tercapai" : n === null ? "belum ada setoran bulanan" : `≈ ${n} bulan`}</> : "Target belum diatur"}
                    <br />Setoran <Rp value={s.totalDeposits} /> · Penarikan <Rp value={s.totalWithdrawals} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ActionForm action={addTransactionAction} submitLabel="Catat" size="sm" inline resetOnSuccess>
                    <input type="hidden" name="accountId" value={acc.id} />
                    <select name="type" className="h-8 rounded-md border bg-background px-2 text-sm" defaultValue="deposit">
                      <option value="deposit">Setoran</option>
                      <option value="withdraw">Penarikan</option>
                    </select>
                    <Input name="tradeDate" type="date" defaultValue={`${month}-25`} className="h-8 w-36" required />
                    <Input name="amount" placeholder={monthly ? monthly.toString() : "Nominal"} inputMode="numeric" className="h-8 w-32" required />
                  </ActionForm>
                  <details>
                    <summary className="cursor-pointer text-xs underline">Pengaturan akun (saldo awal, target)</summary>
                    <ActionForm action={updateAccountAction} submitLabel="Simpan" size="sm" variant="outline" className="mt-2">
                      <input type="hidden" name="id" value={acc.id} />
                      <input type="hidden" name="name" value={acc.name} />
                      <input type="hidden" name="lossLimitBp" value="" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1"><Label className="text-xs">Saldo awal</Label><Input name="openingBalance" defaultValue={acc.openingBalance} inputMode="numeric" className="h-8" /></div>
                        <div className="space-y-1"><Label className="text-xs">Target nominal</Label><Input name="targetAmount" defaultValue={acc.targetAmount ?? ""} inputMode="numeric" className="h-8" /></div>
                        {kind === "emergency" && (
                          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Target = N × pengeluaran wajib (<Rp value={mandatory} />/bulan)</Label><Input name="targetMonthsOfExpenses" type="number" defaultValue={acc.targetMonthsOfExpenses ?? ""} className="h-8" /></div>
                        )}
                        {kind !== "emergency" && <input type="hidden" name="targetMonthsOfExpenses" value="" />}
                      </div>
                    </ActionForm>
                  </details>
                  {txs.length > 0 && (
                    <Table className="text-xs">
                      <TableBody>
                        {txs.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell>{t.tradeDate}</TableCell>
                            <TableCell>{TX_TYPE_LABELS[t.type]}</TableCell>
                            <TableCell className="text-right"><Rp value={t.type === "withdraw" ? -t.amount : t.amount} signed /></TableCell>
                            <TableCell>
                              <ActionForm action={deleteTransactionAction} submitLabel="×" size="sm" variant="ghost" inline confirmText="Hapus transaksi ini? Tercatat di audit log.">
                                <input type="hidden" name="id" value={t.id} />
                              </ActionForm>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}
