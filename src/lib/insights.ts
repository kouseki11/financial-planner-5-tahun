import type { AllocationResult } from "./allocation";
import { formatBp, formatRupiah } from "./money";
import { formatMonthLabel, monthDiff, type MonthKey } from "./months";
import { monthsToTarget, type AccountSummary, type NetWorthSummary } from "./portfolio";
import type { ProjectionResult } from "./projection";
import type { SalaryPoint } from "./salary";

export type InsightKind = "positive" | "negative" | "risk" | "recommendation" | "insufficient";

export interface Insight {
  kind: InsightKind;
  title: string;
  /** Penjelasan dengan angka pendukung. */
  detail: string;
  period: string;
  assumptions: string;
  limitations: string;
  actions: string[];
}

export interface InsightInput {
  periodStart: MonthKey;
  periodEnd: MonthKey;
  currentMonth: MonthKey;
  salary: SalaryPoint[];
  currentAllocation: AllocationResult | null;
  results: ProjectionResult[]; // konservatif, moderat, optimistis (urutan bebas; dicari per key)
  summaries: AccountSummary[];
  netWorth: NetWorthSummary;
  planVsActual: Array<{ month: MonthKey; status: string; hasActuals: boolean; plannedExpenses: number; actualExpenses: number; plannedTotal: number; actualTotal: number }>;
  emergencyTarget: number | null;
  monthlyMandatoryExpenses: number;
}

const DISCLAIMER = "Semua proyeksi memakai asumsi return yang Anda tetapkan sendiri; bukan data pasar dan bukan jaminan hasil.";

export function generateInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const period = `${formatMonthLabel(input.periodStart)} – ${formatMonthLabel(input.periodEnd)}`;
  const byKey = Object.fromEntries(input.results.map((r) => [r.scenario.key, r]));
  const cons = byKey.conservative;
  const mod = byKey.moderate;
  const opt = byKey.optimistic;

  const actualMonths = input.planVsActual.filter((m) => m.hasActuals);
  if (actualMonths.length === 0) {
    out.push({
      kind: "insufficient",
      title: "Belum ada realisasi yang dicatat",
      detail: "Analisis rencana vs realisasi (konsistensi setoran, kenaikan pengeluaran) belum dapat dibuat karena belum ada data realisasi bulanan.",
      period,
      assumptions: "—",
      limitations: "Insight di bawah hanya berdasarkan rencana dan asumsi, bukan perilaku nyata.",
      actions: ["Catat realisasi pengeluaran dan setoran untuk bulan berjalan di halaman Realisasi."],
    });
  }

  // Pendapatan meningkat
  const first = input.salary[0];
  const changes = input.salary.filter((p, i) => i > 0 && p.amount !== input.salary[i - 1].amount);
  if (first && changes.length) {
    const c = changes[0];
    const delta = c.amount - first.amount;
    const isPlanned = c.status === "planned";
    out.push({
      kind: delta > 0 ? "positive" : "negative",
      title: delta > 0 ? "Pendapatan meningkat sehingga ruang menabung bertambah" : "Pendapatan turun",
      detail: `Gaji ${formatRupiah(first.amount)} berubah menjadi ${formatRupiah(c.amount)} mulai ${formatMonthLabel(c.month)} (${delta > 0 ? "+" : ""}${formatRupiah(delta)}/bulan). ${isPlanned ? "Status perubahan ini masih PLANNED (belum terkonfirmasi)." : "Perubahan ini berstatus aktual."}${input.currentAllocation && input.currentAllocation.remaining > 0 ? ` Saat ini ${formatRupiah(input.currentAllocation.remaining)} belum dialokasikan.` : ""}`,
      period,
      assumptions: isPlanned ? "Kenaikan dianggap terjadi sesuai rencana." : "Berdasarkan riwayat gaji tersimpan.",
      limitations: isPlanned ? "Jika kenaikan tidak terjadi, seluruh proyeksi setelah bulan efektif terlalu tinggi." : "Kenaikan berikutnya tidak diasumsikan.",
      actions: ["Tentukan kebijakan kenaikan (manual, proporsional, atau ke dana darurat) di halaman Gaji agar sisa tidak menganggur."],
    });
  } else if (first) {
    out.push({
      kind: "risk",
      title: "Tidak ada kenaikan gaji yang direncanakan",
      detail: `Gaji diasumsikan tetap ${formatRupiah(first.amount)} selama ${input.salary.length} bulan. Total pendapatan ${formatRupiah(input.salary.reduce((s, p) => s + p.amount, 0))}.`,
      period,
      assumptions: "Gaji konstan sepanjang periode.",
      limitations: "Inflasi akan menurunkan daya beli gaji yang tetap.",
      actions: ["Tambahkan rencana kenaikan gaji (status planned) bila ada ekspektasi, dan bandingkan dampaknya di halaman Proyeksi."],
    });
  }

  // Dana darurat
  const emergency = input.summaries.find((s) => s.kind === "emergency");
  const monthlyEmergency = input.currentAllocation?.lines.find((l) => l.assetKind === "emergency")?.amount ?? 0;
  if (emergency && input.emergencyTarget && input.emergencyTarget > 0) {
    const n = monthsToTarget(emergency.totalValue, input.emergencyTarget, monthlyEmergency);
    const pct = formatBp(Math.round((emergency.totalValue / input.emergencyTarget) * 10_000), 0);
    out.push({
      kind: n !== null && n <= 24 ? "positive" : "risk",
      title: n === 0 ? "Dana darurat sudah mencapai target" : n !== null && n <= 24 ? "Dana darurat berada di jalur mencapai target" : "Dana darurat membutuhkan waktu lama",
      detail: `Saldo dana darurat ${formatRupiah(emergency.totalValue)} dari target ${formatRupiah(input.emergencyTarget)} (${pct}). Setoran ${formatRupiah(monthlyEmergency)}/bulan → ${n === null ? "target tidak tercapai tanpa setoran" : n === 0 ? "sudah tercapai" : `sekitar ${n} bulan lagi`}.`,
      period: `Per ${formatMonthLabel(input.currentMonth)}`,
      assumptions: `Target = ${input.monthlyMandatoryExpenses > 0 ? `kelipatan pengeluaran wajib ${formatRupiah(input.monthlyMandatoryExpenses)}/bulan` : "nominal yang Anda tetapkan"}; tanpa bunga; setoran konsisten.`,
      limitations: "Pengeluaran mendadak atau setoran terhenti akan memperlambat pencapaian.",
      actions: n !== null && n > 24 ? ["Pertimbangkan menaikkan setoran dana darurat sebelum menambah porsi aset berisiko."] : ["Setelah target tercapai, kelebihan setoran dapat dialihkan ke tabungan atau investasi sesuai prioritas."],
    });
  }

  // Konsistensi & kenaikan pengeluaran
  if (actualMonths.length > 0) {
    const over = actualMonths.filter((m) => m.actualExpenses > m.plannedExpenses);
    const totalOver = over.reduce((s, m) => s + (m.actualExpenses - m.plannedExpenses), 0);
    if (over.length) {
      out.push({
        kind: "negative",
        title: "Kenaikan pengeluaran mengurangi kemampuan investasi",
        detail: `${over.length} dari ${actualMonths.length} bulan dengan realisasi melebihi rencana pengeluaran, total ${formatRupiah(totalOver)}. Dana ini seharusnya tersedia untuk tabungan/investasi.`,
        period: `${formatMonthLabel(actualMonths[0].month)} – ${formatMonthLabel(actualMonths[actualMonths.length - 1].month)}`,
        assumptions: "Pengeluaran = realisasi kategori non-aset.",
        limitations: "Realisasi yang belum dicatat lengkap membuat perbandingan bias.",
        actions: ["Tinjau kategori yang paling sering melebihi rencana dan sesuaikan nominalnya atau pengeluarannya."],
      });
    } else {
      out.push({
        kind: "positive",
        title: "Pengeluaran terkendali sesuai rencana",
        detail: `Seluruh ${actualMonths.length} bulan dengan realisasi tidak melebihi rencana pengeluaran.`,
        period: `${formatMonthLabel(actualMonths[0].month)} – ${formatMonthLabel(actualMonths[actualMonths.length - 1].month)}`,
        assumptions: "Pengeluaran = realisasi kategori non-aset.",
        limitations: "Jumlah bulan masih sedikit bila baru mulai.",
        actions: ["Pertahankan pencatatan bulanan agar tren tetap terpantau."],
      });
    }
  }

  // Diversifikasi
  if (input.currentAllocation) {
    const risky = input.currentAllocation.lines.filter((l) => l.assetKind === "stock" || l.assetKind === "crypto" || l.assetKind === "trading");
    const totalRisky = risky.reduce((s, l) => s + l.amount, 0);
    if (totalRisky > 0) {
      const max = risky.reduce((a, b) => (b.amount > a.amount ? b : a));
      const share = Math.round((max.amount / totalRisky) * 10_000);
      const volatile = risky.filter((l) => l.assetKind === "crypto" || l.assetKind === "trading").reduce((s, l) => s + l.amount, 0);
      out.push({
        kind: share <= 5000 ? "positive" : "risk",
        title: share <= 5000 ? "Setoran investasi terdiversifikasi" : `Setoran investasi terkonsentrasi di ${max.name}`,
        detail: `Setoran bulanan ke aset berisiko ${formatRupiah(totalRisky)}; porsi terbesar ${max.name} ${formatBp(share, 0)}. Porsi SOL + trading XAUUSD ${formatBp(Math.round((volatile / totalRisky) * 10_000), 0)} dari setoran berisiko.`,
        period: `Alokasi ${formatMonthLabel(input.currentMonth)}`,
        assumptions: "Diversifikasi diukur dari setoran, bukan nilai pasar.",
        limitations: "Diversifikasi mengurangi ketergantungan pada satu aset, tidak menghilangkan risiko kerugian.",
        actions: volatile / totalRisky > 0.5 ? ["Pertimbangkan membatasi porsi aset volatil (SOL, trading) agar kerugian besar tidak menggagalkan target."] : ["Tinjau porsi setiap 6 bulan."],
      });
    }
  }

  // Skenario pasar negatif
  if (cons && mod && opt) {
    const consInvested = cons.totals.finalInvested;
    const investedDeposits = cons.totals.investedDeposits;
    out.push({
      kind: consInvested < investedDeposits ? "negative" : "risk",
      title: "Penurunan pasar dapat membuat nilai investasi lebih rendah dari modal",
      detail: `Skenario konservatif: total setoran ke saham/SOL/trading ${formatRupiah(investedDeposits)} diproyeksikan bernilai ${formatRupiah(consInvested)} di akhir periode (${consInvested < investedDeposits ? "rugi" : "laba"} ${formatRupiah(Math.abs(consInvested - investedDeposits))}). Skenario moderat ${formatRupiah(mod.totals.finalInvested)}, optimistis ${formatRupiah(opt.totals.finalInvested)}.`,
      period,
      assumptions: `Konservatif: saham ${formatBp(cons.scenario.stockAnnualBp, 0)}, SOL ${formatBp(cons.scenario.cryptoAnnualBp, 0)}, trading ${cons.scenario.tradingProjectionEnabled ? formatBp(cons.scenario.tradingAnnualBp, 0) : "0 % (dimatikan)"} per tahun. ${DISCLAIMER}`,
      limitations: "Return tahunan konstan tidak mencerminkan volatilitas nyata; kerugian bisa lebih besar.",
      actions: ["Pastikan dana darurat terpisah dari aset berisiko agar penurunan pasar tidak memaksa menjual rugi."],
    });

    out.push({
      kind: "risk",
      title: "SOL dan trading XAUUSD memiliki risiko kerugian tinggi",
      detail: `Setoran ke SOL ${formatRupiah(mod.final?.assets.crypto.cumDeposits ?? 0)} dan trading ${formatRupiah(mod.final?.assets.trading.cumDeposits ?? 0)} selama periode. Pada skenario konservatif nilai akhir SOL ${formatRupiah(cons.final?.assets.crypto.closing ?? 0)} dan trading ${formatRupiah(cons.final?.assets.trading.closing ?? 0)}. Sebagian atau seluruh modal trading bisa hilang.`,
      period,
      assumptions: `Batas rugi trading ${cons.scenario.tradingMaxLossBp === null ? "tidak diatur" : formatBp(cons.scenario.tradingMaxLossBp, 0) + " dari setoran"}. ${DISCLAIMER}`,
      limitations: "Proyeksi tidak memodelkan kejadian ekstrem (margin call, delisting, kegagalan platform).",
      actions: ["Tetapkan batas kerugian trading dan hentikan setoran jika tercapai.", "Jangan menambah modal trading dari dana darurat."],
    });

    const gap = opt.totals.finalNetWorth - cons.totals.finalNetWorth;
    out.push({
      kind: "risk",
      title: "Proyeksi optimistis dapat memberikan ekspektasi tidak realistis",
      detail: `Selisih aset bersih akhir antara skenario optimistis (${formatRupiah(opt.totals.finalNetWorth)}) dan konservatif (${formatRupiah(cons.totals.finalNetWorth)}) sebesar ${formatRupiah(gap)}. Gunakan skenario konservatif/moderat untuk menetapkan target.`,
      period,
      assumptions: DISCLAIMER,
      limitations: "Ketiga skenario adalah ilustrasi; hasil nyata bisa di luar rentang tersebut.",
      actions: ["Rencanakan komitmen (misal tanggal nikah) berdasarkan tabungan tanpa return, bukan hasil investasi."],
    });

    const real = mod.totals.finalNetWorthReal;
    const nominal = mod.totals.finalNetWorth;
    if (mod.scenario.inflationAnnualBp > 0 && nominal > 0) {
      out.push({
        kind: "negative",
        title: "Inflasi mengurangi daya beli nilai aset masa depan",
        detail: `Aset bersih akhir skenario moderat ${formatRupiah(nominal)} setara daya beli ${formatRupiah(real)} hari ini (turun ${formatRupiah(nominal - real)}).`,
        period,
        assumptions: `Inflasi ${formatBp(mod.scenario.inflationAnnualBp, 0)} per tahun (asumsi Anda).`,
        limitations: "Inflasi aktual berfluktuasi dan berbeda per jenis pengeluaran.",
        actions: ["Tinjau target nominal (nikah, dana darurat) setiap tahun terhadap inflasi."],
      });
    }

    const consistentDeposits = mod.totals.deposits;
    out.push({
      kind: "positive",
      title: "Konsistensi setoran membangun modal",
      detail: `Total setoran terjadwal ${formatRupiah(consistentDeposits)} selama periode; dari jumlah itu ${formatRupiah(mod.totals.finalCashLike)} berupa kas/tabungan tanpa risiko pasar (skenario moderat).`,
      period,
      assumptions: "Setoran sesuai anggaran setiap bulan tanpa jeda.",
      limitations: "Setoran yang terhenti beberapa bulan menurunkan hasil secara proporsional.",
      actions: ["Otomatiskan transfer ke rekening tabungan/dana darurat di tanggal gajian."],
    });
  }

  // Sisa / defisit anggaran
  if (input.currentAllocation) {
    const a = input.currentAllocation;
    if (a.status === "deficit") {
      out.push({
        kind: "negative",
        title: "Anggaran melebihi gaji",
        detail: `Total alokasi ${formatRupiah(a.total)} melebihi gaji ${formatRupiah(a.salary)} sebesar ${formatRupiah(a.deficit)}. Kategori penyebab (prioritas terendah): ${a.deficitCauses.map((c) => c.name).join(", ")}.`,
        period: formatMonthLabel(input.currentMonth),
        assumptions: "Aturan alokasi saat ini.",
        limitations: "—",
        actions: ["Kurangi kategori prioritas rendah atau ubah metode alokasi ke persentase."],
      });
    } else if (a.remaining > 0) {
      out.push({
        kind: "recommendation",
        title: "Ada sisa gaji yang belum dialokasikan",
        detail: `Sisa ${formatRupiah(a.remaining)} per bulan (${formatBp(Math.round((a.remaining / a.salary) * 10_000), 1)} dari gaji) belum memiliki tujuan. Dalam ${monthDiff(input.currentMonth, input.periodEnd) + 1} bulan tersisa nilainya ${formatRupiah(a.remaining * (monthDiff(input.currentMonth, input.periodEnd) + 1))}.`,
        period: `${formatMonthLabel(input.currentMonth)} – ${formatMonthLabel(input.periodEnd)}`,
        assumptions: "Gaji dan aturan alokasi saat ini tidak berubah.",
        limitations: "—",
        actions: ["Arahkan sisa ke dana darurat (jika belum mencapai target) atau tabungan nikah sesuai prioritas Anda."],
      });
    }
  }

  // Posisi tanpa valuasi
  const missing = input.summaries.filter((s) => s.valuationMissing);
  if (missing.length) {
    out.push({
      kind: "insufficient",
      title: "Harga pasar belum diperbarui",
      detail: `${missing.map((s) => s.kind).join(", ")} memiliki posisi tanpa harga pasar; nilai sementara memakai modal beli.`,
      period: `Per ${formatMonthLabel(input.currentMonth)}`,
      assumptions: "Nilai pasar = modal beli sampai harga manual diinput.",
      limitations: "Keuntungan/kerugian belum terealisasi tidak dapat dihitung.",
      actions: ["Masukkan harga pasar terakhir beserta tanggalnya di halaman Investasi."],
    });
  }

  return out;
}
