# Financial Planner 5 Tahun — Product Requirements & Technical Specification

## 1. Tujuan aplikasi

Bangun aplikasi web personal finance untuk mengelola rencana keuangan selama 5 tahun, mulai Oktober 2026 sampai September 2031.

Aplikasi harus bisa:
- Mengatur gaji bulanan yang nilainya dapat berubah kapan saja.
- Menyimpan riwayat gaji dan anggaran setiap bulan tanpa menimpa history sebelumnya.
- Mengatur alokasi gaji secara dinamis berdasarkan nominal gaji.
- Mengelola dana darurat, saham, crypto SOL, trading XAUUSD, tabungan pribadi, dan tabungan nikah.
- Membandingkan rencana dengan realisasi keuangan.
- Menghitung proyeksi aset dan keuntungan selama 5 tahun.
- Menampilkan analisis positif, negatif, risiko, dan rekomendasi perbaikan keuangan.
- Memudahkan pengguna mengubah target dan asumsi tanpa mengubah data historis.

## 2. Prinsip utama aplikasi

### 2.1 Dynamic salary

Gaji bukan nilai hardcoded. Pengguna dapat menambahkan perubahan gaji dengan:
- Nominal gaji baru.
- Bulan mulai berlaku.
- Catatan perubahan, misalnya kenaikan gaji atau perubahan kontrak.

Contoh:
- Oktober 2026: gaji Rp7.500.000.
- Oktober 2027: gaji naik menjadi Rp10.000.000.
- Januari 2029: gaji naik menjadi Rp12.000.000.

Perubahan gaji mulai berlaku pada bulan yang dipilih. Semua bulan sebelumnya tetap menggunakan nominal dan alokasi yang tercatat pada bulan tersebut.

### 2.2 Historical data must be immutable by default

Pisahkan data menjadi:
1. **Historical actuals:** data realisasi yang sudah dicatat dan dikunci.
2. **Current plan:** rencana anggaran bulan berjalan.
3. **Future projection:** simulasi untuk bulan mendatang berdasarkan gaji dan asumsi terbaru.

Ketika gaji diperbarui:
- Jangan memperbarui gaji pada bulan historis.
- Jangan menghitung ulang realisasi historis.
- Hitung ulang proyeksi untuk bulan mendatang yang belum dikunci.
- Tampilkan tanggal efektif perubahan gaji.
- Jika pengguna mengoreksi bulan historis, minta konfirmasi dan simpan audit log.

## 3. Data awal

Buat data awal berikut sebagai konfigurasi yang dapat diubah melalui UI.

- Periode perencanaan: Oktober 2026–September 2031.
- Gaji awal: Rp7.500.000 per bulan.

Contoh alokasi awal:

| Kategori | Nominal |
|---|---:|
| Bantuan orang tua | Rp2.000.000 |
| Pacar | Rp500.000 |
| Kebutuhan pribadi | Rp2.000.000 |
| Dana darurat | Rp1.000.000 |
| Saham | Rp500.000 |
| Crypto SOL | Rp500.000 |
| Modal trading XAUUSD | Rp200.000 |
| Tabungan pribadi | Rp300.000 |
| Tabungan nikah | Rp200.000 |
| Total | Rp7.500.000 |/

Semua nominal di atas merupakan nilai awal, bukan aturan permanen. Pengguna dapat mengubah nominal, persentase, prioritas, dan status aktif setiap kategori.

Jangan mengasumsikan bahwa setiap kategori harus selalu menggunakan nominal yang sama ketika gaji berubah.

## 4. Aturan alokasi anggaran

Sediakan tiga metode alokasi:
- Nominal tetap.
- Persentase dari gaji.
- Nominal minimum ditambah persentase dari sisa gaji.

Kategori dapat diatur secara individual.

Contoh:
- Bantuan orang tua: nominal tetap.
- Dana darurat: target bulanan.
- Saham: persentase atau nominal.
- Crypto SOL: persentase atau nominal.
- Trading XAUUSD: batas modal bulanan.
- Tabungan pribadi dan nikah: nominal tetap atau persentase.

Sediakan prioritas alokasi:
1. Pengeluaran wajib.
2. Dana darurat.
3. Target tabungan penting.
4. Investasi.
5. Pengeluaran fleksibel.

Prioritas tersebut harus bisa diubah pengguna.

Validasi:
- Total alokasi tidak boleh diam-diam melebihi gaji.
- Jika total anggaran lebih besar dari gaji, tampilkan defisit dan kategori penyebabnya.
- Jika ada sisa gaji, tampilkan jumlah sisa.
- Jangan otomatis menambah nominal investasi saat gaji naik tanpa aturan yang dipilih pengguna.
- Pengguna dapat memilih apakah kenaikan gaji dibagikan secara proporsional, diarahkan ke dana darurat, atau dialokasikan secara manual.

## 5. Fitur perubahan gaji

Buat halaman Salary History.

Informasi yang disimpan:
- ID perubahan.
- Gaji baru.
- Bulan efektif.
- Tanggal input.
- Catatan.
- Status aktif atau digantikan.

Contoh:
| Bulan | Gaji | Status |
|---|---:|---|
| Okt 2026 | Rp7.500.000 | Historical |
| Okt 2027 | Rp10.000.000 | Historical |
| Jan 2029 | Rp12.000.000 | Planned / Historical sesuai status |

Perbedaan status:
- Planned: perubahan gaji masa depan yang belum terkonfirmasi.
- Actual: perubahan yang benar-benar berlaku.
- Superseded: rencana lama yang sudah digantikan.

Jika pengguna mengubah kenaikan gaji yang direncanakan, jangan mengubah catatan gaji aktual sebelumnya.

Sediakan preview dampak perubahan sebelum pengguna menyimpan perubahan.

## 6. Dashboard utama

Tampilkan:
- Gaji bulan berjalan.
- Total pengeluaran.
- Total investasi.
- Total tabungan.
- Saldo dana darurat.
- Sisa anggaran.
- Total aset bersih.
- Akumulasi setoran investasi.
- Estimasi keuntungan atau kerugian investasi.
- Proyeksi aset pada akhir tahun dan akhir periode 5 tahun.
- Status target keuangan.

Grafik:
1. Perubahan gaji bulanan.
2. Alokasi gaji berdasarkan kategori.
3. Total aset bersih dari waktu ke waktu.
4. Setoran versus estimasi keuntungan investasi.
5. Perbandingan skenario konservatif, moderat, dan optimistis.
6. Rencana versus realisasi.

## 7. Modul investasi

### 7.1 Saham

Sediakan pencatatan:
- Kode saham.
- Tanggal pembelian.
- Jumlah lot.
- Harga per lembar.
- Biaya transaksi.
- Total modal.
- Dividen diterima.
- Harga pasar terakhir yang diperbarui pengguna.
- Nilai pasar dan keuntungan/kerugian belum terealisasi.

Watchlist awal:
- BBCA
- BBRI
- BMRI
- TLKM
- ASII

Jangan mewajibkan pembelian semua saham setiap bulan. Sistem harus memeriksa saldo, harga per lot, dan biaya transaksi. Jika dana belum cukup, sisa dana dapat dibawa ke bulan berikutnya.

Harga pasar harus memiliki tanggal pembaruan. Jika belum tersedia data pasar real-time, tandai sebagai harga manual atau harga terakhir yang diketahui.

### 7.2 Crypto

Sediakan aset SOL sebagai data awal yang dapat diedit.

Catat:
- Tanggal transaksi.
- Jumlah SOL.
- Harga beli.
- Biaya transaksi.
- Total modal.
- Harga pasar terakhir.
- Nilai pasar.
- Keuntungan/kerugian.

Jangan mengasumsikan SOL selalu naik. Skenario negatif harus bisa memasukkan penurunan harga besar.

### 7.3 XAUUSD

Pisahkan trading dari investasi jangka panjang.

Catat:
- Deposit modal.
- Penarikan.
- Profit atau loss yang telah direalisasikan.
- Biaya trading.
- Saldo akun.
- Maximum drawdown.
- Return berdasarkan modal yang benar-benar digunakan.

Jangan menghitung setoran modal sebagai profit. Jangan menggunakan asumsi profit tetap setiap bulan sebagai hasil yang pasti.

Tampilkan risiko kehilangan sebagian atau seluruh modal trading. Pengguna harus dapat mengatur batas kerugian dan menghentikan proyeksi profit trading.

## 8. Dana darurat dan tabungan

Buat modul terpisah untuk:
- Dana darurat.
- Tabungan pribadi.
- Tabungan nikah.

Setiap modul memiliki:
- Saldo awal.
- Setoran bulanan.
- Penarikan.
- Target saldo.
- Persentase pencapaian.
- Estimasi bulan target tercapai.

Dana darurat harus disimpan terpisah dari aset berisiko. Nilai dana darurat tidak boleh dihitung sebagai keuntungan investasi.

Sediakan target dana darurat berdasarkan beberapa bulan pengeluaran wajib. Target harus dapat diubah.

## 9. Mesin proyeksi keuangan 5 tahun

Hitung proyeksi per bulan selama 60 bulan.

Input:
- Gaji setiap bulan berdasarkan effective date.
- Pengeluaran setiap bulan.
- Alokasi tabungan dan investasi.
- Setoran dan penarikan.
- Return investasi berdasarkan skenario.
- Dividen dan biaya jika dimasukkan.
- Perubahan gaji yang direncanakan.

Gunakan tiga skenario:
1. Konservatif.
2. Moderat.
3. Optimistis.

Tiap skenario harus memiliki asumsi yang dapat diedit dan ditampilkan dengan jelas.

Rumus dasar untuk aset investasi:
Nilai akhir = nilai awal + setoran bersih + keuntungan/kerugian investasi + pendapatan investasi bersih.

Gunakan perhitungan per bulan dan jelaskan asumsi waktu setoran serta compounding. Hindari menghitung keuntungan dari setoran yang belum masuk.

Pisahkan:
- Total uang yang disetor.
- Keuntungan/kerugian pasar.
- Dividen atau pendapatan terealisasi.
- Biaya.
- Nilai aset akhir.

Jangan menjumlahkan modal trading, setoran saham, dan keuntungan dengan cara yang menyebabkan aset dihitung dua kali.

Untuk uang tunai dan tabungan tanpa bunga, gunakan asumsi return nol kecuali pengguna mengatur asumsi lain.

## 10. Analisis positif dan negatif

Buat halaman Financial Insights yang menghasilkan analisis berdasarkan hasil kalkulasi aktual sistem.

Contoh analisis positif:
- Pendapatan meningkat sehingga ruang menabung bertambah.
- Dana darurat mencapai target lebih cepat.
- Konsistensi setoran meningkatkan jumlah modal yang terkumpul.
- Dividen yang diinvestasikan kembali dapat menambah pertumbuhan aset.
- Diversifikasi dapat mengurangi ketergantungan pada satu jenis aset.

Contoh analisis negatif:
- Kenaikan pengeluaran mengurangi kemampuan investasi.
- Inflasi mengurangi daya beli nilai aset masa depan.
- Penurunan pasar dapat membuat nilai investasi lebih rendah daripada modal yang disetor.
- SOL dan XAUUSD memiliki risiko kerugian tinggi.
- Target bisa gagal jika gaji tidak naik, terjadi pengeluaran mendadak, atau setoran terhenti.
- Proyeksi terlalu optimistis dapat memberikan ekspektasi yang tidak realistis.

Setiap insight wajib:
- Menyebutkan angka yang mendukungnya.
- Menjelaskan periode analisis.
- Menjelaskan asumsi yang dipakai.
- Menunjukkan risiko dan keterbatasan.
- Memberikan saran praktis, bukan janji keuntungan.

Jika data belum cukup, tampilkan bahwa analisis belum memadai. Jangan mengarang data atau menyebut analisis sebagai prediksi pasti.

## 11. Perbandingan kenaikan gaji

Sediakan simulasi:
- Gaji tetap Rp7.500.000 selama 5 tahun.
- Gaji naik menjadi Rp10.000.000 mulai bulan yang dipilih.
- Beberapa kenaikan gaji pada bulan berbeda.

Bandingkan:
- Total pendapatan selama 5 tahun.
- Total pengeluaran.
- Total tabungan dan investasi.
- Saldo dana darurat.
- Total setoran.
- Estimasi nilai aset akhir.
- Selisih hasil antar skenario.

Saat gaji berubah, hanya periode efektif dan masa depan yang mengikuti perubahan. Periode aktual sebelumnya harus tetap konsisten dengan riwayat yang tersimpan.

## 12. Laporan dan ekspor

Sediakan:
- Laporan bulanan.
- Laporan tahunan.
- Laporan 5 tahun.
- Riwayat perubahan gaji.
- Rencana versus realisasi.
- Performa per aset.
- Ekspor CSV atau Excel.
- Backup dan restore data.

## 13. Database dan integritas data

Buat struktur database yang mendukung:
- salary_changes.
- monthly_budgets.
- budget_categories.
- monthly_actuals.
- asset_transactions.
- asset_valuations.
- projection_scenarios.
- financial_goals.
- audit_logs.

Sesuaikan nama tabel dengan konvensi framework yang dipilih.

Simpan uang dalam integer rupiah atau tipe decimal yang tepat, bukan floating-point yang berpotensi menyebabkan kesalahan pembulatan.

Gunakan transaksi database untuk perubahan yang saling berkaitan.

Perubahan salary tidak boleh menimpa monthly_actuals yang sudah disimpan.

Setiap perubahan penting harus memiliki audit log.

## 14. UX dan desain

Buat tampilan:
- Modern, bersih, responsif untuk HP dan desktop.
- Bahasa Indonesia.
- Format rupiah: Rp7.500.000.
- Format bulan: Oktober 2026.
- Navigasi sederhana.
- Form input dengan validasi.
- Grafik mudah dipahami.
- Penanda yang membedakan actual, planned, dan projection.
- Konfirmasi sebelum mengubah data historis.
- Tampilan kosong dan error state yang jelas.

Jangan hanya membuat dashboard statis. Semua nominal, grafik, tabel, dan analisis harus berasal dari data yang tersimpan.

## 15. Keamanan dan privasi

- Gunakan autentikasi jika aplikasi diakses dari internet.
- Jangan menyimpan password dalam plaintext.
- Validasi input di server.
- Hindari memasukkan API key ke source code.
- Sediakan backup data.
- Jangan mengirim data ke layanan eksternal tanpa persetujuan pengguna.
- Jika hanya dipakai lokal, dokumentasikan cara menjalankannya secara lokal.

## 16. Testing dan acceptance criteria

Buat automated tests minimal untuk skenario berikut:

1. Gaji Oktober 2026 Rp7.500.000 tetap tersimpan setelah gaji Oktober 2027 berubah menjadi Rp10.000.000.
2. Proyeksi Oktober 2027 dan sesudahnya menggunakan gaji baru.
3. Realisasi bulan yang telah dikunci tidak berubah ketika proyeksi diperbarui.
4. Total alokasi sama dengan gaji jika anggaran seimbang.
5. Sistem menampilkan defisit jika alokasi melebihi gaji.
6. Perubahan gaji yang direncanakan tidak dianggap sebagai kenaikan aktual.
7. Profit dan loss dihitung terpisah dari setoran modal.
8. Nilai aset tidak dihitung dua kali.
9. Skenario return negatif menghasilkan nilai proyeksi yang sesuai dengan rumus.
10. Ekspor laporan sesuai dengan data yang ditampilkan.
11. Pengubahan asumsi proyeksi tidak mengubah transaksi aktual.
12. Pembulatan rupiah dan biaya transaksi ditangani secara konsisten.

## 17. Urutan implementasi

Tahap 1: Audit codebase dan dokumentasikan stack, struktur, dan cara menjalankan aplikasi.

Tahap 2: Rancang database, migrasi, model, dan aturan historis.

Tahap 3: Implementasikan salary history dan monthly budget.

Tahap 4: Implementasikan pencatatan realisasi dan tabungan.

Tahap 5: Implementasikan pencatatan investasi saham, crypto, dan XAUUSD.

Tahap 6: Implementasikan mesin proyeksi 60 bulan.

Tahap 7: Implementasikan dashboard, grafik, analisis positif/negatif, dan laporan.

Tahap 8: Tambahkan ekspor, backup, audit log, dan automated tests.

Jangan mengimplementasikan seluruh fitur sekaligus tanpa memvalidasi fondasi data. Kerjakan per tahap dan jalankan test setelah setiap tahap.

## 18. Definisi selesai

Aplikasi dianggap selesai apabila pengguna bisa:
- Memasukkan dan mengubah gaji dengan bulan efektif.
- Melihat riwayat gaji lama tanpa perubahan.
- Mengatur alokasi dinamis.
- Mencatat transaksi aktual.
- Melihat proyeksi keuangan 5 tahun.
- Membandingkan skenario positif, moderat, dan negatif.
- Melihat alasan yang mendukung setiap analisis.
- Mengekspor laporan.
- Memastikan seluruh perhitungan dapat diuji dan tidak menghitung aset dua kali.
