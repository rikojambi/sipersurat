# SIPERSURAT — Buku Agenda Surat Sekolah

SIPERSURAT adalah **Progressive Web App (PWA) local-first** untuk mengelola surat masuk, disposisi, dan surat keluar di lingkungan sekolah (SMKN 6 Muaro Jambi). Seluruh data utama disimpan di perangkat pengguna; **tidak ada backend atau database server**. Google Drive digunakan hanya sebagai **medium pertukaran paket perubahan dan backup**, bukan sebagai database aktif.

Dokumentasi teknis pendukung: [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md), [`docs/GOOGLE_DRIVE_OAUTH.md`](docs/GOOGLE_DRIVE_OAUTH.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/PANDUAN_PENGGUNAAN.md`](docs/PANDUAN_PENGGUNAAN.md).

> **Status verifikasi:** `npm test`, `npm run typecheck`, `npm run build`, dan `npm run e2e` **telah dijalankan** pada sumber ini: 36 unit test dan 11 test Playwright Chromium lulus, typecheck/build bersih. Deploy ke Netlify dan sinkronisasi Google Drive/OAuth dengan kredensial nyata **belum dilakukan** (lihat Keterbatasan).

## Ringkasan arsitektur

| Aspek | Pilihan implementasi | Catatan |
|---|---|---|
| Sumber kebenaran | IndexedDB melalui Dexie (`src/db/schema.ts`) | Data tetap bisa dibaca/ditulis saat offline |
| Pertukaran antarperangkat | Paket perubahan JSON + manifest per perangkat di Google Drive | `src/lib/syncManager.ts`, `src/lib/drive.ts` |
| Backend | Tidak ada | Tidak ada server aplikasi, tidak ada API sendiri |
| Autentikasi | Akun lokal, password di-hash PBKDF2-SHA256 | Google OAuth hanya untuk akses Drive milik pengguna |
| Penomoran resmi | **SINGLE WRITER**: hanya perangkat registrasi yang menerbitkan nomor | `src/lib/numbering.ts` |
| Integritas | UUID, `version`, checksum SHA-256, `data_versions`, `sync_conflicts` | Konflik tidak ditimpa otomatis |
| Backup | ZIP terenkripsi AES-256-GCM dengan kunci PBKDF2 dari passphrase | `src/lib/backup.ts` |
| PWA | `vite-plugin-pwa`, `registerType: 'prompt'` | Service worker aktif di HTTPS/localhost |

Alur sederhana:

```text
Perangkat A (IndexedDB) ──paket perubahan + checksum──> Google Drive
                                  <──manifest per perangkat── Perangkat B (IndexedDB)
```

Setiap perangkat membaca manifest, mengunduh hanya paket yang belum diterapkannya, memverifikasi checksum, lalu menyimpan `change_id` ke `data_versions` agar pemakaian ulang paket tidak menimbulkan duplikat.

## Fitur utama

- [x] Registrasi surat masuk dengan nomor agenda otomatis (`NNN/AGD/TAHUN`), lampiran PDF/JPG/PNG, filter, cetak agenda.
- [x] Disposisi surat masuk: penerima, instruksi, batas waktu, tindak lanjut, notifikasi, cetak lembar disposisi.
- [x] Surat keluar: draft → pengajuan → pemeriksaan → persetujuan → nomor resmi → tanda tangan → kirim → selesai.
- [x] Penomoran resmi dengan format `{SEQ}/{CODE}/{SCHOOL}/{MONTH}/{YEAR}` dan nomor batal yang tidak dipakai ulang.
- [x] Sinkronisasi berbasis manifest per perangkat, checksum, dan idempotensi; antrean/riwayat/konflik sinkronisasi.
- [x] Role `ADMIN`, `TU`, `GURU` dengan pembatasan data di halaman tertentu.
- [x] Registrasi perangkat melalui kode aktivasi mandiri bertanda tangan HMAC (berlaku 48 jam, bersifat case-sensitive) dan persetujuan admin. Kode dapat diverifikasi perangkat baru tanpa paket Drive terlebih dahulu.
- [x] Backup manual dan otomatis pada slot **00.00, 06.00, 12.00, 18.00 WIB**, status **BACKUP DUE**, retensi, serta restore/migrasi dengan validasi checksum.
- [x] Buku agenda, arsip dokumen, dan laporan (cetak/PDF/Excel).
- [x] Audit log untuk aksi penting seperti penerbitan nomor, restore, dan perubahan perangkat.

## Teknologi

| Kategori | Dependensi |
|---|---|
| UI | React 19, React Router 7, Tailwind CSS, Radix UI, lucide-react |
| Data lokal | Dexie 4 (IndexedDB), zod untuk validasi form |
| Sinkronisasi & Drive | Google Identity Services, Google Drive API v3, Google Picker API |
| Kriptografi | Web Crypto API (AES-GCM, PBKDF2-SHA256), SHA-256 |
| Dokumen | jsPDF + jspdf-autotable, pdfjs-dist, xlsx, JSZip |
| PWA & build | Vite 6, `vite-plugin-pwa` (Workbox), TypeScript 5 |
| Pengujian | Vitest 3 + Testing Library + jsdom + fake-indexeddb; Playwright (script e2e) |

## Mulai cepat

Prasyarat: Node.js dan npm terpasang. Versi Node tidak ditetapkan melalui field `engines` di `package.json`; gunakan LTS yang masih didukung (mis. Node 20).

```bash
# 1. Install dependensi
npm install

# 2. Salin contoh konfigurasi, lalu isi nilai Google Anda
cp .env.example .env      # Windows: copy .env.example .env

# 3. Jalankan aplikasi Pengembangan
npm run dev

# 4. Perintah verifikasi yang tersedia
npm test          # vitest run
npm run typecheck # tsc --noEmit
npm run build     # tsc -b && vite build
npm run e2e       # playwright test
```

| Perintah | Skrip aktual | Status di repositori ini |
|---|---|---|
| `npm run dev` | `vite` | Tersedia; port default Vite `5173` |
| `npm test` | `vitest run` | **Lulus:** 7 file / 36 test (`src/test/`) |
| `npm run typecheck` | `tsc --noEmit` | **Lulus** tanpa error |
| `npm run build` | `tsc -b && vite build` | **Lulus**; PWA service worker dan 16 entry precache dihasilkan |
| `npm run e2e` | `playwright test` | **Lulus:** 11 test Chromium (`playwright.config.ts`, `tests/e2e/`, setelah `npx playwright install chromium`) |

Catatan: `npm run dev` memerlukan `.env` dengan konfigurasi Google jika ingin memakai Drive/Picker. Aplikasi tetap dapat dibuka tanpa itu untuk alur lokal; fitur Drive menampilkan pesan kesalahan yang menjelaskan variabel yang belum diatur.

## Variabel lingkungan

Semua variabel berasal dari `.env.example`. Variabel `VITE_*` **disisipkan ke bundle saat build** dan bersifat publik; jangan menaruh client secret atau passphrase di sini.

| Variabel | Wajib untuk | Keterangan |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Koneksi Drive | OAuth client ID tipe *Web application* dari Google Cloud |
| `VITE_GOOGLE_SCOPES` | Koneksi Drive | Default: `https://www.googleapis.com/auth/drive.file` |
| `VITE_GOOGLE_PICKER_API_KEY` | Pemilih folder | Opsional; tanpa ini, Folder ID Drive dapat dimasukkan manual |
| `VITE_APP_NAME` | Identitas | Dideklarasikan di `src/vite-env.d.ts`; saat ini belum dipakai runtime |
| `VITE_SCHOOL_CODE` | Identitas | Sama; kode sekolah aktual berasal dari `school_settings` |
| `VITE_APP_URL` | Identitas | Sama; URL deploy sebaiknya tetap dicantumkan sebagai referensi |
| `VITE_ACTIVATION_PEPPER` | Kode aktivasi | Pepper HMAC untuk token aktivasi; **wajib sama** di semua perangkat. Nilai unik disarankan di produksi |

Nilai `VITE_GOOGLE_*` dibaca di `getDriveConfig()` (`src/lib/drive.ts`). Folder induk Drive **tidak** disimpan di `.env`, melainkan di pengaturan lokal IndexedDB (`drive_root_folder_id`) setelah admin memilih/menyimpan Folder ID.

## Struktur folder

```text
.
├── public/                  # favicon.svg, icon-192.svg, icon-512.svg
├── src/
│   ├── components/          # Layout, PdfPreview, komponen ui/
│   ├── context/             # AppContext: sesi, status Drive, sync, backup due
│   ├── db/                  # schema.ts (Dexie), repository.ts (CRUD + audit)
│   ├── lib/                 # auth, device, drive, numbering, syncManager, backup,
│   │                        # crypto, attachments, pdf, utils
│   ├── pages/               # Dashboard, Surat Masuk/Keluar, Disposisi, Agenda/Arsip,
│   │                        # Laporan, AuthPages, pengaturan inti & operasional
│   ├── test/                # 7 file unit/integration test + helper & setup jsdom
│   ├── App.tsx              # Rute & proteksi perangkat/sesi (ToastViewport global)
│   └── types.ts             # Tipe entitas
├── docs/                    # Dokumentasi ini + ARSITEKTUR.md
├── tests/e2e/               # 4 spesifikasi Playwright + helper
├── playwright.config.ts     # Konfigurasi e2e Chromium & preview server
├── .env.example             # Contoh variabel lingkungan
├── netlify.toml             # Build, publish dist, redirect SPA, header CSP
├── vite.config.ts           # Alias '@', PWA, konfigurasi Vitest
└── package.json             # Dependensi dan skrip
```

## Deployment (ringkas)

Repositori sumber dapat di-import ke Netlify. `netlify.toml` sudah menetapkan `npm run build`, publish `dist`, redirect `/* → /index.html` (200) untuk routing SPA, serta header keamanan/CSP yang mengizinkan domain Google. Variabel lingkungan diatur di **Netlify → Site configuration → Environment variables**, lalu build ulang. PWA/service worker memerlukan HTTPS (localhost dikecualikan). Lihat [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) untuk langkah lengkap dan daftar smoke test.

## Pengujian

- Unit/integration test berada di `src/test/` (7 file, 36 test) menggunakan Vitest + jsdom + fake-indexeddb. Cakupan: kriptografi, skema/migrasi, auth/peran/perangkat, alur surat/lampiran/PDF, penomoran, sinkronisasi Drive tiruan, backup/restore.
- `npm run e2e` menjalankan 11 test Playwright Chromium terhadap hasil build (`npm run preview`) melalui `playwright.config.ts`; browser harus dipasang sekali dengan `npx playwright install chromium`.
- **Hasil terverifikasi:** `npm test` 36/36 lulus, `npm run typecheck` lulus, `npm run build` lulus, `npm run e2e` 11/11 lulus. Deploy dan OAuth/Drive sungguhan belum diuji karena belum ada kredensial/remote.

## Keterbatasan saat ini

1. **Google Drive/OAuth belum dikonfigurasi di repositori ini.** `.env.example` hanya berisi placeholder; admin perlu project Google Cloud, OAuth client ID, API key Picker, serta OAuth consent screen sendiri.
2. **Token OAuth hanya di memori.** Tidak ada refresh token yang disimpan. Setelah halaman dimuat ulang/google token kedaluwarsa, koneksi harus diulang (silent attempt dilakukan lebih dulu, lalu jatuh ke consent saat gagal).
3. **Pencabutan akses bersifat eventual.** Akun/perangkat yang dinonaktifkan tetap dapat dipakai offline sampai perangkat tersebut sinkron dan menerima status terbaru.
4. **Passphrase backup wajib dimasukkan kembali setiap sesi.** Passphrase tidak disimpan; tanpa passphrase aktif, backup otomatis dilewati dan status **BACKUP DUE** muncul saat aplikasi dibuka.
5. **Backup hanya berjalan saat aplikasi aktif.** Tidak ada penjadwal server; slot WIB yang terlewat dijalankan sebagai backup tertunda saat aplikasi dibuka kembali.
6. **Sinkronisasi tidak real-time.** Drive tidak menyediakan push gratis ke browser; sinkronisasi terjadi saat aplikasi aktif atau tombol ditekan.
7. **Data lokal bisa hilang** jika data situs/browser dihapus. Gunakan fitur backup sebelum membersihkan cache atau berpindah perangkat.
8. `VITE_APP_NAME`, `VITE_SCHOOL_CODE`, dan `VITE_APP_URL` saat ini hanya dideklarasikan, belum dibaca oleh kode aplikasi. `VITE_ACTIVATION_PEPPER` **sudah dipakai** untuk menandatangani kode aktivasi.
9. **Kode aktivasi bersifat case-sensitive** dan tergantung pepper build yang sama di semua perangkat. Mengubah pepper membuat kode lama tidak valid; pemakaian sekali pakai lintas perangkat tetap bergantung pada sinkronisasi paket.
10. Beberapa detail di `docs/ARSITEKTUR.md` masih bersifat desain awal; misalnya implementasi memakai manifest **`manifest-{deviceId}.json`** per perangkat dan file database backup **`sipersurat.json.enc`**, bukan satu `manifest.json` / `sipersurat.json` seperti di desain. Folder `DEVICES/` dan `ARCHIVE/` dibuat tetapi belum dipakai penulis oleh kode sinkronisasi.
11. `DriveClient` memakai GIS Token Client tanpa implementasi PKCE eksplisit; hal ini perlu diperhatikan jika auditor mensyaratkan PKCE.
