import { expect, type Locator, type Page } from '@playwright/test';

/** Helper ini bukan spec; hanya dipakai oleh file *.spec.ts di folder yang sama. */
export const BASE_URL = 'http://127.0.0.1:4173';

export const ADMIN = {
  username: 'admin',
  password: 'admin12345',
  displayName: 'Administrator'
};

type Scope = Page | Locator;

// Field di src/components/ui/index.tsx membungkus <Label> dan <input>/<button>/
// <textarea> sebagai siblings, tanpa atribut htmlFor/id. Karena itu getByLabel
// tidak dapat dipakai; helper ini menargetkan kontrol bersebelahan dengan label.
export function fieldInput(scope: Scope, label: string | RegExp): Locator {
  return scope.locator('label').filter({ hasText: label }).locator('xpath=following-sibling::input[1]');
}

export function fieldTextarea(scope: Scope, label: string | RegExp): Locator {
  return scope.locator('label').filter({ hasText: label }).locator('xpath=following-sibling::textarea[1]');
}

/** Tombol trigger Radix Select bersebelahan dengan <Label>. */
export function fieldSelect(scope: Scope, label: string | RegExp): Locator {
  return scope.locator('label').filter({ hasText: label }).locator('xpath=following-sibling::button[1]');
}

export async function chooseOption(
  page: Page,
  label: string | RegExp,
  option: string | RegExp,
  scope: Scope = page
): Promise<void> {
  await fieldSelect(scope, label).click();
  await page.getByRole('option', { name: option }).click();
}

/** Alur setup awal: '/' -> /login -> /setup -> dashboard, dengan akun ADMIN lokal. */
export async function setupAdmin(page: Page, admin = ADMIN): Promise<void> {
  await page.goto('/');
  await page.waitForURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Buat akun administrator' })).toBeVisible();
  await page.getByRole('button', { name: 'Buat akun administrator' }).click();
  await page.waitForURL(/\/setup$/);

  await fieldInput(page, /^Nama sekolah$/).fill('SMKN 6 Muaro Jambi');
  await fieldInput(page, /^Username admin$/).fill(admin.username);
  await fieldInput(page, /^Nama tampilan$/).fill(admin.displayName);
  await fieldInput(page, /^Password$/).fill(admin.password);
  await fieldInput(page, /^Konfirmasi password$/).fill(admin.password);
  await page.getByRole('button', { name: /Buat Akun & Mulai/ }).click();

  await page.waitForURL(/\/$/);
  await expect(page.getByText(new RegExp(`Selamat datang, ${admin.displayName}`))).toBeVisible();
}

export async function fillLoginForm(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await fieldInput(page, /^Username$/).fill(username);
  await fieldInput(page, /^Password$/).fill(password);
}

export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await fillLoginForm(page, username, password);
  await page.getByRole('button', { name: /^Masuk$/ }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

export async function createIncomingLetter(
  page: Page,
  subject: string,
  overrides: { sender?: string; institution?: string; destination?: string } = {}
): Promise<void> {
  await page.goto('/surat-masuk');
  await page.getByRole('button', { name: /Tambah Surat/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Tambah Surat Masuk' })).toBeVisible();

  await fieldInput(dialog, /^Nomor surat pengirim$/).fill('432/ABC/2026');
  await fieldInput(dialog, /^Asal surat$/).fill(overrides.sender ?? 'Dinas Pendidikan');
  await fieldInput(dialog, /^Instansi pengirim$/).fill(overrides.institution ?? 'Dinas Pendidikan Provinsi');
  await fieldInput(dialog, /^Perihal$/).fill(subject);
  await chooseOption(page, /^Jenis surat$/, 'Surat Undangan', dialog);
  await chooseOption(page, /^Klasifikasi$/, 'Biasa', dialog);
  await fieldInput(dialog, /^Tujuan surat$/).fill(overrides.destination ?? 'Kepala Sekolah');

  await dialog.getByRole('button', { name: 'Simpan Surat' }).click();
  await expect(page.getByText(/Surat masuk diregistrasi dengan nomor agenda/).first()).toBeVisible();
}

export async function createOutgoingDraft(page: Page, subject: string): Promise<void> {
  await page.goto('/surat-keluar');
  await page.getByRole('button', { name: /Buat Surat/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Buat Surat Keluar Baru' })).toBeVisible();

  await chooseOption(page, /^Jenis surat$/, 'Surat Undangan', dialog);
  await chooseOption(page, /^Klasifikasi$/, 'Biasa', dialog);
  await fieldInput(dialog, /^Instansi penerima$/).fill('Dinas Pendidikan');
  await fieldInput(dialog, /^Tujuan$/).fill('Kepala Sekolah');
  await fieldInput(dialog, /^Penandatangan$/).fill('Drs. H. Slamet');
  await fieldInput(dialog, /^Perihal$/).fill(subject);
  await fieldTextarea(dialog, /^Isi surat$/).fill('Isi surat uji untuk alur draft SIPERSURAT.');

  await dialog.getByRole('button', { name: 'Simpan Draft' }).click();
  await expect(page.getByText(/Draft surat keluar dibuat/).first()).toBeVisible();
}

/** Kode aktivasi hanya tampil sekali di halaman Perangkat Terdaftar. */
export async function generateActivationCode(page: Page, deviceName = 'HP Bu Rina'): Promise<string> {
  await page.goto('/pengaturan/perangkat');
  await expect(page.getByRole('heading', { name: /Perangkat Terdaftar/ })).toBeVisible();
  await fieldInput(page, /Nama perangkat yang akan didaftarkan/).fill(deviceName);
  await page.getByRole('button', { name: /Buat Kode \(48 jam\)/ }).click();
  await expect(page.getByText(/Kode aktivasi dibuat/).first()).toBeVisible();

  const codeLine = page
    .locator('p')
    .filter({ hasText: /^Kode aktivasi \(tampil sekali\):$/ })
    .locator('xpath=following-sibling::p[1]');
  await expect(codeLine).toBeVisible();
  const code = (await codeLine.textContent())?.trim() ?? '';
  expect(code).not.toBe('');
  return code;
}

export async function createGuruUser(
  page: Page,
  user: { username: string; password: string; displayName: string }
): Promise<void> {
  await page.goto('/pengaturan/pengguna');
  await page.getByRole('button', { name: /Tambah Akun/ }).click();
  const dialog = page.getByRole('dialog');
  await fieldInput(dialog, /^Nama tampilan$/).fill(user.displayName);
  await fieldInput(dialog, /^Username$/).fill(user.username);
  await chooseOption(page, /^Role$/, 'Guru', dialog);
  await fieldInput(dialog, /^Password sementara$/).fill(user.password);
  await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByText(/Akun berhasil dibuat/).first()).toBeVisible();
}

/** Simulasikan paket Drive: salin rekam user ke IndexedDB perangkat lain. */
export async function copyUserToContext(from: Page, to: Page, username: string): Promise<void> {
  const user = await from.evaluate(async (wanted) => await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
    const open = indexedDB.open('sipersurat_local');
    open.onsuccess = () => {
      const request = open.result.transaction('users', 'readonly').objectStore('users').getAll();
      request.onsuccess = () => resolve((request.result as Array<Record<string, unknown>>).find((u) => u.username === wanted));
      request.onerror = () => reject(request.error);
    };
    open.onerror = () => reject(open.error);
  }), username);
  expect(user, `User ${username} tidak ditemukan di sumber`).toBeTruthy();

  await to.evaluate(async (record) => await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('sipersurat_local');
    open.onsuccess = () => {
      const tx = open.result.transaction('users', 'readwrite');
      tx.objectStore('users').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }), user);
}
