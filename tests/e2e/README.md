# E2E tests (Playwright)

Konfigurasi ada di `playwright.config.ts` di root repo. Test menjalankan `npm run preview`
pada `http://127.0.0.1:4173` (Chromium saja), jadi **build aplikasi lebih dulu**:

```bash
npm run build
npx playwright install chromium
npm run e2e
```

`npx playwright install chromium` wajib dijalankan sekali pada mesin baru untuk
mengunduh browser. Gunakan `npx playwright test --ui` untuk mode interaktif.

## Catatan lingkungan

- Setiap test memakai browser context baru sehingga IndexedDB (`sipersurat_local`),
  localStorage sesi, dan device ID selalu bersih. Alur setup ADMIN dapat diulang
  di setiap test tanpa perlu reset manual.
- Komponen `Field` di aplikasi merender `<label>` tanpa `htmlFor`/`id`, jadi
  `getByLabel` tidak dapat dipakai. Helper di `helpers.ts` menargetkan input,
  textarea, atau trigger Select yang bersebelahan dengan label tersebut.
- Select memakai Radix UI: opsi dibuka sebagai `role="option"` melalui helper
  `chooseOption`.
- `npm run preview` menyajikan hasil build di `dist`. Jika `dist` belum ada atau
  sudah usang, jalankan `npm run build` sebelum `npm run e2e`.

## Batasan yang tidak bisa di-e2e

Sinkronisasi Google Drive yang sebenarnya **tidak dapat diuji tanpa kredensial
OAuth** (`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_PICKER_API_KEY`, dan token akses
yang valid). Test hanya memastikan halaman Google Drive & Sync tetap render
tanpa kredensial, menampilkan status "Belum terhubung", dan tidak mengklik
tombol koneksi/OAuth. Alur penerbitan nomor resmi juga sengaja diuji dalam
kondisi gate terkunci: pada instalasi lokal tanpa sinkronisasi awal ke Drive,
perangkat belum memenuhi prasyarat SINGLE WRITER.

Alur registrasi perangkat memakai dua browser context terpisah: context admin
membuat kode aktivasi, context kedua menyamar sebagai perangkat baru dengan
device ID dan IndexedDB sendiri.
