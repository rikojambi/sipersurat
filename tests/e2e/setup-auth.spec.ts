import { expect, test } from '@playwright/test';
import {
  ADMIN,
  createIncomingLetter,
  fieldInput,
  loginAs,
  setupAdmin
} from './helpers';

test('initial ADMIN setup creates a local account and opens the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Belum ada akun/)).toBeVisible();
  await expect(page.getByText(/Aplikasi tetap bekerja offline/)).toBeVisible();

  await page.getByRole('button', { name: 'Buat akun administrator' }).click();
  await page.waitForURL(/\/setup$/);
  await expect(page.getByText(/Password di-hash dengan PBKDF2-SHA256/)).toBeVisible();

  await fieldInput(page, /^Nama sekolah$/).fill('SMKN 6 Muaro Jambi');
  await fieldInput(page, /^Username admin$/).fill(ADMIN.username);
  await fieldInput(page, /^Nama tampilan$/).fill(ADMIN.displayName);
  await fieldInput(page, /^Password$/).fill(ADMIN.password);
  await fieldInput(page, /^Konfirmasi password$/).fill(ADMIN.password);
  await page.getByRole('button', { name: /Buat Akun & Mulai/ }).click();

  await page.waitForURL(/\/$/);
  await expect(page.getByText(/Selamat datang, Administrator/)).toBeVisible();
  await expect(page.getByText(/Akun administrator dibuat/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Status perangkat' })).toBeVisible();
  await expect(page.getByText('Registrasi resmi', { exact: true })).toBeVisible();
  await expect(page.getByText(/ACTIVE/).first()).toBeVisible();
});

test('logout clears the session but keeps local letters after reload', async ({ page }) => {
  await setupAdmin(page);

  const subject = 'Surat uji logout tetap tersimpan';
  await createIncomingLetter(page, subject);
  await expect(page.getByRole('table').getByText(subject, { exact: true })).toBeVisible();

  await page.locator('button[title="Keluar"]').click();
  await page.waitForURL(/\/login$/);
  await expect(page.getByText(/Aplikasi tetap bekerja offline/)).toBeVisible();
  await expect(page.getByText(/Belum ada akun/)).toHaveCount(0);

  // Sesi hilang, tetapi IndexedDB lokal tidak dihapus oleh logout.
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: /^Masuk$/ })).toBeVisible();

  await loginAs(page, ADMIN.username, ADMIN.password);
  await page.goto('/surat-masuk');
  await expect(page.getByRole('table').getByText(subject, { exact: true })).toBeVisible();
});
