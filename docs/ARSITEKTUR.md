# SIPERSURAT — Analisis & Arsitektur (TAHAP 1)

## 1. Keputusan arsitektur

| Keputusan | Alasan |
|---|---|
| Local-first PWA, IndexedDB (Dexie.js) sebagai source of truth | Aplikasi tetap berfungsi tanpa internet dan tanpa server sekolah |
| Google Drive admin hanya sebagai **medium pertukaran paket perubahan + backup** | Drive bukan database aktif; mencegah konkurensi tulis antarperangkat |
| Google Identity Services (OAuth 2.0 public client + token client) | Tidak ada client secret di frontend SPA/PWA; PKCE belum diterapkan eksplisit oleh `DriveClient` |
| SINGLE WRITER untuk nomor surat resmi | Menjaga integritas penomoran tanpa database transaksional pusat |
| Enkripsi AES-GCM untuk backup sensitif; PBKDF2-SHA256 untuk password | Web Crypto API tersedia di semua target browser |
| UUID untuk semua ID | Menghindari tabrakan antarperangkat offline |

## 2. Diagram alur data

```
[Perangkat A]  [Perangkat B]  [Perangkat C]
   IndexedDB      IndexedDB      IndexedDB
       |              |              |
       +--- change package (JSON+checksum) ---+
                       |
              Google Drive admin
              SIPERSURAT/DATA-SYNC/
                MANIFEST/manifest-{deviceId}.json
                CHANGE-LOGS/change-{deviceId}-{timestamp}-{packageId}.json
                DEVICES/{deviceId}.json   (folder dibuat, belum ditulis)
              SIPERSURAT/BACKUP/{HOURLY,DAILY,MONTHLY}/
              SIPERSURAT/ARCHIVE/{SURAT-MASUK,SURAT-KELUAR}/
```

Tidak ada proses yang menulis tabel yang sama secara langsung di Drive. Setiap perangkat
membaca manifest, mengunduh hanya paket yang belum diterapkannya, memvalidasi checksum,
lalu menerapkannya secara idempoten dengan pencatatan `data_versions`.

## 3. Model data logis (ERD ringkas)

```
users ──< roles (role name)
users ──< units
units ──< incoming_letters ──< dispositions ──< disposition_recipients ──> users
incoming_letters ──< attachments ──< outgoing_letters
outgoing_letters ──> letter_types ──> letter_number_sequences
outgoing_letters ──> letter_classifications
outgoing_letters ──< document_archives
incoming_letters ──< document_archives
letter_templates ──> letter_types
school_settings (single row)
application_settings (key-value)
audit_logs, notifications
sync_queue, sync_history, sync_conflicts, data_versions
device_registry, backup_history
```

Setiap entitas utama memiliki metadata: `id, created_at, updated_at, created_by,
updated_by, device_id, sync_status, deleted_at, version`.

Detail skema lengkap: `src/db/schema.ts`.

## 4. Mekanisme sinkronisasi (TAHAP 15–16)

1. Setiap mutasi lokal (CREATE/UPDATE/DELETE/CANCEL) menulis record + satu baris
   `sync_queue` dengan `change_id` UUID, `idempotency_key`, `version`, dan `checksum`
   SHA-256 dari payload.
2. **Upload**: kumpulkan `sync_status = PENDING`, buat satu paket JSON per perangkat,
   unggah ke `CHANGE-LOGS`, verifikasi metadata file melalui Drive API, perbarui
   `manifest-{deviceId}.json` milik perangkat tersebut (satu file manifest per perangkat
   menghindari konkurensi tulis pada satu indeks bersama).
   Status berubah menjadi `UPLOADED` **hanya setelah Drive mengonfirmasi file id**.
3. **Download**: baca semua `manifest-{deviceId}.json`, unduh paket yang belum ada di `data_versions`,
   verifikasi checksum, terapkan perubahan. Status lokal menjadi `SYNCED` setelah
   paket berhasil diverifikasi dan diterapkan.
4. **Idempotensi**: `data_versions.change_id` adalah kunci unik. Paket yang dikirim
   dua kali tidak akan membuat duplikat.
5. **Konflik**: jika `local.version > remote.version` atau payload berbeda pada
   versi yang sama, perubahan TIDAK ditimpa. Baris `sync_conflicts` menyimpan kedua
   versi; admin memilih "Pakai lokal", "Pakai remote", atau "Gabungkan".
6. **Pengecualian**: nomor surat resmi, status perangkat registrasi, dan data
   penerbitan nomor tidak pernah diselesaikan dengan last-write-wins; selalu
   menghasilkan konflik untuk keputusan admin.

### Keterbatasan yang disampaikan terus terang
- Google Drive API tidak menyediakan mekanisme push real-time ke browser gratis;
  sinkronisasi berjalan saat aplikasi dibuka/aktif atau tombol ditekan.
- Token OAuth disimpan **hanya di memori**. Jika sesi berakhir, pengguna mengulang
  otorisasi (atau silent renewal jika Google masih mengizinkan).
- Tidak ada jaminan backup tepat waktu saat semua perangkat ditutup. Sistem memakai
  mekanisme **BACKUP DUE** saat aplikasi dibuka kembali.

## 5. Desain penomoran resmi (TAHAP 9)

Format: `{SEQ}/{KODE}/{KODE_SEKOLAH}/{BULAN_ROMawi}/{TAHUN}`
Contoh: `001/UND/SMKN6-MJ/XI/2026`

- `letter_number_sequences` menyimpan urutan terakhir per `(type_id, year)`.
- Nomor draft belum resmi; `outgoing_letters.official_number` masih null.
- Hanya perangkat dengan `device_registry.is_registration_device = 1` yang boleh
  menerbitkan. Perangkat lain mengajukan dan menunggu antrean registrasi.
- Sebelum menerbitkan, sistem memeriksa seluruh nomor yang diketahui
  (`letter_number_sequences.last_number`, semua `official_number`, termasuk yang
  dibatalkan) dan memblokir jika ada conflict belum selesai atau sinkronisasi
  tertunda pada perangkat registrasi.
- Nomor dibatalkan tetap tercatat (`status = DIBATALKAN`) dan tidak dipakai ulang.
- Setiap penerbitan dicatat di `audit_logs`.

## 6. Backup & restore (TAHAP 13, 17–18)

- ZIP berisi `database/sipersurat.json.enc`, `storage/*`, `sync/*`, `metadata/*`;
  salinan `sync/change-log.json` dan `sync/sync-state.json` sengaja tidak ditulis
  plaintext karena sudah termasuk dalam payload database terenkripsi.
- File database dienkripsi AES-GCM dengan kunci turunan PBKDF2 dari **passphrase
  backup yang dimasukkan admin** (salt disimpan, passphrase tidak disimpan).
- `checksum.sha256` berisi checksum ZIP final.
- Restore: validasi checksum → format → versi → ringkasan → backup lokal saat ini →
  restore tabel → migrasi → uji integritas → audit log.
- Retensi default: lokal 7 hari, 6-jam 30 hari, harian 90 hari, bulanan 12 bulan.
- Backup lama tidak dihapus sebelum backup baru terverifikasi.

## 7. Keterbatasan autentikasi lokal

Pencabutan akses bersifat **eventual**: akun/perangkat yang dinonaktifkan tetap
dapat digunakan secara offline hingga perangkat tersebut melakukan sinkronisasi
dan menerima pembaruan status. UI menampilkan peringatan jika status akun/perangkat
terakhir diperbarui lebih dari batas yang ditentukan. Tidak ada cara kriptografis
untuk mencabut akses perangkat yang sedang offline dalam arsitektur tanpa server.

Kode aktivasi perangkat adalah token mandiri `payload.base64url + HMAC-SHA256`
(`src/lib/device.ts`) sehingga perangkat baru dapat memverifikasi masa berlaku dan
tanda tangan tanpa database admin. Kunci HMAC berasal dari `VITE_ACTIVATION_PEPPER`
(yang harus sama di semua build; nilai default hanya untuk pengembangan). Hash token
tetap disimpan di `application_settings` untuk penandaan sekali pakai setempat;
pemakaian ulang lintas perangkat hanya dapat dicegah setelah paket sinkronisasi
diterima. Token bersifat case-sensitive dan UI sengaja tidak mengubah hurufnya.
