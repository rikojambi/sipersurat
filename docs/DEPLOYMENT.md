# Deployment: GitHub + Netlify

SIPERSURAT adalah SPA statis tanpa server aplikasi. Source code di GitHub dapat di-import ke Netlify; Netlify menjalankan build, menyimpan hasil di `dist`, dan melayani aset statis beserta service worker PWA.

> **Status verifikasi:** konfigurasi lokal (`npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`) telah dijalankan dan lulus. Proses deploy ke Netlify, smoke test di URL publik, dan OAuth/Drive sungguhan **belum dijalankan** karena belum tersedia remote/kredensial.

## 1. Siapkan repository GitHub

1. Inisialisasi/commit seluruh source (termasuk `netlify.toml`, `.env.example`, `package-lock.json`).
2. Pastikan `.env` **tidak** ikut ter-commit (sudah ada di `.gitignore`, bersama `node_modules`, `dist`, `playwright-report`, `test-results`).
3. Push ke repository GitHub (publik atau privat).

## 2. Import project ke Netlify

1. Di Netlify: **Add new site → Import an existing project → GitHub**.
2. Pilih repository dan branch produksi (mis. `main`).
3. Netlify akan mendeteksi konfigurasi dari `netlify.toml`; tidak perlu mengisi build command manual, tetapi nilainya harus tetap:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- `npm run build` menjalankan `tsc -b && vite build`.
- Redirect `200` penting agar rute React Router seperti `/surat-masuk` atau `/pengaturan/backup` tidak 404 saat di-refresh.
- Netlify menggunakan Node LTS default; repositori ini tidak menetapkan `engines`. Jika build gagal karena versi Node, tambahkan variabel `NODE_VERSION = 20` di pengaturan environment Netlify.

## 3. Environment variable di Netlify

Buka **Site configuration → Environment variables → Add a variable** dan isi:

| Nama | Nilai contoh | Keterangan |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | OAuth client ID Web application |
| `VITE_GOOGLE_SCOPES` | `https://www.googleapis.com/auth/drive.file` | Boleh dikosongkan untuk memakai default kode |
| `VITE_GOOGLE_PICKER_API_KEY` | `AIza...` | Opsional; tanpa ini input Folder ID manual dipakai |
| `VITE_APP_NAME` | `SIPERSURAT` | Dideklarasikan, belum dipakai runtime |
| `VITE_SCHOOL_CODE` | `SMKN6-MJ` | Dideklarasikan, belum dipakai runtime |
| `VITE_APP_URL` | `https://sipersurat.netlify.app` | Sesuaikan dengan URL produksi |
| `VITE_ACTIVATION_PEPPER` | `nilai-unik-panjang-anda` | Wajib sama di semua perangkat; mengubahnya membatalkan kode aktivasi lama |

Catatan penting:

- Variabel `VITE_*` **tertanam ke bundle JavaScript saat build** dan dapat dibaca publik. Jangan memasukkan secret, token, atau passphrase.
- Setiap perubahan environment variable harus diikuti **Trigger deploy → Clear cache and deploy site** agar nilai baru masuk bundle.
- Untuk branch preview, skalakan variabel yang sama bila ingin fitur Drive aktif di preview; origin preview Netlify juga harus didaftarkan di Google Cloud (lihat [`GOOGLE_DRIVE_OAUTH.md`](GOOGLE_DRIVE_OAUTH.md)).

## 4. Header dan CSP

`netlify.toml` sudah menetapkan header untuk `/*`:

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy` dengan izin untuk Google dan font.

Jika Anda mengganti atau memperketat CSP, pastikan tetap mengizinkan:

| Direktif | Domain yang harus tetap ada | Alasan |
|---|---|---|
| `script-src` | `'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com` | GIS token client dan loader Picker (`gapi.load`) |
| `connect-src` | `'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com` | Drive API v3, OAuth, dan pemeriksaan token |
| `frame-src` | `'self' https://accounts.google.com` | Popup consent/otorisasi Google |
| `img-src` | `'self' data: blob: https://*.googleusercontent.com` | Foto profil/ikon Google dan preview dokumen |
| `style-src` / `font-src` | `https://fonts.googleapis.com`, `https://fonts.gstatic.com` | Font Inter dari `index.html` |

Melewatkan salah satu domain di atas membuat tombol **Hubungkan Drive** atau **Pilih via Picker** gagal walaupun kredensial sudah benar. Periksa *Console* browser saat smoke test.

## 5. PWA dan HTTPS

- `vite.config.ts` menggunakan `VitePWA({ registerType: 'prompt' })`. Service worker tidak mengaktifkan versi baru secara diam-diam; pengguna akan melihat prompt untuk memperbarui.
- Service worker hanya terdaftar di **HTTPS** atau **localhost**. Deployment Netlify otomatis menyediakan HTTPS untuk `*.netlify.app` dan domain kustom yang sudah tersambung.
- Manifest PWA memakai `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, nama `SIPERSURAT — Buku Agenda Surat Sekolah`, dan ikon SVG (`icon-192.svg`, `icon-512.svg`).
- `workbox.navigateFallback: '/index.html'` mendukung navigasi offline. Permintaan `GET https://www.googleapis.com/drive/v3/*` sengaja memakai `NetworkOnly` agar data Drive tidak disajikan dari cache yang basi.
- Pastikan pipeline Netlify tidak menghapus `sw.js`/asset PWA dari `dist`; keduanya dihasilkan saat `vite build`.

## 6. Custom domain

1. Di Netlify: **Site configuration → Domain management → Add custom domain**, lalu ikuti instruksi DNS (A/AAAA atau CNAME).
2. Tunggu sertifikat HTTPS aktif sebelum menguji PWA.
3. Putuskan apex vs `www` dan gunakan satu alamat kanonik; redirect yang lain ke alamat tersebut.
4. Perbarui Google Cloud:
   - Authorized JavaScript origins: `https://<domain-anda>`.
   - Authorized redirect URIs: `https://<domain-anda>/`.
   - HTTP referrer pada API key Picker: `https://<domain-anda>/*`.
5. Perbarui `VITE_APP_URL` di Netlify, lalu build ulang.
6. Pastikan CSP tidak mem-blok origin baru dan redirect SPA tetap berfungsi di domain kustom.

## 7. Smoke test setelah deploy

Gunakan akun Google yang terdaftar sebagai test user (daftar izin consent screen):

- [ ] Halaman `https://<domain>/login` terbuka; tautan **Buat akun administrator** muncul saat belum ada pengguna.
- [ ] Buat admin di `/setup` (password minimal 8 karakter); perangkat ditetapkan sebagai perangkat registrasi.
- [ ] Isi identitas sekolah dan simpan; refresh halaman `/pengaturan` — data masih ada (IndexedDB).
- [ ] Buka `/pengaturan/sinkronisasi`: status Client ID/scope terbaca; tombol **Hubungkan Drive** berhasil dan memunculkan consent Google.
- [ ] Pilih folder induk via Picker (atau masukkan ID manual) dan simpan; struktur `SIPERSURAT/...` muncul di Drive.
- [ ] Jalankan **Sinkron Sekarang**; riwayat sinkronisasi mencatat status `BERHASIL` dan tidak ada error CSP/Google di Console.
- [ ] Buat satu surat masuk, satu disposisi, dan satu surat keluar; nomor agenda dan status berjalan sesuai panduan pengguna.
- [ ] Publikasikan nomor resmi hanya dari perangkat registrasi; periksa format dan audit log `NUMBER.PUBLISHED`.
- [ ] Muat ulang halaman pada rute dalam (`/surat-masuk`) — tidak 404 (redirect SPA bekerja).
- [ ] Install PWA dari browser (menu *Install app* / *Add to Home screen*) dan buka dalam mode standalone.
- [ ] Matikan internet, buka aplikasi, tambah surat masuk, lalu aktifkan internet dan sinkronkan kembali.
- [ ] Pasang passphrase backup minimal 10 karakter, jalankan backup manual ke Drive, verifikasi checksum/status `BERHASIL`.
- [ ] Periksa tab **Application → Manifest/Service Workers** di DevTools: manifest valid, service worker aktif, tidak ada error HTTPS.
- [ ] Uji di satu browser Chromium dan satu browser Firefox/Safari bila menjadi target sekolah.

Jika langkah Drive gagal, periksa urutan: variabel lingkungan hasil build → origin/redirect Google → referrer API key → CSP → akun test user.
