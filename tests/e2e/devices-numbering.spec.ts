import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  copyUserToContext,
  createGuruUser,
  createOutgoingDraft,
  fieldInput,
  fillLoginForm,
  generateActivationCode,
  setupAdmin
} from './helpers';

test('numbering gate blocks official numbers on a fresh installation', async ({ page }) => {
  await setupAdmin(page);

  await page.getByRole('link', { name: 'Penomoran Resmi' }).click();
  await expect(page).toHaveURL(/\/pengaturan\/penomoran$/);
  await expect(page.getByRole('heading', { name: 'Penomoran Resmi' })).toBeVisible();
  await expect(page.getByText(/Penerbitan nomor resmi diblokir/)).toBeVisible();
  // Alasan pastinya bergantung pada status sync; semua varian menunjukkan gate masih tertutup.
  await expect(
    page.getByText(/Sinkronisasi awal|belum mutakhir|bukan perangkat registrasi/).first()
  ).toBeVisible();

  await page.goto('/surat-keluar');
  await createOutgoingDraft(page, 'Draft menunggu gate nomor');
  await expect(page.getByText(/Penerbitan nomor resmi terkunci/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daftarkan' })).toHaveCount(0);
});

test('activation code registers a new pending device and blocks guru login', async ({ page, browser }) => {
  await setupAdmin(page);

  const guru = { username: 'guru1', password: 'guru12345', displayName: 'Guru Satu' };
  await createGuruUser(page, guru);
  const code = await generateActivationCode(page, 'HP Bu Rina');

  // Context terpisah = perangkat berbeda (device ID dan IndexedDB baru).
  const newDeviceContext = await browser.newContext({ baseURL: BASE_URL });
  try {
    const devicePage = await newDeviceContext.newPage();
    await devicePage.goto('/registrasi-perangkat');
    await expect(devicePage.getByText(/Perangkat baru tidak otomatis mendapat akses/)).toBeVisible();

    await fieldInput(devicePage, /^Kode aktivasi dari admin$/).fill('KODE-TIDAK-VALID');
    await devicePage.getByRole('button', { name: 'Daftarkan Perangkat' }).click();
    await expect(devicePage.getByText(/Kode aktivasi tidak valid/).first()).toBeVisible();

    await fieldInput(devicePage, /^Kode aktivasi dari admin$/).fill(code);
    await fieldInput(devicePage, /^Nama perangkat \(opsional\)$/).fill('HP Bu Rina');
    await devicePage.getByRole('button', { name: 'Daftarkan Perangkat' }).click();

    await expect(devicePage.getByText(/Perangkat berhasil didaftarkan/).first()).toBeVisible();
    await expect(devicePage.getByText(/Status: PENDING/)).toBeVisible();
    await expect(devicePage.getByText(/Sinkron awal: Belum/)).toBeVisible();
    await expect(devicePage.getByRole('button', { name: /Jalankan Sinkronisasi Awal/ })).toBeVisible();

    // Akun GURU belum boleh masuk sebelum sinkronisasi awal dan persetujuan admin.
    // Rekam user disalin dari context admin untuk menyimulasikan paket Drive.
    await copyUserToContext(page, devicePage, guru.username);
    await fillLoginForm(devicePage, guru.username, guru.password);
    await devicePage.getByRole('button', { name: /^Masuk$/ }).click();
    await expect(devicePage.getByText(/Perangkat belum menjalani sinkronisasi awal/).first()).toBeVisible();
    await expect(devicePage).toHaveURL(/\/login$/);
  } finally {
    await newDeviceContext.close();
  }
});
