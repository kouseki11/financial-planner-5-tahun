# Financial Planner 5 Tahun

Aplikasi web perencanaan keuangan pribadi untuk periode **Oktober 2026 – September 2031**: gaji dinamis dengan bulan efektif, anggaran bulanan berbasis aturan, pencatatan realisasi, portofolio (saham, SOL, trading XAUUSD, dana darurat, tabungan), proyeksi 60 bulan dengan tiga skenario, analisis, laporan, ekspor, dan backup.

Spesifikasi: [`docs/financial-planner-spec.md`](docs/financial-planner-spec.md). Rencana implementasi, skema DB, contoh perhitungan, dan test cases: [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · shadcn/ui · Turso Cloud (libSQL) · Drizzle ORM · Zod · Recharts · Vitest.

## Prinsip data

- **Uang = integer rupiah**, persentase = basis poin (10.000 bp = 100 %). Tidak ada float untuk uang.
- **Gaji berlaku per bulan efektif.** Perubahan gaji membuat baris baru; baris aktual lama tidak diubah.
- **Bulan terkunci (historis) beku.** Perubahan gaji/aturan hanya meregenerasi bulan `projected`/`planned`. Koreksi historis memerlukan konfirmasi + alasan dan dicatat di `audit_logs`.
- **Tidak ada double-counting.** Aset bersih = Σ (kas + nilai pasar) per akun. Setoran, dividen, dan laba adalah metrik terpisah.
- **Proyeksi = asumsi pengguna**, bukan data pasar dan bukan jaminan. Setoran dianggap masuk di akhir bulan; tingkat bulanan = (1 + r_tahun)^(1/12) − 1.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local        # isi TURSO_* untuk Turso, atau kosongkan untuk file lokal
npm run db:migrate                # terapkan migrasi ke DB yang dikonfigurasi
npm run dev                       # http://localhost:3000
```

Tanpa `TURSO_DATABASE_URL`, aplikasi memakai `LOCAL_DATABASE_URL` (default `file:local.db`). Data awal (kategori, akun, skenario, gaji Rp7.500.000) di-seed otomatis saat pertama dibuka; snapshot anggaran 60 bulan dibuat otomatis.

> Catatan: tabel data awal di spec berjumlah Rp7.200.000 (bukan Rp7.500.000). Aplikasi menampilkan selisih Rp300.000 sebagai "sisa belum dialokasikan" dan tidak mengubahnya diam-diam.

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest (logika murni + DB in-memory) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:generate` | Buat file migrasi dari `src/db/schema.ts` |
| `npm run db:migrate` | Terapkan migrasi (`drizzle/`) ke DB di env |
| `npm run db:seed` | Seed manual (idempoten) |
| `npm run db:studio` | Drizzle Studio |

## Struktur

```
src/lib/        logika murni teruji: money, months, salary, allocation, portfolio, projection, insights, csv
src/db/         schema Drizzle, client libSQL, migrate, seed
src/server/     service (transaksi + audit log) dan server actions (validasi Zod)
src/app/        halaman: / (dashboard), /gaji, /anggaran, /realisasi, /investasi, /proyeksi, /analisis, /laporan
src/components/ UI (shadcn/ui), grafik Recharts, form aksi
tests/          Vitest
drizzle/        migrasi SQL
```

## Deployment ke Vercel

1. Push repo ke GitHub, impor ke Vercel (framework: Next.js, default).
2. **Environment Variables** (Production & Preview): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Jangan commit nilai asli; `.env*` sudah di-gitignore.
3. Jalankan migrasi ke Turso satu kali dari mesin Anda: `npm run db:migrate` (membaca `.env.local`). Ulangi setiap ada migrasi baru.
4. Deploy. Production menolak berjalan tanpa Turso (`src/db/client.ts`).
5. Opsional: aktifkan **Deployment Protection** (Vercel) agar aplikasi personal tidak dapat diakses publik.

### Keamanan

- Token Turso hanya di env (lokal: `.env.local`; Vercel: project settings). Bila token pernah terekspos (misal di chat/log), **rotasi** di dashboard Turso.
- Semua input divalidasi di server (Zod). Tidak ada data dikirim ke layanan eksternal selain database Anda.
- Backup JSON dapat diunduh dari `/laporan`; restore mengganti seluruh data (konfirmasi wajib, tercatat di audit log).

## Pengujian

```bash
npm test
```

Mencakup acceptance criteria spec §16: gaji historis tidak berubah saat gaji baru ditambahkan (T1), proyeksi memakai gaji baru dari bulan efektif (T2), bulan terkunci beku (T3), alokasi seimbang/defisit (T4, T5), planned ≠ actual (T6), P/L terpisah dari setoran (T7), tanpa double-counting (T8), return negatif sesuai rumus (T9), ekspor = data tampil (T10), asumsi tidak menyentuh aktual (T11), pembulatan konsisten (T12).
