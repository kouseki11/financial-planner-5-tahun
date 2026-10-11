import { ActionForm } from "@/components/action-form";
import { Rp, StatusBadge } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RAISE_POLICY_LABELS, type RaisePolicy } from "@/lib/allocation";
import { formatMonthLabel } from "@/lib/months";
import { activeChanges } from "@/lib/salary";
import { applyRaisePolicyAction, confirmSalaryChangeAction, correctHistoricalSalaryAction, setRaisePolicyAction, supersedeSalaryChangeAction } from "@/server/actions/salary-actions";
import { db } from "@/server/bootstrap";
import { getSalaryChangesRaw } from "@/server/budget-service";
import { getCurrentPlanMonth, getRaisePolicy } from "@/server/settings";
import { SalaryForm } from "./salary-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Salary History" };

export default async function SalaryPage() {
  const d = await db();
  const changes = await getSalaryChangesRaw(d);
  const policy = await getRaisePolicy(d);
  const currentMonth = await getCurrentPlanMonth(d);
  const active = activeChanges(changes);
  const last = active[active.length - 1];
  const prev = active[active.length - 2];

  return (
    <>
      <PageHeader title="Salary History" description="Setiap perubahan gaji berlaku mulai bulan efektif yang dipilih. Bulan sebelumnya tetap memakai nominal dan alokasi yang tercatat. Perubahan baru tidak pernah menimpa catatan gaji aktual." />

      <Section title="Riwayat perubahan gaji">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Bulan efektif</TableHead>
                <TableHead className="text-right">Gaji</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead>Tanggal input</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((c) => (
                <TableRow key={c.id} className={c.status === "superseded" ? "text-muted-foreground" : ""}>
                  <TableCell>#{c.id}</TableCell>
                  <TableCell>{formatMonthLabel(c.effectiveMonth)}</TableCell>
                  <TableCell className="text-right"><Rp value={c.amount} /></TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="max-w-[16rem] truncate">{c.note ?? "—"}</TableCell>
                  <TableCell className="text-xs">{c.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {c.status === "planned" && (
                        <>
                          <ActionForm action={confirmSalaryChangeAction} submitLabel="Konfirmasi aktual" size="sm" variant="outline" inline>
                            <input type="hidden" name="id" value={c.id} />
                          </ActionForm>
                          <ActionForm action={supersedeSalaryChangeAction} submitLabel="Batalkan" size="sm" variant="ghost" inline confirmText="Batalkan rencana kenaikan ini? Catatan gaji aktual tidak akan berubah.">
                            <input type="hidden" name="id" value={c.id} />
                          </ActionForm>
                        </>
                      )}
                      {c.status === "actual" && (
                        <details>
                          <summary className="cursor-pointer text-xs underline">Koreksi historis</summary>
                          <ActionForm action={correctHistoricalSalaryAction} submitLabel="Simpan koreksi" size="sm" variant="destructive" className="mt-2 w-64" confirmText="Koreksi historis akan mengubah nominal gaji aktual ini dan dicatat di audit log. Bulan terkunci tidak dihitung ulang. Lanjutkan?">
                            <input type="hidden" name="id" value={c.id} />
                            <Input name="amount" placeholder="Nominal benar" inputMode="numeric" required />
                            <Input name="reason" placeholder="Alasan koreksi (wajib)" required />
                            <label className="flex items-center gap-2 text-xs">
                              <input type="checkbox" name="confirmed" required /> Saya memahami ini mengubah data historis
                            </label>
                          </ActionForm>
                        </details>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Tambah perubahan gaji" description="Gunakan status Planned untuk rencana yang belum pasti; konfirmasi menjadi Actual saat benar-benar berlaku.">
        <Card>
          <CardContent className="pt-6">
            <SalaryForm defaultMonth={currentMonth} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Kebijakan kenaikan gaji" description="Kenaikan gaji TIDAK otomatis menambah investasi. Pilih bagaimana selisih kenaikan diperlakukan, lalu terapkan secara eksplisit.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kebijakan default</CardTitle>
              <CardDescription>Disimpan sebagai preferensi; dipakai saat Anda menekan &quot;Terapkan&quot;.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={setRaisePolicyAction} submitLabel="Simpan kebijakan">
                {(Object.keys(RAISE_POLICY_LABELS) as RaisePolicy[]).map((k) => (
                  <label key={k} className="flex items-start gap-2 text-sm">
                    <input type="radio" name="policy" value={k} defaultChecked={policy === k} className="mt-1" />
                    <span>{RAISE_POLICY_LABELS[k]}</span>
                  </label>
                ))}
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Terapkan kebijakan ke aturan kategori</CardTitle>
              <CardDescription>Mengubah nominal kategori &quot;nominal tetap&quot; sesuai kebijakan, lalu menghitung ulang bulan yang belum terkunci.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={applyRaisePolicyAction} submitLabel="Terapkan" confirmText="Aturan kategori akan diubah dan bulan non-terkunci dihitung ulang. Lanjutkan?">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="oldSalary">Gaji lama</Label>
                    <Input id="oldSalary" name="oldSalary" defaultValue={prev?.amount ?? last?.amount ?? ""} inputMode="numeric" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="newSalary">Gaji baru</Label>
                    <Input id="newSalary" name="newSalary" defaultValue={last?.amount ?? ""} inputMode="numeric" required />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="policy2">Kebijakan</Label>
                  <select id="policy2" name="policy" defaultValue={policy} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                    {(Object.keys(RAISE_POLICY_LABELS) as RaisePolicy[]).map((k) => (
                      <option key={k} value={k}>{RAISE_POLICY_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </Section>
    </>
  );
}
