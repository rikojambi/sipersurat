import { expect, test } from '@playwright/test';
import {
  chooseOption,
  createIncomingLetter,
  createOutgoingDraft,
  fieldTextarea,
  setupAdmin
} from './helpers';

test('create surat masuk with an automatic agenda number', async ({ page }) => {
  await setupAdmin(page);
  const subject = 'Surat uji registrasi masuk';

  await createIncomingLetter(page, subject);

  const toast = await page.getByText(/Surat masuk diregistrasi dengan nomor agenda/).first().textContent();
  expect(toast).toMatch(/\d{3}\/AGD\/\d{4}/);

  await expect(page).toHaveURL(/\/surat-masuk$/);
  await expect(page.getByRole('table').getByText(subject, { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('DITERIMA', { exact: true }).first()).toBeVisible();
});

test('create a disposisi for an existing surat masuk', async ({ page }) => {
  await setupAdmin(page);
  const subject = 'Surat uji disposisi';

  await createIncomingLetter(page, subject);

  await page.goto('/disposisi');
  await page.getByRole('button', { name: /Buat Disposisi/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Buat Disposisi' })).toBeVisible();

  await chooseOption(page, /^Surat masuk$/, new RegExp(subject), dialog);
  await fieldTextarea(dialog, /^Instruksi$/).fill('Mohon ditindaklanjuti dalam 3 hari kerja.');
  await dialog.getByRole('checkbox').first().check();
  await dialog.getByRole('button', { name: 'Simpan Disposisi' }).click();

  await expect(page.getByText(/Disposisi dibuat dan notifikasi dikirim/).first()).toBeVisible();
  await expect(page.getByRole('table').getByText(/DISP\/\d{3}\/\d{4}/).first()).toBeVisible();
  await expect(page.getByRole('table').getByText(subject, { exact: true })).toBeVisible();

  await page.goto('/surat-masuk');
  await expect(page.getByRole('table').getByText('DIDISPOSISI', { exact: true }).first()).toBeVisible();
});

test('create surat keluar draft without publishing an official number', async ({ page }) => {
  await setupAdmin(page);
  const subject = 'Draft uji surat keluar';

  await createOutgoingDraft(page, subject);

  await expect(page.getByRole('table').getByText(subject, { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText('Draft', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Penerbitan nomor resmi terkunci/)).toBeVisible();

  await page.getByRole('table').getByRole('button', { name: 'Detail' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Draft \/ menunggu registrasi/)).toBeVisible();
  await expect(dialog.getByText(subject, { exact: true })).toBeVisible();
});
