# Google Drive, Google Picker, dan OAuth

Dokumen ini menjelaskan cara menyiapkan Google Cloud agar SIPERSURAT dapat menghubungkan Google Drive pengguna, memilih folder induk, dan bertukar paket sinkronisasi/backup. Kode terkait ada di `src/lib/drive.ts`, `src/lib/syncManager.ts`, dan `src/lib/backup.ts`.

> Repositori ini **belum** berisi kredensial Google. `.env.example` hanya contoh. Jangan menaruh client secret di aplikasi: SIPERSURAT adalah SPA/PWA dan memakai *public client*.

## 1. Buat project Google Cloud

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan buat project baru, misalnya `sipersurat-prod`.
2. Pastikan billing tidak diperlukan untuk penggunaan Drive API standar (kuota pribadi). Jika organization membatasi pembuatan project, minta admin Google Workspace.
3. Catat project ID dan pastikan akun Google admin sekolah menjadi *owner* atau *editor*.

## 2. Konfigurasi OAuth consent screen

Buka **APIs & Services → OAuth consent screen**.

| Field | Nilai yang disarankan |
|---|---|
| User Type | `External` untuk akun Gmail biasa; `Internal` hanya jika semua pengguna berada di satu Google Workspace |
| App name | `SIPERSURAT` |
| User support email | Email admin sekolah |
| Developer contact | Email pengembang/admin |
| Authorized domains | Domain deploy, mis. `netlify.app` dan domain kustom jika ada |
| Scopes | Tambah `https://www.googleapis.com/auth/drive.file` |
| Test users | Tambahkan akun Google admin/guru yang akan dipakai saat aplikasi masih berstatus *Testing* |

Aplikasi dapat tetap berstatus *Testing* selama akun yang dipakai terdaftar sebagai test user. Untuk *publishing*, ajukan verifikasi Google bila diminta. Gunakan scope **paling sempit** (`drive.file`), bukan `drive` penuh.

## 3. Aktifkan API

Pada **APIs & Services → Library**, aktifkan:

- **Google Drive API** — untuk upload/download/list file dan folder.
- **Google Picker API** — untuk dialog pemilihan folder induk.

## 4. Buat OAuth client ID (Web application)

Buka **APIs & Services → Credentials → Create Credentials → OAuth client ID**, pilih **Web application**.

### Authorized JavaScript origins

Daftarkan origin tanpa path dan tanpa trailing slash:

```text
http://localhost:5173
http://localhost:4173
http://localhost:8888
https://sipersurat.netlify.app
https://<domain-kustom-anda>
```

- `5173` = default `npm run dev`.
- `4173` = default `npm run preview`.
- `8888` = Netlify Dev (opsional).
- `sipersurat.netlify.app` = contoh dari `.env.example`; sesuaikan dengan `Site URL` Netlify Anda.
- Tambahkan origin HTTPS lain bila aplikasi di-deploy di domain lain. `localhost` dan HTTPS keduanya diperlukan untuk pengembangan dan produksi.

### Authorized redirect URIs

GIS token client tidak memakai redirect seperti alur kode, tetapi Google tetap meminta daftar ini. Isi dengan URL aplikasi (dengan trailing `/`):

```text
http://localhost:5173/
http://localhost:4173/
http://localhost:8888/
https://sipersurat.netlify.app/
https://<domain-kustom-anda>/
```

Salin **Client ID** yang dihasilkan (berakhir dengan `.apps.googleusercontent.com`). Client secret tidak dipakai dan tidak boleh disimpan di frontend.

## 5. Buat API Key untuk Google Picker

Masih di **Credentials**, buat **API key**, lalu atur pembatasan:

1. Pilih key → **HTTP referrers (web sites)**.
2. Tambahkan referrer:

```text
http://localhost:5173/*
http://localhost:4173/*
http://localhost:8888/*
https://sipersurat.netlify.app/*
https://<domain-kustom-anda>/*
```

3. Pada **API restrictions**, batasi hanya pada **Google Picker API**.
4. Simpan. API key bersifat publik di bundle, tetapi pembatasan referrer wajib dipasang.

Tanpa API key ini, tombol **Pilih via Picker** dinonaktifkan; admin masih dapat memasukkan Folder ID Drive secara manual di halaman **Pengaturan → Sinkronisasi**.

## 6. Variabel lingkungan yang dipakai kode

Nama berikut **tepat** dan harus sama dengan yang dibaca `getDriveConfig()`:

```env
VITE_GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
VITE_GOOGLE_SCOPES=https://www.googleapis.com/auth/drive.file
VITE_GOOGLE_PICKER_API_KEY=AIza...
```

| Variabel | Wajib | Fungsi di kode |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Ya untuk Drive | `initTokenClient({ client_id, scope })`. Jika kosong, `connect()` melempar error yang menyebut nama variabel ini. |
| `VITE_GOOGLE_SCOPES` | Tidak (default) | Jika kosong, pakai `https://www.googleapis.com/auth/drive.file`. Jangan diubah kecuali Google mengharuskan. |
| `VITE_GOOGLE_PICKER_API_KEY` | Tidak | Diperlukan `pickFolder()`; tanpa itu tersedia input Folder ID manual. |

Salin ke `.env` untuk lokal, dan daftarkan dengan nama yang sama di Netlify untuk produksi. Variabel `VITE_*` tertanam di bundle saat build dan dapat dilihat publik; **jangan** memasukkan secret atau passphrase backup. Setelah mengubah nilai di Netlify, lakukan build ulang.

## 7. Struktur folder di Google Drive

Admin memilih satu **folder induk** melalui Picker atau input ID. ID tersebut disimpan di IndexedDB sebagai `drive_root_folder_id`, lalu `ensureStructure()` membuat struktur berikut di bawah folder induk tersebut:

```text
<Folder induk yang dipilih admin>/
└── SIPERSURAT/
    ├── DATA-SYNC/
    │   ├── DEVICES/
    │   ├── CHANGE-LOGS/
    │   └── MANIFEST/
    ├── BACKUP/
    │   ├── HOURLY/
    │   ├── DAILY/
    │   └── MONTHLY/
    └── ARCHIVE/
        ├── SURAT-MASUK/
        └── SURAT-KELUAR/
```

Nama-nama tersebut berasal dari `FOLDER_TEMPLATE` di `src/lib/drive.ts`: `SIPERSURAT`, `DATA-SYNC`, `DEVICES`, `CHANGE-LOGS`, `MANIFEST`, `BACKUP`, `HOURLY`, `DAILY`, `MONTHLY`, `ARCHIVE`, `SURAT-MASUK`, `SURAT-KELUAR`. `ensureFolder()` hanya membuat folder yang belum ada, sehingga aman dijalankan berulang.

Catatan implementasi:

- `CHANGE-LOGS/` berisi paket `change-{deviceId}-{timestamp}-{packageId}.json`.
- `MANIFEST/` berisi `manifest-{deviceId}.json` (satu file per perangkat).
- `BACKUP/HOURLY|DAILY|MONTHLY/` berisi zip backup sesuai jenis; backup manual masuk ke `BACKUP/`.
- `DEVICES/` dibuat oleh `ensureStructure()`, tetapi kode sinkronisasi saat ini **tidak menulis** file device JSON ke sana; data perangkat tetap dikirim sebagai perubahan dalam paket.
- `ARCHIVE/SURAT-MASUK` dan `ARCHIVE/SURAT-KELUAR` juga dibuat, tetapi arsip dokumen saat ini disimpan di IndexedDB (`document_archives`/attachments), bukan sebagai file Drive di folder tersebut.

Dengan scope `drive.file`, aplikasi hanya dapat mengakses file yang dibuatnya sendiri atau file/folder yang secara eksplisit dipilih/dibagikan kepada aplikasi. Karena itu, pemilihan folder induk oleh admin melalui Picker (atau pemberian ID folder yang sudah tepat) merupakan langkah penting.

## 8. Manifest per perangkat

Setiap perangkat memiliki identitas UUID lokal (`sipersurat_device_id` di `localStorage`) dan menulis manifestnya sendiri:

```json
{
  "device_id": "<uuid perangkat>",
  "updated_at": "<ISO timestamp>",
  "entries": [
    {
      "file_id": "<id paket di Drive>",
      "name": "change-<deviceId>-<timestamp>-<packageId>.json",
      "checksum": "<sha256 dari blob paket>",
      "device_id": "<uuid perangkat>",
      "created_at": "<ISO timestamp>",
      "change_ids": ["<change_id>", "..."]
    }
  ]
}
```

Alurnya:

1. **Push**: perubahan `sync_status = PENDING` (maksimal 300 per paket) digabung menjadi satu JSON, dihitung checksum SHA-256-nya, diunggah ke `CHANGE-LOGS`, lalu diunduh kembali untuk verifikasi checksum.
2. Manifest perangkat diperbarui. Status antrean berubah menjadi `UPLOADED` **hanya setelah** Drive mengonfirmasi file paket dan manifest.
3. **Pull**: semua file `manifest-*` dibaca; entri dengan `file_id` sama diproses sekali. Paket diunduh dan checksum-nya dibandingkan dengan manifest.
4. `data_versions.change_id` dipakai sebagai penanda idempotensi; paket yang sudah diterapkan dilewati.
5. Perubahan pada entitas kritis (nomor resmi, perangkat registrasi, pengguna, role, identitas sekolah) tidak pernah diselesaikan dengan *last-write-wins*; konflik disimpan untuk diputuskan admin.

Model per-perangkat ini menghindari beberapa perangkat menimpa satu file manifest yang sama. Baca detailnya di `src/lib/syncManager.ts`.

## 9. Token OAuth dan sesi

- `DriveClient` menyimpan `accessToken` dan `expiresAt` **hanya sebagai field memori** (`private accessToken = ''`). Tidak ada token di `localStorage`, `sessionStorage`, atau IndexedDB.
- Alur memakai `google.accounts.oauth2.initTokenClient()` dari Google Identity Services. Saat interaktif, `prompt: 'consent'`; untuk percobaan ulang, `prompt: ''`.
- Jika token tidak aktif, kode mencoba `connect(false)` (silent) lebih dulu, lalu `connect(true)` bila gagal. Tidak ada jaminan silent renewal; pengguna mungkin harus menyetujui lagi.
- **Tidak ada refresh token yang diminta atau disimpan.** Setelah aplikasi ditutup/dimuat ulang, koneksi Drive harus diulang.
- Logout hanya menghapus sesi pengguna lokal dan passphrase backup; token Drive tidak pernah disimpan ke disk sejak awal.

## 10. Checklist keamanan

- [ ] Consent screen hanya meminta scope `drive.file`.
- [ ] OAuth client berjenis **Web application**, bukan desktop/other.
- [ ] Authorized origins dan redirect URIs sesuai persis dengan origin deploy (termasuk `www` vs apex dan custom domain).
- [ ] API key Picker dibatasi oleh **HTTP referrer** dan hanya untuk **Google Picker API**.
- [ ] Tidak ada client secret, access token, refresh token, atau passphrase backup di `.env`, source code, atau backup.
- [ ] Folder induk Drive dipilih oleh admin dan tidak dibagikan publik; akses tetap mengikuti akun Google yang melakukan OAuth.
- [ ] Setelah ganti domain, perbarui origin/redirect/referrer dan jalankan build ulang.
- [ ] Header CSP di `netlify.toml` masih mengizinkan `accounts.google.com`, `apis.google.com`, `www.googleapis.com`, `oauth2.googleapis.com`, `*.googleusercontent.com`, serta frame untuk akun Google.
- [ ] Cabut akses perangkat lama dari halaman **Pengaturan → Perangkat** bila tidak dipakai; ingat pencabutan bersifat eventual saat perangkat offline.
- [ ] Simpan kode aktivasi dan passphrase backup di kanal privat; kode aktivasi hanya tampil sekali saat dibuat.
