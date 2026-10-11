"use client";

import { useActionState } from "react";
import { Rp, StatusBadge } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonthLabel } from "@/lib/months";
import type { ActionState } from "@/server/actions/helpers";
import { addSalaryChangeAction, previewSalaryChangeAction } from "@/server/actions/salary-actions";
import type { SalaryPreview } from "@/server/salary-service";
import { useHydrated } from "@/components/use-hydrated";

export function SalaryForm({ defaultMonth }: { defaultMonth: string }) {
  const [preview, previewAction, previewing] = useActionState<ActionState, FormData>(previewSalaryChangeAction, null);
  const [saved, saveAction, saving] = useActionState<ActionState, FormData>(addSalaryChangeAction, null);
  const p = preview?.ok ? (preview.data as SalaryPreview) : null;
  const hydrated = useHydrated();

  return (
    <form className="space-y-4" action={saveAction}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="amount">Gaji baru (Rp)</Label>
          <Input id="amount" name="amount" inputMode="numeric" placeholder="10.000.000" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="effectiveMonth">Bulan efektif</Label>
          <Input id="effectiveMonth" name="effectiveMonth" type="month" defaultValue={defaultMonth} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" className="h-9 w-full rounded-md border bg-background px-2 text-sm" defaultValue="planned">
            <option value="planned">Planned (rencana, belum pasti)</option>
            <option value="actual">Actual (sudah berlaku)</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="note">Catatan</Label>
        <Textarea id="note" name="note" placeholder="Kenaikan gaji / perubahan kontrak" rows={2} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" formAction={previewAction} variant="outline" disabled={previewing || !hydrated}>
          {previewing ? "Menghitung…" : "Preview dampak"}
        </Button>
        <Button type="submit" disabled={saving || !p || !hydrated}>
          {saving ? "Menyimpan…" : "Simpan perubahan gaji"}
        </Button>
        {!p && <span className="text-xs text-muted-foreground">Lihat preview dulu sebelum menyimpan.</span>}
        {preview && !preview.ok && <span className="text-sm text-red-600">{preview.message}</span>}
        {saved?.message && <span className={saved.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{saved.message}</span>}
      </div>

      {p && (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">Preview dampak</p>
          <p className="text-muted-foreground">
            Bulan pertama yang berubah: <strong>{p.impact.firstChangedMonth ? formatMonthLabel(p.impact.firstChangedMonth) : "tidak ada"}</strong>. Total pendapatan 5 tahun <Rp value={p.impact.totalBefore} /> → <Rp value={p.impact.totalAfter} /> (<Rp value={p.impact.totalDelta} signed />).
          </p>
          {p.lockedMonthsUnaffected.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Bulan terkunci yang TIDAK akan berubah: {p.lockedMonthsUnaffected.map(formatMonthLabel).join(", ")}.
            </p>
          )}
          {p.allocationBefore && p.allocationAfter && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium">Alokasi bulan efektif — sebelum (gaji <Rp value={p.allocationBefore.salary} />)</p>
                <AllocTable a={p.allocationBefore} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">Alokasi bulan efektif — sesudah (gaji <Rp value={p.allocationAfter.salary} />)</p>
                <AllocTable a={p.allocationAfter} />
                {p.allocationAfter.remaining > 0 && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Sisa <Rp value={p.allocationAfter.remaining} /> belum dialokasikan. Investasi tidak dinaikkan otomatis; pilih kebijakan kenaikan di bawah setelah menyimpan.
                  </p>
                )}
              </div>
            </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Rincian per bulan ({p.impact.rows.filter((r) => r.delta !== 0).length} bulan berubah)</summary>
            <Table className="mt-2 text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Bulan</TableHead>
                  <TableHead className="text-right">Sebelum</TableHead>
                  <TableHead className="text-right">Sesudah</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.impact.rows.map((r) => (
                  <TableRow key={r.month} className={r.delta !== 0 ? "bg-amber-50 dark:bg-amber-950/30" : ""}>
                    <TableCell>{formatMonthLabel(r.month)}</TableCell>
                    <TableCell className="text-right"><Rp value={r.before} /></TableCell>
                    <TableCell className="text-right"><Rp value={r.after} /></TableCell>
                    <TableCell className="text-right"><Rp value={r.delta} signed /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </div>
      )}
    </form>
  );
}

function AllocTable({ a }: { a: SalaryPreview["allocationAfter"] & object }) {
  return (
    <Table className="text-xs">
      <TableBody>
        {a.lines.map((l) => (
          <TableRow key={l.categoryId}>
            <TableCell>{l.name}</TableCell>
            <TableCell className="text-right"><Rp value={l.amount} /></TableCell>
          </TableRow>
        ))}
        <TableRow className="font-medium">
          <TableCell>Total</TableCell>
          <TableCell className="text-right"><Rp value={a.total} /></TableCell>
        </TableRow>
        <TableRow>
          <TableCell>{a.status === "deficit" ? "Defisit" : "Sisa"} <StatusBadge status={a.status === "deficit" ? "superseded" : "projected"} className="ml-1 hidden" /></TableCell>
          <TableCell className="text-right"><Rp value={a.status === "deficit" ? -a.deficit : a.remaining} /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
