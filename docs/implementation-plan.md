# Rencana Implementasi — Financial Planner 5 Tahun

Dokumen ini memetakan spesifikasi di `financial-planner-spec.md` ke tahapan implementasi, skema database, API/server action, UI, dan pengujian. Semua angka proyeksi di aplikasi berasal dari **asumsi yang diinput pengguna**, bukan data pasar. Aplikasi tidak menjanjikan keuntungan investasi.

---

## 1. Hasil Audit Codebase

| Aspek | Temuan |
|---|---|
| Kode aplikasi | **Tidak ada.** Folder hanya berisi `docs/financial-planner-spec.md`. |
| Git | Belum diinisialisasi. |
| Framework / database | Belum ada. Ditentukan oleh pemilik proyek: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Turso Cloud SQLite (libSQL), Drizzle ORM, Zod, Recharts. |
| Toolchain mesin dev | Node v22, npm 10, Docker, git. PHP 8.3 tersedia tetapi tidak dipakai. |
| Testing | Belum ada. Akan dipakai **Vitest** (unit test logika murni + test DB dengan libSQL in-memory). |
| Cara menjalankan | Belum ada. Akan didokumentasikan di `README.md` (lokal: `npm run dev`; production: Vercel + Turso). |

Karena tidak ada kode lama, tidak ada risiko merombak struktur yang sudah ada. Struktur folder dibuat dari nol mengikuti konvensi Next.js App Router dengan direktori `src/`.

### Status implementasi (12 Oktober 2026)

Semua tahap §6 telah dikerjakan: 95 test Vitest lulus, `tsc` dan ESLint bersih, `next build` sukses, migrasi diterapkan ke Turso Cloud, dan seluruh halaman diuji merender (HTTP 200) baik dengan DB lokal maupun Turso. Deployment Vercel tinggal menyetel env dan push (lihat `README.md`).

**Temuan spec:** tabel data awal §3 berjumlah **Rp7.200.000**, bukan Rp7.500.000 seperti tertulis di baris Total. Nominal spec dipertahankan; aplikasi menampilkan selisih Rp300.000 sebagai "sisa belum dialokasikan" (sesuai aturan validasi §4 spec) dan tidak mengubahnya diam-diam.

**Penyesuaian desain selama implementasi:**
- `monthly_budget_items` menyimpan `rule_snapshot` sehingga tampilan bulan terkunci dibangun dari snapshot, bukan aturan terbaru.
- Mesin proyeksi menerima `marketAdjustment` pada bulan aktual terakhir agar nilai proyeksi awal = nilai pasar aktual (laba belum terealisasi masuk sebagai `gain`, biaya tetap terpisah).
- Saldo awal akun diperlakukan sebagai *opening value*, bukan setoran, agar "Akumulasi setoran" tetap murni.
- Batas rugi trading disimulasikan sebagai *floor* (asumsi stop-loss) dengan identitas akumulator tetap berlaku.

### Konvensi penting

- **Uang disimpan sebagai integer rupiah** (kolom `integer` SQLite, 64-bit di JS lewat `number`, aman sampai 9 × 10^15). Tidak ada `float` untuk uang.
- **Persentase disimpan dalam basis poin (bp)**: 10.000 bp = 100 %. Integer, bebas error pembulatan.
- **Bulan disimpan sebagai string `YYYY-MM`** (contoh `2026-10`). Pengurutan leksikal = pengurutan kronologis.
- **Kuantitas aset** (lembar saham, SOL) disimpan sebagai integer dalam satuan terkecil `quantity_e6` (nilai × 1.000.000) agar SOL pecahan tetap presisi.
- **Secret tidak pernah masuk repo.** `.env.local` di-gitignore; `.env.example` berisi placeholder.
- Database lokal untuk development/test: libSQL `file:` atau `:memory:`. **Production hanya Turso Cloud** lewat `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN`.

---

## 2. Struktur Folder yang Direncanakan

```
5years-plan/
├── docs/                      # spec + rencana ini
├── drizzle/                   # file migrasi SQL hasil drizzle-kit
├── src/
│   ├── app/                   # Next.js App Router (halaman + layout)
│   │   ├── page.tsx           # Dashboard
│   │   ├── gaji/              # Salary History
│   │   ├── anggaran/          # Anggaran bulanan & aturan alokasi
│   │   ├── realisasi/         # Pengeluaran & tabungan aktual
│   │   ├── investasi/         # Saham, SOL, XAUUSD
│   │   ├── proyeksi/          # Proyeksi 60 bulan + skenario
│   │   ├── analisis/          # Financial Insights
│   │   └── laporan/           # Laporan & ekspor CSV
│   ├── components/            # UI (shadcn/ui + komponen domain + grafik)
│   ├── db/
│   │   ├── schema.ts          # Skema Drizzle
│   │   ├── client.ts          # Koneksi libSQL (Turso / lokal)
│   │   └── seed.ts            # Data awal dari spec §3
│   ├── lib/                   # LOGIKA MURNI, tanpa DB, 100 % teruji
│   │   ├── money.ts           # format Rp, pembulatan, bp
│   │   ├── months.ts          # YYYY-MM, rentang 60 bulan, label "Oktober 2026"
│   │   ├── salary.ts          # resolusi gaji efektif per bulan
│   │   ├── allocation.ts      # hitung alokasi, defisit/sisa, kebijakan kenaikan
│   │   ├── projection.ts      # mesin proyeksi 60 bulan, 3 skenario
│   │   ├── portfolio.ts       # nilai pasar, P/L, pencegahan double-count
│   │   └── insights.ts        # analisis positif/negatif berbasis angka
│   └── server/                # Server Actions + service (Zod validasi, transaksi, audit log)
├── tests/                     # Vitest
├── .env.example
└── README.md
```

Prinsip: **semua perhitungan ada di `src/lib` sebagai fungsi murni** sehingga dapat diuji tanpa database dan dipakai ulang oleh UI, server action, dan ekspor.

---

## 3. Rancangan Skema Database

Nama tabel mengikuti spec §13 (snake_case). Tabel tambahan diberi tanda ➕ dengan alasannya.

### 3.1 `salary_changes` — riwayat gaji

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | integer PK | |
| amount | integer | gaji per bulan, rupiah |
| effective_month | text `YYYY-MM` | bulan mulai berlaku |
| status | text | `planned` / `actual` / `superseded` |
| note | text | catatan perubahan |
| superseded_by_id | integer FK → salary_changes.id, nullable | penunjuk ke pengganti |
| created_at | text ISO | tanggal input |

Aturan:
- Gaji bulan `M` = baris dengan `effective_month ≤ M` dan `status ≠ superseded` yang paling akhir. Untuk tampilan "aktual saja", hanya `status = actual`.
- Mengubah rencana kenaikan: baris lama → `superseded`, baris baru dibuat. **Baris `actual` tidak pernah diubah** kecuali lewat koreksi historis dengan konfirmasi + audit log.

### 3.2 `budget_categories` — kategori & aturan alokasi

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | integer PK | |
| name, slug | text | contoh "Dana darurat", `dana-darurat` |
| group_key | text | `wajib` / `dana_darurat` / `tabungan` / `investasi` / `fleksibel` |
| asset_kind | text nullable | `emergency` / `savings_personal` / `savings_wedding` / `stock` / `crypto` / `trading`; null = pengeluaran |
| method | text | `fixed` / `percent` / `min_plus_percent` |
| fixed_amount | integer | untuk `fixed` dan bagian minimum `min_plus_percent` |
| percent_bp | integer | untuk `percent` (dari gaji) dan `min_plus_percent` (dari sisa) |
| priority | integer | urutan pemrosesan; kecil = lebih dulu |
| is_active | integer (bool) | |

### 3.3 `monthly_budgets` + ➕ `monthly_budget_items` — snapshot anggaran per bulan

`monthly_budgets`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | integer PK | |
| month | text `YYYY-MM` UNIQUE | |
| salary_amount | integer | **snapshot** gaji bulan tersebut |
| salary_change_id | integer FK | sumber gaji saat snapshot dibuat |
| status | text | `projected` (otomatis, boleh dihitung ulang) / `planned` (bulan berjalan) / `locked` (historis, beku) |
| locked_at | text nullable | |

`monthly_budget_items` (➕ normalisasi dari "anggaran per bulan per kategori")

| Kolom | Tipe |
|---|---|
| id | integer PK |
| monthly_budget_id | FK |
| category_id | FK |
| planned_amount | integer |
| rule_snapshot | text JSON — method/fixed/percent saat itu, agar riwayat tidak bergantung pada aturan terbaru |

Aturan kunci: **perubahan gaji atau aturan hanya meregenerasi baris `status = projected`.** Baris `locked` tidak disentuh oleh proses apa pun selain koreksi manual yang dikonfirmasi.

### 3.4 `monthly_actuals` — realisasi

| Kolom | Tipe |
|---|---|
| id | integer PK |
| month | text `YYYY-MM` |
| category_id | FK |
| actual_amount | integer |
| note | text |
| created_at | text |

UNIQUE(month, category_id). Tidak ada FK ke `salary_changes`; tabel ini **tidak pernah** dibaca-tulis oleh proses perubahan gaji.

### 3.5 ➕ `asset_accounts` — rekening/akun aset

Satu baris per modul: dana darurat, tabungan pribadi, tabungan nikah, saham, crypto, trading XAUUSD.

| Kolom | Tipe |
|---|---|
| id | integer PK |
| kind | text (`emergency` … `trading`) UNIQUE |
| name | text |
| opening_balance | integer (saldo awal kas) |
| target_amount | integer nullable |
| target_months_of_expenses | integer nullable (khusus dana darurat) |
| loss_limit_bp | integer nullable (khusus trading: batas kerugian) |

### 3.6 `asset_transactions` — semua mutasi

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | integer PK | |
| account_id | FK | |
| type | text | `deposit` / `withdraw` / `buy` / `sell` / `dividend` / `fee` / `realized_pnl` |
| trade_date | text `YYYY-MM-DD` | |
| month | text `YYYY-MM` | turunan dari trade_date, untuk agregasi |
| symbol | text nullable | `BBCA`, `SOL`, `XAUUSD` |
| quantity_e6 | integer nullable | kuantitas × 1e6 |
| price_per_unit | integer nullable | rupiah per lembar / per SOL |
| fee | integer default 0 | biaya transaksi |
| amount | integer | arus kas bertanda: deposit/dividend/realized profit (+), withdraw/fee/realized loss (−); buy = −(qty×price+fee), sell = +(qty×price−fee) |
| note | text | |

### 3.7 `asset_valuations` — harga pasar manual

| Kolom | Tipe |
|---|---|
| id | integer PK |
| account_id | FK |
| symbol | text |
| as_of_date | text |
| price_per_unit | integer |
| source | text `manual` / `last_known` |

Nilai pasar = kuantitas terakhir × harga valuasi terbaru. Selalu ditampilkan dengan tanggal pembaruan.

### 3.8 `projection_scenarios` — asumsi skenario (dapat diedit)

| Kolom | Tipe |
|---|---|
| id | integer PK |
| key | text UNIQUE `conservative` / `moderate` / `optimistic` |
| name | text |
| stock_annual_bp, crypto_annual_bp, trading_annual_bp, cash_annual_bp | integer (boleh negatif) |
| inflation_annual_bp | integer |
| trading_projection_enabled | bool |
| description | text — ditampilkan sebagai "asumsi, bukan prediksi" |

Nilai awal hanya ilustrasi dan dilabeli demikian di UI; pengguna wajib bisa mengubahnya.

### 3.9 `financial_goals`, `audit_logs`, ➕ `settings`, ➕ `watchlist_stocks`

- `financial_goals(id, name, account_kind, target_amount, target_month)`.
- `audit_logs(id, entity, entity_id, action, before_json, after_json, reason, created_at)` — ditulis dalam transaksi yang sama dengan perubahan.
- `settings(key PK, value_json)` — `plan_start=2026-10`, `plan_end=2031-09`, `raise_policy = manual|proportional|emergency_first`.
- `watchlist_stocks(symbol PK, name)` — BBCA, BBRI, BMRI, TLKM, ASII.

---

## 4. Logika Inti dan Contoh Perhitungan

### 4.1 Resolusi gaji efektif

```
resolveSalary(month, changes, { includePlanned = true })
  kandidat = changes
    .filter(c => c.status !== 'superseded')
    .filter(c => includePlanned || c.status === 'actual')
    .filter(c => c.effective_month <= month)
  return kandidat terakhir berdasarkan effective_month, lalu created_at
```

### 4.2 Contoh: gaji Rp7.500.000 (Okt 2026) → Rp10.000.000 (Okt 2027)

`salary_changes`:

| id | amount | effective_month | status |
|---|---:|---|---|
| 1 | 7.500.000 | 2026-10 | actual |
| 2 | 10.000.000 | 2027-10 | planned → actual saat terkonfirmasi |

Hasil `resolveSalary`:

| Bulan | Gaji | Sumber |
|---|---:|---|
| 2026-10 … 2027-09 (12 bulan) | 7.500.000 | id 1 |
| 2027-10 … 2031-09 (48 bulan) | 10.000.000 | id 2 |

Total pendapatan 5 tahun = 12 × 7.500.000 + 48 × 10.000.000 = **Rp570.000.000** (vs Rp450.000.000 jika gaji tetap).

**Jaminan data Okt 2026–Sep 2027 tidak berubah:**
1. Saat bulan sudah lewat/dikunci, `monthly_budgets.status = locked` dan `salary_amount` sudah tersimpan sebagai snapshot. Regenerasi hanya menyentuh `status = projected`.
2. `monthly_actuals` tidak punya referensi ke gaji; tidak ada kode yang menulisnya saat gaji berubah.
3. Baris `salary_changes` id 1 tidak diubah; perubahan selalu berupa **baris baru** dengan `effective_month` lebih besar.
4. Test otomatis (§7, T1–T3) memverifikasi snapshot bulan 2026-10..2027-09 identik sebelum dan sesudah penambahan id 2.

### 4.3 Alokasi awal pada gaji Rp7.500.000 (`method = fixed`)

| Prioritas | Kategori | Group | Nominal |
|---:|---|---|---:|
| 1 | Bantuan orang tua | wajib | 2.000.000 |
| 2 | Kebutuhan pribadi | wajib | 2.000.000 |
| 3 | Pacar | fleksibel | 500.000 |
| 4 | Dana darurat | dana_darurat | 1.000.000 |
| 5 | Tabungan nikah | tabungan | 200.000 |
| 6 | Tabungan pribadi | tabungan | 300.000 |
| 7 | Saham | investasi | 500.000 |
| 8 | Crypto SOL | investasi | 500.000 |
| 9 | Modal trading XAUUSD | investasi | 200.000 |
| | **Total** | | **7.500.000** |
| | **Sisa** | | **0** |

### 4.4 Perilaku saat gaji naik ke Rp10.000.000 (mulai 2027-10)

Tidak ada kategori yang otomatis membesar. Hasil bergantung `raise_policy`:

| Kebijakan | Hasil |
|---|---|
| `manual` (default) | Semua kategori `fixed` tetap. Total alokasi 7.500.000, **sisa Rp2.500.000** ditampilkan sebagai "belum dialokasikan" sampai pengguna mengubah aturan. |
| `emergency_first` | Sisa 2.500.000 ditambahkan ke Dana darurat → 3.500.000. Sisa 0. |
| `proportional` | Setiap kategori × (10.000.000 / 7.500.000). Pembulatan ke rupiah; selisih pembulatan (jika ada) ditampilkan sebagai sisa, bukan ditambahkan diam-diam. Contoh: Saham 500.000 → 666.667. |

Jika pengguna mengubah ke `percent` (misal Saham 10 % = 1.000 bp): alokasi = `round(10.000.000 × 1000 / 10000)` = 1.000.000.

Untuk `min_plus_percent`: urutan hitung ialah (1) semua `fixed`, (2) semua `percent` dari gaji, (3) `sisa = gaji − (1) − (2) − Σ minimum`, (4) tiap kategori `min_plus_percent` = `min + round(max(sisa,0) × bp / 10000)`.

Validasi: `total > gaji` → status **defisit**, UI menampilkan nominal defisit dan daftar kategori berurutan prioritas terbalik sebagai "penyebab". `total < gaji` → tampilkan **sisa**.

### 4.5 Mesin proyeksi per bulan

Untuk setiap aset dan setiap bulan `m` (60 bulan):

```
r      = (1 + annual_bp/10000)^(1/12) − 1          # tingkat bulanan dari asumsi tahunan
gain_m = round(V_{m−1} × r)                         # hanya saldo awal bulan yang berbunga/berubah
V_m    = V_{m−1} + gain_m + deposit_m − withdraw_m − fee_m + income_m
```

Asumsi waktu yang dinyatakan di UI: **setoran masuk di akhir bulan**, sehingga setoran bulan `m` belum menghasilkan apa pun di bulan `m` (spec §9: "hindari menghitung keuntungan dari setoran yang belum masuk").

Akumulator terpisah: `Σdeposit`, `Σwithdraw`, `Σgain`, `Σincome` (dividen/P-L terealisasi), `Σfee`. Identitas yang selalu diuji:

```
V_akhir = V_awal + Σdeposit − Σwithdraw + Σgain + Σincome − Σfee
```

**Contoh (Saham, setoran 500.000/bulan, asumsi 6 %/tahun → r ≈ 0,4868 %):**

| Bulan | V awal | Gain | Setoran | V akhir | Σ Setoran | Σ Gain |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 0 | 500.000 | 500.000 | 500.000 | 0 |
| 2 | 500.000 | 2.434 | 500.000 | 1.002.434 | 1.000.000 | 2.434 |
| 3 | 1.002.434 | 4.879 | 500.000 | 1.507.313 | 1.500.000 | 7.313 |

Cek: 1.500.000 + 7.313 = 1.507.313 ✔.

Skenario negatif (misal SOL −30 %/tahun): `r` negatif, `gain_m` negatif, `V_m` bisa lebih kecil dari Σsetoran. UI menandai "nilai di bawah modal".

Kas dan tabungan: `annual_bp = 0` kecuali diubah pengguna.

Trading XAUUSD: saldo = Σdeposit − Σwithdraw + Σrealized_pnl − Σfee. Return = Σrealized_pnl / Σdeposit (modal yang benar-benar dipakai). Proyeksi profit trading **dimatikan** bila `trading_projection_enabled = false`; `loss_limit_bp` membatasi proyeksi kerugian maksimum yang disimulasikan.

### 4.6 Pencegahan double-counting

```
Total aset bersih =
    saldo kas dana darurat
  + saldo tabungan pribadi
  + saldo tabungan nikah
  + nilai pasar saham (qty × harga valuasi terakhir) + kas saham belum terpakai
  + nilai pasar SOL + kas crypto belum terpakai
  + saldo akun trading
```

Yang **tidak** dijumlahkan ke aset bersih: Σsetoran (itu metrik terpisah "Akumulasi setoran"), keuntungan belum terealisasi (sudah tercermin di nilai pasar), dividen yang sudah masuk kas (sudah tercermin di kas). Test T8 menegaskan ini.

Keuntungan/kerugian investasi = nilai pasar + kas aset − Σsetoran bersih. Dana darurat dan tabungan **tidak** masuk ke angka keuntungan investasi.

Carry-over saham: jika setoran bulan ini < harga 1 lot + biaya, dana tetap sebagai "kas saham belum terpakai" dan dibawa ke bulan berikutnya. Tidak dihitung dua kali karena kas dan posisi saham adalah dua komponen berbeda yang saling mengurangi saat `buy`.

---

## 5. Risiko Terbesar dan Mitigasi

| # | Risiko | Mitigasi |
|---|---|---|
| R1 | **Salary effective date salah terapkan** (gaji baru bocor ke bulan lama) | Resolusi gaji hanya dari `effective_month ≤ M`; bulan `locked` pakai snapshot, bukan resolusi ulang. Test T1, T2. |
| R2 | **Historical snapshot ikut terhitung ulang** | Regenerasi anggaran membatasi `WHERE status = 'projected'`. Operasi kunci dalam transaksi. Koreksi historis lewat jalur terpisah dengan konfirmasi + `audit_logs`. Test T3, T11. |
| R3 | **Compounding salah** (setoran bulan ini ikut berbunga, atau tahunan dibagi 12 dipakai sebagai bunga majemuk) | Rumus eksplisit §4.5, konversi geometrik tahunan→bulanan, identitas akumulator diuji tiap bulan. Test T9. |
| R4 | **Double-counting aset** (setoran + nilai pasar dijumlahkan) | Model komponen terpisah (§4.6). Fungsi `netWorth()` hanya menjumlahkan saldo kas dan nilai pasar. Test T7, T8. |
| R5 | **Pembulatan rupiah** (persentase menghasilkan pecahan, total tidak klop) | Semua integer; pembulatan hanya di titik akhir tiap komponen; selisih ditampilkan sebagai sisa/defisit. Test T12. |
| R6 | **Planned vs actual gaji tercampur** | Flag `includePlanned`; dashboard realisasi pakai `actual` saja; proyeksi pakai `planned + actual`. Test T6. |
| R7 | Asumsi return ditafsirkan sebagai prediksi | Label eksplisit "asumsi ilustratif, dapat diubah" di tiap skenario; Insights wajib mencantumkan asumsi dan periode. |
| R8 | Secret bocor ke repo | `.env.local` di-gitignore sejak commit pertama; `.env.example` placeholder; token sudah terekspos di chat → **harus dirotasi** oleh pemilik. |

---

## 6. Tahapan Implementasi

Setiap tahap: tulis test → implementasi → `npm test` hijau → commit.

| Tahap | Fitur | Database | Server / API | UI | Test |
|---|---|---|---|---|---|
| **1. Fondasi** | Scaffold Next.js, Tailwind, shadcn/ui, Drizzle, Vitest; `.env`, README | Skema lengkap §3, migrasi awal, seed §3 spec | `db/client.ts` (Turso / lokal) | Layout + navigasi | smoke test koneksi in-memory |
| **2. Logika murni** | `money`, `months`, `salary`, `allocation`, `projection`, `portfolio` | — | — | — | T1, T2, T4, T5, T6, T7, T8, T9, T12 |
| **3. Salary History** | CRUD perubahan gaji, status, supersede, preview dampak | `salary_changes`, `monthly_budgets` regenerasi `projected` | `createSalaryChange`, `supersedeSalaryChange`, `previewSalaryImpact` | `/gaji`: tabel riwayat, form, preview tabel sebelum/sesudah | T1–T3 di level DB |
| **4. Anggaran bulanan** | Aturan alokasi per kategori, prioritas, kebijakan kenaikan, defisit/sisa, kunci bulan | `budget_categories`, `monthly_budget_items`, `settings` | `updateCategoryRule`, `lockMonth`, `generateBudgets` | `/anggaran`: editor aturan, tabel per bulan, badge actual/planned/projection | T4, T5, T11 |
| **5. Realisasi & tabungan** | Input pengeluaran aktual per kategori; setoran/penarikan dana darurat, tabungan pribadi, nikah; target & estimasi tercapai | `monthly_actuals`, `asset_accounts`, `asset_transactions`, `financial_goals` | `upsertActual`, `addTransaction`, `updateTarget` | `/realisasi`: form bulanan + kartu tabungan | T3, T11 |
| **6. Investasi** | Saham (lot, harga, biaya, dividen, valuasi manual), SOL, XAUUSD (deposit, withdraw, realized P/L, fee, drawdown) | `asset_transactions`, `asset_valuations`, `watchlist_stocks` | `addTrade`, `addValuation`, `addTradingEntry` | `/investasi` tab Saham / SOL / XAUUSD | T7, T8, T12 |
| **7. Proyeksi 60 bulan** | 3 skenario editable, mulai dari bulan `locked` terakhir, simulasi kenaikan gaji (§11) | `projection_scenarios` | `updateScenario`, `runProjection` | `/proyeksi`: tabel asumsi editable, grafik aset bersih, setoran vs gain, perbandingan skenario & kenaikan gaji | T9, T11 |
| **8. Dashboard & Insights** | Kartu ringkasan §6, 6 grafik, analisis positif/negatif dengan angka+asumsi+periode | — | `getDashboardData`, `generateInsights` | `/` dan `/analisis` | snapshot test insights dari data seed |
| **9. Laporan, ekspor, audit** | Laporan bulanan/tahunan/5 tahun, CSV, backup JSON + restore | `audit_logs` | `exportCsv`, `exportBackup`, `restoreBackup` | `/laporan` | T10 |
| **10. Deploy** | Vercel + Turso, dokumentasi | migrasi ke Turso | — | — | `npm run build` bersih |

---

## 7. Test Cases (dipetakan ke spec §16)

| ID | Spec | Skenario | Cara uji |
|---|---|---|---|
| T1 | 16.1 | Gaji 2026-10 = 7.500.000 tetap setelah tambah 10.000.000 efektif 2027-10 | `resolveSalary('2027-03')` sebelum dan sesudah = 7.500.000; baris id 1 tidak berubah |
| T2 | 16.2 | 2027-10 dan sesudahnya pakai gaji baru | `resolveSalary('2027-10') === 10_000_000`, `('2031-09') === 10_000_000` |
| T3 | 16.3 | Bulan `locked` tidak berubah saat regenerasi | Kunci 2026-10..2027-01, tambah gaji baru, `generateBudgets` → snapshot 4 bulan identik (deep-equal) |
| T4 | 16.4 | Alokasi seimbang → total = gaji, sisa 0 | Alokasi awal §4.3 |
| T5 | 16.5 | Alokasi > gaji → defisit + kategori penyebab | Naikkan Kebutuhan pribadi ke 3.000.000 → defisit 1.000.000, penyebab berisi prioritas terendah |
| T6 | 16.6 | Planned ≠ actual | `resolveSalary('2027-10', {includePlanned:false}) === 7_500_000` selama id 2 masih `planned` |
| T7 | 16.7 | P/L terpisah dari setoran | Deposit 1.000.000, realized_pnl +100.000 → Σdeposit 1.000.000, Σpnl 100.000, saldo 1.100.000; return 10 % |
| T8 | 16.8 | Tidak double-count | Beli 1 lot BBCA @10.000 dari kas saham 1.100.000 (fee 10.000): kas 90.000, nilai pasar 1.000.000 → netWorth 1.090.000, bukan 2.100.000 |
| T9 | 16.9 | Return negatif sesuai rumus | SOL −30 %/tahun, setoran 500.000 × 12 → V_akhir < 6.000.000 dan identitas akumulator berlaku tiap bulan |
| T10 | 16.10 | Ekspor = data tampil | CSV laporan bulanan di-parse kembali → sama dengan objek sumber |
| T11 | 16.11 | Ubah asumsi tidak sentuh aktual | Ubah `moderate.stock_annual_bp` → `monthly_actuals` dan `asset_transactions` hash sama |
| T12 | 16.12 | Pembulatan konsisten | 7.500.000 × 3.333 bp = 2.499.750 (bukan 2.499.749,99); fee dijumlahkan integer; `formatRupiah(7500000) === 'Rp7.500.000'` |

Test tambahan: konversi bulan (`2026-10` + 59 = `2031-09`), label `Oktober 2026`, tingkat bulanan dari tahunan (6 % → 0,48676 %), kebijakan `proportional` menyisakan selisih pembulatan sebagai sisa.

---

## 8. Keamanan & Deployment

- Autentikasi: aplikasi personal; untuk akses internet gunakan proteksi di level Vercel (password/Deployment Protection) atau tambahkan `AUTH_SECRET` + middleware sederhana pada tahap lanjutan. Tidak ada password plaintext karena tidak ada tabel user pada tahap awal.
- Validasi semua input di server dengan Zod (server action), bukan hanya di form.
- Env production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` di Vercel Project Settings → Environment Variables. Tidak ada di repo.
- Backup: ekspor JSON seluruh tabel dari `/laporan`; restore lewat upload file yang divalidasi Zod dalam satu transaksi.
- Menjalankan lokal: `npm install` → salin `.env.example` ke `.env.local` (boleh `file:local.db` untuk dev) → `npm run db:migrate` → `npm run db:seed` → `npm run dev`.
