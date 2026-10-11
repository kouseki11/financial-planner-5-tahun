import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { EmptyState, Pct, Rp, StatCard } from "@/components/money";
import { PageHeader, Section } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssetKind } from "@/lib/allocation";
import { formatRupiah } from "@/lib/money";
import { QTY_E6, TX_TYPE_LABELS } from "@/lib/portfolio";
import { addTransactionAction, addValuationAction, deleteTransactionAction, updateAccountAction } from "@/server/actions/asset-actions";
import { getPortfolioSnapshot, listWatchlist } from "@/server/asset-service";
import { db } from "@/server/bootstrap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Investasi" };

const TABS: Array<{ key: string; kind: AssetKind; label: string }> = [
  { key: "saham", kind: "stock", label: "Saham" },
  { key: "sol", kind: "crypto", label: "Crypto SOL" },
  { key: "xauusd", kind: "trading", label: "Trading XAUUSD" },
];

function fmtQty(qE6: number) {
  return (qE6 / QTY_E6).toLocaleString("id-ID", { maximumFractionDigits: 6 });
}

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const d = await db();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const portfolio = await getPortfolioSnapshot(d);
  const watchlist = await listWatchlist(d);
  const acc = portfolio.accounts.find((a) => a.kind === tab.kind)!;
  const s = portfolio.byKind[tab.kind]!;
  const txs = portfolio.transactions.filter((t) => t.accountId === acc.id).slice().reverse();
  const today = new Date().toISOString().slice(0, 10);
  const isTrading = tab.kind === "trading";

  return (
    <>
      <PageHeader title="Investasi" description="Setoran modal, pembelian, dividen, biaya, dan harga pasar manual. Nilai pasar = kuantitas × harga terakhir yang Anda masukkan (dengan tanggal). Keuntungan selalu dipisahkan dari modal yang disetor.">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <Link key={t.key} href={`/investasi?tab=${t.key}`} className={`rounded-md border px-3 py-1.5 text-sm ${t.key === tab.key ? "bg-primary text-primary-foreground" : ""}`}>
              {t.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard title="Nilai total akun" value={<Rp value={s.totalValue} />} hint={<>Kas <Rp value={s.cash} /> + {isTrading ? "saldo" : "nilai pasar"} <Rp value={isTrading ? 0 : s.marketValue} /></>} />
        <StatCard title="Total setoran bersih" value={<Rp value={s.netContribution} />} hint={<>Setoran <Rp value={s.totalDeposits} /> · Penarikan <Rp value={s.totalWithdrawals} /></>} />
        <StatCard title="Total untung/rugi" value={<Rp value={s.totalReturn} signed />} tone={s.totalReturn > 0 ? "good" : s.totalReturn < 0 ? "bad" : "neutral"} hint={<>Return atas setoran <Pct bp={s.returnOnDepositsBp} /></>} />
        {isTrading ? (
          <StatCard title="Max drawdown" value={<Rp value={-s.maxDrawdown} signed />} tone={s.maxDrawdown > 0 ? "bad" : "neutral"} hint={<><Pct bp={s.maxDrawdownBp} /> dari puncak saldo · P/L terealisasi <Rp value={s.totalRealizedPnl} signed /> · biaya <Rp value={s.totalFees} /></>} />
        ) : (
          <StatCard title="Rincian" value={<Rp value={s.unrealizedPnl} signed />} hint={<>Belum terealisasi · Terealisasi <Rp value={s.totalRealizedPnl} signed /> · Dividen <Rp value={s.totalDividends} /> · Biaya <Rp value={s.totalFees} /></>} />
        )}
      </div>

      {isTrading && (
        <p className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Trading XAUUSD berisiko kehilangan sebagian atau seluruh modal. Setoran modal bukan profit. Batas kerugian akun: {acc.lossLimitBp !== null ? `${acc.lossLimitBp / 100} % dari setoran` : "belum diatur"}.
          {acc.lossLimitBp !== null && s.totalDeposits > 0 && s.totalReturn < 0 && Math.abs(s.totalReturn) * 10_000 >= acc.lossLimitBp * s.totalDeposits && <strong> Batas kerugian telah tercapai — pertimbangkan menghentikan setoran.</strong>}
        </p>
      )}

      {!isTrading && (
        <Section title="Posisi" description={s.valuationMissing ? "Ada posisi tanpa harga pasar; nilai sementara memakai modal beli. Masukkan harga terakhir." : "Harga pasar bertanda tanggal pembaruan."}>
          {s.positions.length ? (
            <div className="overflow-x-auto rounded-md border">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead className="text-right">Kuantitas</TableHead>
                    <TableHead className="text-right">Modal (termasuk fee)</TableHead>
                    <TableHead className="text-right">Rata-rata</TableHead>
                    <TableHead className="text-right">Harga terakhir</TableHead>
                    <TableHead className="text-right">Nilai pasar</TableHead>
                    <TableHead className="text-right">Belum terealisasi</TableHead>
                    <TableHead className="text-right">Terealisasi</TableHead>
                    <TableHead className="text-right">Dividen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.positions.map((p) => (
                    <TableRow key={p.symbol}>
                      <TableCell className="font-medium">{p.symbol}</TableCell>
                      <TableCell className="text-right">{fmtQty(p.quantityE6)}{tab.kind === "stock" && p.quantityE6 % (100 * QTY_E6) === 0 ? ` (${p.quantityE6 / (100 * QTY_E6)} lot)` : ""}</TableCell>
                      <TableCell className="text-right"><Rp value={p.costBasis} /></TableCell>
                      <TableCell className="text-right"><Rp value={p.avgCostPerUnit} /></TableCell>
                      <TableCell className="text-right">{p.lastPrice !== null ? <>{formatRupiah(p.lastPrice)}<br /><span className="text-xs text-muted-foreground">{p.lastPriceDate} · {p.priceSource === "manual" ? "manual" : "harga terakhir diketahui"}</span></> : <span className="text-xs text-amber-700">belum ada</span>}</TableCell>
                      <TableCell className="text-right"><Rp value={p.marketValue} /></TableCell>
                      <TableCell className="text-right"><Rp value={p.unrealizedPnl} signed /></TableCell>
                      <TableCell className="text-right"><Rp value={p.realizedPnl} signed /></TableCell>
                      <TableCell className="text-right"><Rp value={p.dividends} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState title="Belum ada posisi" description={tab.kind === "stock" ? `Watchlist: ${watchlist.map((w) => w.symbol).join(", ")}. Tidak wajib membeli setiap bulan; dana yang belum cukup untuk 1 lot tetap tersimpan sebagai kas dan dibawa ke bulan berikutnya.` : "Catat pembelian SOL pertama Anda."} />
          )}
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setoran / penarikan modal</CardTitle>
            <CardDescription>Kas akun bertambah/berkurang. Bukan profit.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={addTransactionAction} submitLabel="Catat" resetOnSuccess>
              <input type="hidden" name="accountId" value={acc.id} />
              <div className="grid gap-2 sm:grid-cols-3">
                <select name="type" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="deposit">
                  <option value="deposit">Setoran modal</option>
                  <option value="withdraw">Penarikan</option>
                  {isTrading && <option value="realized_pnl">Profit/Loss terealisasi (±)</option>}
                  <option value="fee">Biaya</option>
                  {!isTrading && <option value="dividend">Dividen / pendapatan</option>}
                </select>
                <Input name="tradeDate" type="date" defaultValue={today} required />
                <Input name="amount" placeholder="Nominal (loss pakai minus)" inputMode="numeric" required />
                {!isTrading && <Input name="symbol" placeholder="Kode (untuk dividen)" />}
              </div>
              <Input name="note" placeholder="Catatan" />
            </ActionForm>
          </CardContent>
        </Card>

        {!isTrading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Beli / jual {tab.kind === "stock" ? "saham" : "SOL"}</CardTitle>
              <CardDescription>{tab.kind === "stock" ? "Kuantitas dalam lembar (1 lot = 100 lembar). Sistem memeriksa saldo kas akun." : "Kuantitas boleh pecahan (mis. 0,25)."} Harga per {tab.kind === "stock" ? "lembar" : "SOL"} dalam rupiah.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={addTransactionAction} submitLabel="Catat transaksi" resetOnSuccess>
                <input type="hidden" name="accountId" value={acc.id} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <select name="type" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="buy">
                    <option value="buy">Beli</option>
                    <option value="sell">Jual</option>
                  </select>
                  <Input name="tradeDate" type="date" defaultValue={today} required />
                  {tab.kind === "stock" ? (
                    <select name="symbol" className="h-9 rounded-md border bg-background px-2 text-sm">
                      {watchlist.map((w) => (
                        <option key={w.symbol} value={w.symbol}>{w.symbol} — {w.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input name="symbol" defaultValue="SOL" required />
                  )}
                  <Input name="quantityE6" placeholder={tab.kind === "stock" ? "Lembar (mis. 100)" : "Jumlah SOL"} inputMode="decimal" required />
                  <Input name="pricePerUnit" placeholder="Harga per unit" inputMode="numeric" required />
                  <Input name="fee" placeholder="Biaya transaksi" inputMode="numeric" defaultValue="0" />
                </div>
                <p className="text-xs text-muted-foreground">Kas tersedia: <Rp value={s.cash} />. Bila kurang untuk 1 lot + biaya, biarkan dana tersimpan dan dibawa ke bulan berikutnya.</p>
              </ActionForm>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Batas kerugian</CardTitle>
              <CardDescription>Persentase dari total setoran. Saat tercapai, aplikasi menampilkan peringatan; proyeksi profit trading dapat dimatikan di halaman Proyeksi.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={updateAccountAction} submitLabel="Simpan">
                <input type="hidden" name="id" value={acc.id} />
                <input type="hidden" name="name" value={acc.name} />
                <input type="hidden" name="targetAmount" value="" />
                <input type="hidden" name="targetMonthsOfExpenses" value="" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Saldo awal</Label><Input name="openingBalance" defaultValue={acc.openingBalance} inputMode="numeric" /></div>
                  <div className="space-y-1"><Label className="text-xs">Batas rugi (%)</Label><Input name="lossLimitBp" defaultValue={acc.lossLimitBp !== null ? acc.lossLimitBp / 100 : ""} inputMode="decimal" /></div>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        )}

        {!isTrading && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Perbarui harga pasar (manual)</CardTitle>
              <CardDescription>Tidak ada data real-time. Masukkan harga terakhir yang Anda ketahui beserta tanggalnya.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={addValuationAction} submitLabel="Simpan harga" inline resetOnSuccess>
                <input type="hidden" name="accountId" value={acc.id} />
                {tab.kind === "stock" ? (
                  <select name="symbol" className="h-9 rounded-md border bg-background px-2 text-sm">
                    {watchlist.map((w) => (
                      <option key={w.symbol} value={w.symbol}>{w.symbol}</option>
                    ))}
                  </select>
                ) : (
                  <Input name="symbol" defaultValue="SOL" className="w-24" required />
                )}
                <Input name="asOfDate" type="date" defaultValue={today} className="w-40" required />
                <Input name="pricePerUnit" placeholder="Harga per unit" inputMode="numeric" className="w-40" required />
                <select name="source" className="h-9 rounded-md border bg-background px-2 text-sm" defaultValue="manual">
                  <option value="manual">Harga manual</option>
                  <option value="last_known">Harga terakhir diketahui</option>
                </select>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>

      <Section title="Riwayat transaksi" description={`${txs.length} transaksi`}>
        {txs.length ? (
          <div className="overflow-x-auto rounded-md border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead className="text-right">Kuantitas</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Biaya</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.tradeDate}</TableCell>
                    <TableCell>{TX_TYPE_LABELS[t.type]}</TableCell>
                    <TableCell>{t.symbol ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.quantityE6 !== null ? fmtQty(t.quantityE6) : "—"}</TableCell>
                    <TableCell className="text-right"><Rp value={t.pricePerUnit} /></TableCell>
                    <TableCell className="text-right"><Rp value={t.fee} /></TableCell>
                    <TableCell className="text-right">{t.type === "buy" || t.type === "sell" ? <Rp value={Math.round(((t.quantityE6 ?? 0) * (t.pricePerUnit ?? 0)) / QTY_E6)} /> : <Rp value={t.type === "withdraw" || t.type === "fee" ? -t.amount : t.amount} signed />}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">{t.note ?? ""}</TableCell>
                    <TableCell>
                      <ActionForm action={deleteTransactionAction} submitLabel="Hapus" size="sm" variant="ghost" inline confirmText="Hapus transaksi ini? Tercatat di audit log.">
                        <input type="hidden" name="id" value={t.id} />
                      </ActionForm>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title="Belum ada transaksi" />
        )}
      </Section>
    </>
  );
}
