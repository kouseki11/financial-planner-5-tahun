import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Rp, StatusBadge } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GROUP_LABELS, METHOD_LABELS, type AllocationMethod, type GroupKey } from "@/lib/allocation";
import { formatMonthLabel, formatMonthShort, isValidMonthKey } from "@/lib/months";
import { ASSET_KIND_LABELS } from "@/lib/projection";
import { createCategoryAction, lockMonthAction, regenerateBudgetsAction, unlockMonthAction, updateCategoryRuleAction } from "@/server/actions/budget-actions";
import { db } from "@/server/bootstrap";
import { getCategoryRules, listBudgets } from "@/server/budget-service";
import { getCurrentPlanMonth } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anggaran" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const d = await db();
  const sp = await searchParams;
  const rules = await getCategoryRules(d);
  const budgets = await listBudgets(d);
  const currentMonth = await getCurrentPlanMonth(d);
  const selectedMonth = sp.bulan && isValidMonthKey(sp.bulan) ? sp.bulan : currentMonth;
  const selected = budgets.find((b) => b.month === selectedMonth) ?? null;
  const ruleName = (id: number) => rules.find((r) => r.id === id)?.name ?? `Kategori ${id}`;

  return (
    <>
      <PageHeader title="Anggaran bulanan" description="Aturan alokasi per kategori menentukan anggaran setiap bulan berdasarkan gaji efektif. Mengubah aturan hanya menghitung ulang bulan yang belum terkunci.">
        <ActionForm action={regenerateBudgetsAction} submitLabel="Hitung ulang bulan non-terkunci" variant="outline" size="sm" inline />
      </PageHeader>

      <Section title="Aturan alokasi" description="Prioritas kecil diproses lebih dulu. Metode: nominal tetap; persentase dari gaji; minimum + persentase dari sisa (sisa = gaji − nominal tetap − persentase − semua minimum).">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prioritas</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kelompok</TableHead>
                <TableHead>Aset</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Nominal / minimum</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Aktif</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell colSpan={9} className="p-2">
                    <ActionForm action={updateCategoryRuleAction} submitLabel="Simpan" size="sm" variant="outline" inline className="w-full">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="priority" type="number" defaultValue={r.priority} className="w-20" aria-label="Prioritas" />
                      <Input name="name" defaultValue={r.name} className="w-44" aria-label="Nama" />
                      <select name="groupKey" defaultValue={r.groupKey} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Kelompok">
                        {(Object.keys(GROUP_LABELS) as GroupKey[]).map((g) => (
                          <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                        ))}
                      </select>
                      <span className="w-28 text-xs text-muted-foreground">{r.assetKind ? ASSET_KIND_LABELS[r.assetKind] : "Pengeluaran"}</span>
                      <select name="method" defaultValue={r.method} className="h-8 rounded-md border bg-background px-2 text-sm" aria-label="Metode">
                        {(Object.keys(METHOD_LABELS) as AllocationMethod[]).map((m) => (
                          <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                        ))}
                      </select>
                      <Input name="fixedAmount" defaultValue={r.fixedAmount} inputMode="numeric" className="w-32" aria-label="Nominal" />
                      <Input name="percentBp" defaultValue={(r.percentBp / 100).toString()} inputMode="decimal" className="w-20" aria-label="Persen" />
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={r.isActive} /> aktif</label>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm underline">Tambah kategori baru</summary>
          <Card className="mt-2">
            <CardContent className="pt-6">
              <ActionForm action={createCategoryAction} submitLabel="Tambah" resetOnSuccess>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input name="name" placeholder="Nama kategori" required />
                  <select name="groupKey" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="fleksibel">
                    {(Object.keys(GROUP_LABELS) as GroupKey[]).map((g) => (
                      <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                    ))}
                  </select>
                  <select name="assetKind" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="">
                    <option value="">Pengeluaran (bukan aset)</option>
                    {(Object.keys(ASSET_KIND_LABELS) as Array<keyof typeof ASSET_KIND_LABELS>).map((k) => (
                      <option key={k} value={k}>{ASSET_KIND_LABELS[k]}</option>
                    ))}
                  </select>
                  <select name="method" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="fixed">
                    {(Object.keys(METHOD_LABELS) as AllocationMethod[]).map((m) => (
                      <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                  <Input name="fixedAmount" placeholder="Nominal / minimum" inputMode="numeric" defaultValue="0" />
                  <Input name="percentBp" placeholder="% (mis. 10)" inputMode="decimal" defaultValue="0" />
                  <Input name="priority" type="number" placeholder="Prioritas" defaultValue={100} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked /> Aktif</label>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </details>
      </Section>

      <Section title={`Detail ${formatMonthLabel(selectedMonth)}`} description="Snapshot anggaran bulan terpilih. Bulan terkunci menampilkan snapshot historis, bukan aturan terbaru.">
        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Gaji <Rp value={selected.salaryAmount} /> <StatusBadge status={selected.status} />
              </CardTitle>
              <CardDescription>
                Total alokasi <Rp value={selected.allocation.total} /> · {selected.allocation.status === "deficit" ? <>Defisit <Rp value={selected.allocation.deficit} className="text-red-600" /> — penyebab: {selected.allocation.deficitCauses.map((c) => c.name).join(", ")}</> : <>Sisa <Rp value={selected.allocation.remaining} /></>}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1fr_18rem]">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Rencana</TableHead>
                    <TableHead>Aturan saat snapshot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.items.map((i) => {
                    const snap = JSON.parse(i.ruleSnapshot) as { method: AllocationMethod; fixedAmount: number; percentBp: number; priority: number };
                    return (
                      <TableRow key={i.categoryId}>
                        <TableCell>{ruleName(i.categoryId)}</TableCell>
                        <TableCell className="text-right"><Rp value={i.plannedAmount} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{METHOD_LABELS[snap.method]} · {snap.method === "percent" ? `${snap.percentBp / 100} %` : `Rp${snap.fixedAmount.toLocaleString("id-ID")}${snap.method === "min_plus_percent" ? ` + ${snap.percentBp / 100} % sisa` : ""}`}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="space-y-3">
                {selected.status !== "locked" ? (
                  <ActionForm action={lockMonthAction} submitLabel="Kunci bulan ini (historis)" variant="default" confirmText={`Kunci ${formatMonthLabel(selected.month)}? Snapshot anggaran tidak akan dihitung ulang oleh perubahan gaji/aturan.`}>
                    <input type="hidden" name="month" value={selected.month} />
                    <Input name="reason" placeholder="Alasan (opsional)" />
                  </ActionForm>
                ) : (
                  <ActionForm action={unlockMonthAction} submitLabel="Buka kunci (koreksi historis)" variant="destructive" confirmText="Membuka kunci memungkinkan bulan ini dihitung ulang. Tindakan dicatat di audit log. Lanjutkan?">
                    <input type="hidden" name="month" value={selected.month} />
                    <Input name="reason" placeholder="Alasan koreksi (wajib)" required />
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="confirmed" required /> Saya mengonfirmasi koreksi data historis</label>
                  </ActionForm>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada anggaran untuk bulan ini.</p>
        )}
      </Section>

      <Section title="Semua bulan (60)" description="Klik bulan untuk melihat detail. Hijau = historis terkunci, kuning = bulan berjalan, biru = proyeksi.">
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gaji</TableHead>
                <TableHead className="text-right">Total alokasi</TableHead>
                <TableHead className="text-right">Sisa / defisit</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => (
                <TableRow key={b.month} className={b.month === selectedMonth ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Link href={`/anggaran?bulan=${b.month}`} className="underline-offset-2 hover:underline">{formatMonthShort(b.month)}</Link>
                    {b.month === currentMonth && <span className="ml-2 text-xs text-muted-foreground">(berjalan)</span>}
                  </TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-right"><Rp value={b.salaryAmount} /></TableCell>
                  <TableCell className="text-right"><Rp value={b.allocation.total} /></TableCell>
                  <TableCell className="text-right">{b.allocation.status === "deficit" ? <Rp value={-b.allocation.deficit} signed /> : <Rp value={b.allocation.remaining} />}</TableCell>
                  <TableCell>
                    {b.status !== "locked" && b.month <= currentMonth && (
                      <ActionForm action={lockMonthAction} submitLabel="Kunci" size="sm" variant="ghost" inline confirmText={`Kunci ${formatMonthLabel(b.month)}?`}>
                        <input type="hidden" name="month" value={b.month} />
                      </ActionForm>
                    )}
                    {b.status === "locked" && <Button asChild size="sm" variant="ghost"><Link href={`/anggaran?bulan=${b.month}`}>Detail</Link></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </>
  );
}
