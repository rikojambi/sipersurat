import { expect, test } from '@playwright/test';
import { fieldInput, setupAdmin } from './helpers';

test.beforeEach(async ({ page }) => {
  await setupAdmin(page);
});

test('agenda, arsip and laporan pages render', async ({ page }) => {
  await page.getByRole('link', { name: 'Buku Agenda' }).click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByRole('heading', { name: 'Buku Agenda' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Surat Masuk/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Surat Keluar/ })).toBeVisible();

  await page.getByRole('link', { name: 'Arsip Digital' }).click();
  await expect(page).toHaveURL(/\/arsip$/);
  await expect(page.getByRole('heading', { name: 'Arsip Digital' })).toBeVisible();
  await expect(page.getByText(/Arsip \(\d+\)/)).toBeVisible();

  await page.getByRole('link', { name: 'Laporan', exact: true }).click();
  await expect(page).toHaveURL(/\/laporan$/);
  await expect(page.getByRole('heading', { name: 'Laporan', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Laporan Surat Masuk' })).toBeVisible();
});

test('Drive/sync settings render without OAuth credentials and show status', async ({ page }) => {
  await page.getByRole('link', { name: 'Google Drive & Sync' }).click();
  await expect(page).toHaveURL(/\/pengaturan\/sinkronisasi$/);
  await expect(page.getByRole('heading', { name: /Google Drive & Sinkronisasi/ })).toBeVisible();
  await expect(page.getByText('Status Drive')).toBeVisible();
  await expect(page.getByText('Belum terhubung')).toBeVisible();
  await expect(page.getByText('Perubahan pending')).toBeVisible();
  await expect(page.getByRole('button', { name: /Hubungkan Drive|Perbarui Koneksi/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sinkron Sekarang/ })).toBeVisible();

  // Kredensial OAuth tidak diperlukan untuk membuka halaman; statusesinya statis.
  const clientId = fieldInput(page, 'OAuth Client ID');
  await expect(clientId).toHaveAttribute('readonly');
  const value = (await clientId.inputValue()).trim();
  if (value === 'Belum diatur') {
    await expect(
      page.getByText(/Belum diatur — tambahkan VITE_GOOGLE_CLIENT_ID ke \.env/)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pilih via Picker' })).toBeDisabled();
  } else {
    await expect(page.getByText('Terdaftar')).toBeVisible();
  }
});

test('backup passphrase can be configured and backup status is visible', async ({ page }) => {
  await page.getByRole('link', { name: 'Backup & Restore' }).click();
  await expect(page).toHaveURL(/\/pengaturan\/backup$/);
  await expect(page.getByRole('heading', { name: 'Backup Google Drive' })).toBeVisible();
  await expect(page.getByText(/Status: (BACKUP DUE|Backup dalam jadwal)/)).toBeVisible();

  // Instalasi baru belum punya backup, sehingga indikator BACKUP DUE biasanya muncul.
  if (await page.getByText(/BACKUP DUE/).first().isVisible().catch(() => false)) {
    await expect(page.getByText(/backup tertunda/).first()).toBeVisible();
  }

  await fieldInput(page, /Buat passphrase baru/).fill('rahasia12345');
  await page.getByRole('button', { name: 'Simpan Passphrase' }).click();
  await expect(page.getByText(/Passphrase backup dikonfigurasi/).first()).toBeVisible();
  await expect(fieldInput(page, /Masukkan passphrase untuk membuka kunci sesi/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buka Kunci' })).toBeVisible();
});

test('conflicts page renders with an empty state', async ({ page }) => {
  await page.getByRole('link', { name: 'Konflik Sinkronisasi' }).click();
  await expect(page).toHaveURL(/\/pengaturan\/konflik$/);
  await expect(page.getByRole('heading', { name: 'Konflik Sinkronisasi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Konflik belum selesai/ })).toBeVisible();
  await expect(page.getByText(/Tidak ada konflik yang perlu diselesaikan/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Riwayat Penyelesaian' })).toBeVisible();
});
