# Panduan Penggunaan SIPERSURAT

Panduan operasional untuk **Administrator**, **Tata Usaha (TU)**, dan **Guru**. SIPERSURAT menyimpan data di perangkat masing-masing; Google Drive hanya dipakai untuk bertukar perubahan dan menyimpan backup. Artinya: aplikasi bisa dipakai offline, tetapi **sinkronisasi dan backup tetap perlu dijalankan secara berkala**.

Daftar rute utama: `/login`, `/setup`, `/registrasi-perangkat`, `/surat-masuk`, `/surat-keluar`, `/disposisi`, `/agenda`, `/arsip`, `/laporan`, `/pengaturan`, `/pengaturan/pengguna`, `/pengaturan/perangkat`, `/pengaturan/master`, `/pengaturan/template`, `/pengaturan/penomoran`, `/pengaturan/sinkronisasi`, `/pengaturan/backup`, `/pengaturan/konflik`, `/pengaturan/audit`.

## 1. Persiapan awal

### 1.1 Buat akun administrator pertama

1. Buka aplikasi. Jika belum ada akun, halaman `/login` menampilkan tautan **Buat akun administrator** → `/setup`.
2. Isi nama sekolah, username admin, nama tampilan, dan password (minimal **8 karakter**). Password di-hash dengan PBKDF2-SHA256 dan tidak dapat dikembalikan; simpan di tempat aman.
3. Klik **Buat Akun & Mulai**.
4. Perangkat yang melakukan setup otomatis menjadi **perangkat registrasi resmi** (`bootstrapAdminDevice`), mencatat audit `DEVICE.BOOTSTRAP`, dan menandai sinkronisasi awal selesai.

Akun admin hanya dibuat sekali. Untuk menambah akun lain, gunakan **Pengaturan → Pengguna**.

### 1.2 Hubungkan Google Drive dan pilih folder induk

1. Pastikan variabel `VITE_GOOGLE_CLIENT_ID` (dan opsional `VITE_GOOGLE_PICKER_API_KEY`) sudah diisi serta aplikasi dijalankan di HTTPS/localhost.
2. Buka **Pengaturan → Sinkronisasi**.
3. Klik **Hubungkan Drive** dan setujui akun Google. Token hanya disimpan di memori; jika halaman dimuat ulang, hubungkan lagi.
4. Klik **Pilih via Picker** untuk memilih folder induk, atau masukkan Folder ID Drive secara manual lalu **Simpan**. Tanpa API key Picker, opsi manual tetap tersedia.
5. Klik **Simpan** pada Folder ID bila memakai input manual. Sistem membuat struktur `SIPERSURAT/{DATA-SYNC,BACKUP,ARCHIVE}/...` di Drive. Detail struktur ada di [`GOOGLE_DRIVE_OAUTH.md`](GOOGLE_DRIVE_OAUTH.md).

### 1.3 Registrasi perangkat baru dan sinkronisasi awal

Perangkat baru **tidak otomatis** mendapat akses.

| Langkah | Pelaku | Lokasi / aksi |
|---|---|---|
| 1 | Admin | **Pengaturan → Perangkat → Buat Kode (48 jam)**; masukkan nama perangkat, salin kode yang tampil **sekali** |
| 2 | Pengguna perangkat baru | Buka `/registrasi-perangkat`, masukkan kode aktivasi, isi nama perangkat (opsional), klik **Daftarkan Perangkat** |
| 3 | Pengguna perangkat baru | Hubungkan Drive di halaman sinkronisasi, lalu klik **Jalankan Sinkronisasi Awal** pada halaman registrasi |
| 4 | Admin | Pada daftar perangkat, pastikan `Sinkron awal = Selesai`, lalu klik **Setujui** untuk mengubah status `PENDING → ACTIVE` |

Kode aktivasi berlaku 48 jam, bersifat **case-sensitive**, dan merupakan token mandiri bertanda tangan HMAC: perangkat baru dapat memverifikasinya tanpa memiliki database admin. Hash kode tetap dicatat untuk penandaan sekali pakai secara lokal; pemakaian lintas perangkat mengikuti paket sinkronisasi. Pastikan `VITE_ACTIVATION_PEPPER` identik pada semua build. Perangkat berstatus `PENDING` **tidak dapat mengakses seluruh data** kecuali pengguna berrole `ADMIN`. Perangkat berstatus `INACTIVE`/`REVOKED` ditolak saat login dan ditampilkan sebagai “Akses perangkat dicabut”.

Admin juga dapat mengubah perangkat registrasi resmi lewat tombol **Jadikan Registrasi** di daftar perangkat. Tindakan ini dicatat sebagai audit `CRITICAL`.

## 2. Peran dan hak akses

| Kemampuan | `ADMIN` | `TU` | `GURU` |
|---|---|---|---|
| Semua pengaturan & master data | ✅ | — | — |
| Tambah/edit pengguna, perangkat, backup, konflik | ✅ | — | — |
| Buat & edit surat masuk, arsipkan | ✅ | ✅ | — |
| Lihat surat masuk | Semua | Semua | Hanya unit sendiri / yang ditujukan ke nama sendiri |
| Buat disposisi & ubah statusnya | ✅ | ✅ | — |
| Beri tindak lanjut disposisi | ✅ | ✅ | ✅ untuk penerima yang dituju |
| Buat draft surat keluar & ajukan | ✅ | ✅ | ✅ (lihat hanya pengajuan sendiri) |
| Periksa/setujui/daftarkan nomor resmi | ✅ | ✅ | — |
| Lihat laporan & cetak | ✅ | ✅ | ✅ (laporan, cetak milik sendiri) |

Catatan: tombol lanjutan (`TANDATANGANI`, `DIKIRIM`, `SELESAI`) pada surat keluar tersedia berdasarkan status surat; pembatasan peran terutama diterapkan pada pembuatan/penomoran dan filter tampilan.

## 3. Surat masuk

1. Buka **Surat Masuk**, klik **Tambah Surat** (hanya ADMIN/TU).
2. Isi nomor surat pengirim, tanggal surat, tanggal diterima, asal, instansi, perihal, jenis, klasifikasi, sifat (`BIASA`/`PENTING`/`RAHASIA`/`SANGAT_RAHASIA`), unit tujuan, tujuan, ringkasan. Lampirkan scan PDF/JPG/PNG bila ada.
3. Simpan. Sistem membuat **nomor agenda otomatis** berformat `NNN/AGD/TAHUN` dan status awal `DITERIMA`.
4. Gunakan filter tanggal, pengirim/perihal, jenis, dan status untuk mencari. Tombol **Cetak Agenda** menghasilkan PDF berisi hasil filter.
5. Aksi yang tersedia: lihat detail, preview/download lampiran, cetak ringkasan, edit, arsipkan, hapus (*soft delete*, masih bisa dipulihkan dari backup).

Status yang dikenal: `DITERIMA`, `DIDISPOSISI`, `DITINDAKLANJUTI`, `SELESAI`, `DIARSIPKAN`. Saat disposisi dibuat, status surat masuk berubah menjadi `DIDISPOSISI`. Pengarsipan membuat record `document_archives` dengan nomor `ARS-M/<nomor agenda>` dan mengubah status menjadi `DIARSIPKAN`.

> Nomor agenda dihitung dari data surat masuk yang tersimpan **di perangkat tempat input dibuat**. Jika beberapa perangkat input secara offline, jalankan sinkronisasi sebelum membuat surat baru untuk mengurangi risiko nomor agenda ganda.

## 4. Disposisi

1. Buka **Disposisi**, klik **Buat Disposisi** (ADMIN/TU).
2. Pilih surat masuk, tanggal, jenis instruksi (`DIKETAHUI`, `DITINDAKLANJUTI`, `DIPELAJARI`, `DIKOORDINASIKAN`, `DILAKSANAKAN`, `DIARSIPKAN`), tulis instruksi, tentukan batas waktu, dan pilih **minimal satu penerima**.
3. Simpan. Nomor disposisi dibuat `DISP/NNN/TAHUN`, status awal `MENUNGGU`, dan notifikasi dikirim ke setiap penerima.
4. ADMIN/TU dapat memindahkan status `MENUNGGU → DIPROSES → SELESAI`, atau **Tunda** (`DITUNDA`).
5. Penerima membuka detail disposisi, menulis tindak lanjut, lalu menyimpannya; status penerima menjadi `SELESAI` dan notifikasi dikirim kembali ke pemberi disposisi.
6. Lembar disposisi dapat dicetak sebagai PDF.

Guru hanya melihat disposisi yang ditujukan kepadanya.

## 5. Surat keluar

Alur status:

```text
DRAFT → DIAJUKAN → PEMERIKSAAN → DISETUJUI → TERDAFTAR → DITANDATANGANI → DIKIRIM → SELESAI
                                      │
                                      └── DIBATALKAN
```

| Aksi | Tombol | Catatan |
|---|---|---|
| Buat draft | **Buat Surat** | Isi tanggal, jenis, klasifikasi, instansi/tujuan, perihal, isi, penandatangan; nomor resmi masih kosong |
| Ajukan | **Ajukan** | Dilakukan Guru dari status `DRAFT`; pengguna TU/admin dapat langsung menyiapkan draft |
| Periksa | **Periksa** | `DIAJUKAN → PEMERIKSAAN` |
| Setujui | **Setujui** | `PEMERIKSAAN → DISETUJUI` |
| Daftarkan | **Daftarkan** | Menerbitkan nomor resmi; hanya muncul bila **gate penomoran aktif** |
| Tandatangani / Kirim / Selesai | Tombol sesuai status | Mengubah status lanjutan |
| Batalkan | Ikon hapus + alasan | Nomor resmi yang sudah diterbitkan **tidak dipakai ulang** |
| Cetak / Download PDF | Ikon printer/unduh | Memakai kop identitas sekolah; draft yang dicetak ditandai sebagai generated |

Draft yang sudah memiliki nomor resmi **tidak dapat diedit**.

## 6. Penomoran resmi (SINGLE WRITER)

Format default: `{SEQ}/{CODE}/{SCHOOL}/{MONTH}/{YEAR}`, misalnya `001/UND/SMKN6-MJ/XI/2026`. Variabel:

- `{SEQ}` — urutan 3 digit per jenis surat dan tahun.
- `{CODE}` — kode `letter_types`.
- `{SCHOOL}` — `school_code` (jika kosong, singkatan sekolah).
- `{MONTH}` — bulan Romawi.
- `{YEAR}` — tahun tanggal surat.

Format dan kebijakan reset (`TAHUNAN`/`BULANAN`/`TIDAK_PERNAH`) diatur di **Pengaturan → Identitas Sekolah**.

**Hanya perangkat registrasi resmi yang boleh menerbitkan nomor.** Ini disebut *SINGLE WRITER*: karena tidak ada database transaksional pusat dan perangkat bisa offline, penulisan nomor oleh banyak perangkat berisiko menghasilkan nomor ganda. Perangkat lain mengajukan draft dan menunggu perangkat registrasi mendaftarkannya.

Penerbitan hanya berhasil bila semua syarat berikut terpenuhi (lihat `checkNumberingGate()`):

- [ ] Perangkat ini adalah perangkat registrasi resmi.
- [ ] Tidak ada konflik sinkronisasi yang belum diselesaikan.
- [ ] Sinkronisasi awal perangkat sudah selesai.
- [ ] Data sinkronisasi perangkat registrasi mutakhir (batas default 24 jam jika masih ada perubahan pending).
- [ ] Status surat termasuk `DIAJUKAN`, `PEMERIKSAAN`, atau `DISETUJUI`.
- [ ] Surat belum memiliki nomor resmi, jenis surat dan identitas sekolah tersedia.

Sistem memeriksa seluruh nomor yang sudah diketahui (termasuk yang dibatalkan) dan melewati nomor yang sudah dipakai. Setiap penerbitan dicatat di audit log dengan aksi `NUMBER.PUBLISHED`; pembatalan dicatat `NUMBER.CANCELED`. Halaman **Pengaturan → Penomoran** menampilkan status gate, seri nomor, jumlah nomor diketahui, dan riwayat penerbitan.

## 7. Agenda, arsip, dan laporan

- **Agenda** (`/agenda`): rekap surat masuk dan surat keluar per bulan/tahun. Surat keluar yang tampil adalah yang sudah memiliki nomor resmi. Tersedia **Cetak** PDF dan **Excel**.
- **Arsip** (`/arsip`): daftar dokumen hasil pengarsipan beserta pencarian dan ekspor.
- **Laporan** (`/laporan`): sembilan jenis laporan — Surat Masuk, Surat Keluar, Disposisi, per Jenis Surat, Bulanan, Tahunan, Aktivitas Pengguna, Status Sinkronisasi, dan Backup. Filter periode berlaku, lalu cetak/PDF atau Excel.
- **Audit** (`/pengaturan/audit`): catatan aktivitas penting dengan filter level `INFO`/`WARNING`/`CRITICAL` dan ekspor Excel.

## 8. Backup, passphrase, dan restore

### 8.1 Passphrase backup

1. Buka **Pengaturan → Backup**.
2. Jika belum ada passphrase, buat **minimal 10 karakter**, lalu klik **Simpan Passphrase**. Sistem menyimpan **salt** dan **verifier** terenkripsi, bukan passphrase asli.
3. Setiap kali aplikasi dibuka/dimuat ulang, passphrase harus **dimasukkan lagi** dan tombol **Buka Kunci** ditekan. Tombol **Kunci** mencopotnya dari memori; logout juga membersihkannya.
4. Backup otomatis **dilewati** bila passphrase tidak aktif dan akan menampilkan status tertunda.

Algoritma: AES-256-GCM untuk database, PBKDF2-SHA256 dengan 210.000 iterasi untuk turunan kunci. Token OAuth tidak pernah masuk backup.

### 8.2 Jadwal dan BACKUP DUE

- Slot backup: **00.00, 06.00, 12.00, 18.00 WIB** (UTC+7, tanpa DST).
- Saat aplikasi aktif, pengecekan dijalankan berkala dan ketika tab kembali terlihat. Jika waktu terakhir backup lebih lama dari slot terdekat, muncul status **BACKUP DUE — jalankan backup tertunda**.
- Untuk mengatasinya: masukkan passphrase, pastikan Drive terhubung, lalu jalankan backup (otomatis saat aplikasi dibuka atau lewat tombol backup manual ke Drive).
- Jika tidak ada aplikasi yang aktif, **tidak ada backup yang berjalan**; sistem baru menjalankannya saat aplikasi dibuka kembali. Ini bukan kegagalan, melainkan konsekuensi arsitektur tanpa server.

### 8.3 Backup manual & retensi

- **Backup ke Drive**: zip diunggah ke folder `BACKUP` sesuai jenis, diunduh kembali, dan checksum-nya dibandingkan. Status `BERHASIL` hanya bila cocok.
- **Download Zip**: zip disimpan ke perangkat untuk disimpan offline.
- Isi zip: `database/sipersurat.json.enc`, `metadata/encryption.json`, `metadata/backup-info.json`, `metadata/checksum.sha256`, `storage/*` (lampiran/template/logo), `sync/change-log.json`, dan `sync/sync-state.json`.
- **Terapkan Retensi** menghapus backup lama yang sudah ada pengganti lebih baru. Default: 6-jam 30 hari, harian 90 hari, bulanan 12 bulan, manual/lokal 7 hari. Backup lama tidak dihapus sebelum backup baru terverifikasi.

### 8.4 Restore dan migrasi

1. Di halaman **Backup**, pilih file `.zip` dan masukkan passphrase yang sesuai dengan backup.
2. Klik **Validasi & Lihat Ringkasan**. Sistem memeriksa checksum setiap entri, mendekripsi database, dan menampilkan ID backup, perangkat asal, waktu, versi skema, jumlah rekam/dokumen. Peringatan muncul bila backup berasal dari skema yang lebih baru.
3. Setelah yakin, pilih:
   - **Restore Perangkat Ini** — mengganti database lokal dengan isi backup.
   - **Migrasi ke Perangkat Baru** — mode `MIGRATION` untuk perpindahan perangkat.
4. Konfirmasi dialog. Sebelum menimpa data, sistem membuat **backup darurat otomatis** (`PRE_RESTORE_...`) sebagai lampiran lokal.
5. Proses berjalan dalam satu transaksi IndexedDB, lalu jumlah rekam per tabel diverifikasi. Audit `RESTORE.COMPLETED` dicatat.

Perhatian: restore mengganti seluruh tabel yang tercakup backup (termasuk pengguna, perangkat, dan pengaturan). Setelah migrasi, periksa status perangkat; bila perlu, jalankan sinkronisasi awal dan minta admin menyetujui atau menetapkan ulang perangkat registrasi.

## 9. Konflik sinkronisasi

Konflik terjadi bila checksum payload tidak cocok, versi lokal lebih baru, versi sama tetapi isi berbeda, atau perubahan menyangkut data kritis (nomor resmi, urutan nomor, perangkat registrasi, pengguna, role, identitas sekolah). Data **tidak pernah ditimpa diam-diam**.

1. Notifikasi “Konflik sinkronisasi” muncul untuk admin; buka **Pengaturan → Konflik**.
2. Tiap kartu menampilkan entitas, versi lokal vs remote, waktu deteksi, serta payload lokal/remote.
3. Pilih salah satu:
   - **Pakai LOKAL** — mempertahankan data perangkat saat ini.
   - **Pakai REMOTE** — memakai data yang diterima dari perangkat lain.
   - **Pakai GABUNGAN** — memakai remote sebagai dasar, lalu menambahkan field lokal yang berbeda dengan akhiran `_lokal`; field `id`, `created_at`, `created_by`, `version`, `device_id`, dan nilai objek tidak digabung.
4. Setelah diputuskan, versi record naik, status sinkronisasi menjadi `PENDING`, dan keputusan dicatat di audit `CRITICAL`.

Penerbitan nomor resmi tetap diblokir selama ada konflik terbuka.

## 10. Logout, cache, dan keamanan data

- **Logout hanya mengakhiri sesi.** Data IndexedDB **tidak dihapus**, begitu juga passphrase backup dibersihkan dari memori. Login lagi dengan akun yang sama akan menampilkan data lokal yang sama.
- Aplikasi meminta penyimpanan persisten (`requestPersistentStorage`) agar browser tidak membuang data saat ruang penyimpanan menipis.
- Aset aplikasi (HTML/JS/CSS) disimpan cache oleh service worker; **data surat ada di IndexedDB**, bukan di cache statis.
- **Menghapus data situs/browser akan menghapus seluruh data lokal** dan sesi. Selalu jalankan backup sebelum membersihkan browser, reinstall, atau berpindah perangkat.
- Akun/perangkat yang dinonaktifkan atau dicabut tetap dapat dipakai **offline** sampai perangkat tersebut melakukan sinkronisasi dan menerima status terbaru. Ini disebut pencabutan *eventual* dan tidak bisa dihilangkan dalam arsitektur tanpa server.

## 11. Memasang aplikasi (PWA)

SIPERSURAT dapat dipasang seperti aplikasi native. PWA memerlukan **HTTPS** (localhost dikecualikan).

| Platform | Langkah |
|---|---|
| Chrome / Edge (Windows, macOS, Linux) | Klik ikon *Install app* di bilah alamat, atau menu ⋮ → *Cast, save, and share* → *Install page as app* |
| Android (Chrome) | Menu ⋮ → *Add to Home screen* atau *Install app* |
| iOS (Safari) | Tombol Share → *Add to Home Screen* |

Setelah dipasang, buka dari ikon di home screen/Start Menu; aplikasi tampil tanpa bilah alamat (*standalone*). Saat ada versi baru, aplikasi menampilkan prompt pembaruan — setujui agar service worker versi baru aktif. Ikon shortcut tersedia untuk **Surat Masuk**, **Surat Keluar**, dan **Sinkronisasi**.

## 12. Pemecahan masalah singkat

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| “Google OAuth Client ID belum diatur di .env” | `VITE_GOOGLE_CLIENT_ID` kosong atau belum di-build | Isi variabel, lalu jalankan ulang dev/build |
| Tombol Picker tidak aktif | `VITE_GOOGLE_PICKER_API_KEY` kosong / referrer belum didaftarkan | Isi API key dan pembatasannya, atau masukkan Folder ID manual |
| “Penerbitan nomor resmi diblokir” | Bukan perangkat registrasi, konflik terbuka, sync awal belum selesai, atau data lama | Baca alasan pada halaman **Penomoran**, selesaikan, lalu ulangi |
| Status **BACKUP DUE** | Passphrase belum aktif / Drive belum terhubung / slot terlewat | Masukkan passphrase, hubungkan Drive, jalankan backup |
| Perangkat tetap `PENDING` | Belum sinkronisasi awal atau belum disetujui admin | Sinkronkan dulu, lalu minta admin klik **Setujui** |
| “Akses perangkat dicabut” | Status perangkat `REVOKED`/`INACTIVE` | Hubungi administrator |
| Perubahan belum muncul di perangkat lain | Perangkat belum sinkron / ada antrean `PENDING` | Klik **Sinkron Sekarang** di kedua perangkat, periksa halaman Konflik |
| data tidak ada setelah logout | Salah akun atau data lokal belum tersinkron | Login akun yang benar; jika perangkat baru, restore dari backup |
| Kesalahan console terkait Google setelah deploy | Origin/redirect/referrer atau CSP belum diperbarui | Rujuk [`DEPLOYMENT.md`](DEPLOYMENT.md) dan [`GOOGLE_DRIVE_OAUTH.md`](GOOGLE_DRIVE_OAUTH.md) |

> **Status verifikasi dokumen:** alur utama telah diverifikasi dengan 36 unit/integration test dan 11 e2e Playwright Chromium (lihat README). Proses deploy dan sinkronisasi Google Drive dengan kredensial sungguhan belum diuji.
