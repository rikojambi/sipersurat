import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  can, changePassword, createUser, currentUserId, getCurrentUser, login, logout,
  resetPassword, setUserActive, setupAdmin
} from '@/lib/auth';
import { createActivationCode, getDeviceId, redeemActivationCode } from '@/lib/device';
import { sha256Hex } from '@/lib/crypto';
import { resetDb } from './helpers';
import type { Actor } from '@/db/repository';
import type { User } from '@/types';

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
});

describe('autentikasi, peran, dan perangkat', () => {
  it('setup admin menyimpan hash password, sesi, dan perangkat registrasi', async () => {
    const admin = await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!', schoolName: 'SMKN 6 Muaro Jambi' });
    expect(admin.role).toBe('ADMIN');
    expect(admin.password_hash).not.toContain('Rahasia123!');
    expect(admin.password_salt).toBeTruthy();
    expect(currentUserId()).toBe(admin.id);
    expect((await getCurrentUser())?.id).toBe(admin.id);

    const deviceId = getDeviceId();
    expect((await db.device_registry.get(deviceId))?.is_registration_device).toBe(1);
    expect((await db.application_settings.where('key').equals('registration_device_id').first())?.value).toBe(deviceId);
    expect((await db.school_settings.toArray())[0]?.name).toBe('SMKN 6 Muaro Jambi');
  });

  it('login menolak password salah dan mencatat waktu login', async () => {
    await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!' });
    await expect(login('admin', 'salah')).rejects.toThrow('Username atau password salah.');
    const signedIn = await login(' ADMIN ', 'Rahasia123!');
    expect(signedIn.last_login_at).toBeTruthy();
    expect((await db.users.get(signedIn.id))?.last_login_at).toBeTruthy();
  });

  it('menolak akun nonaktif, perangkat dicabut, dan perangkat belum tersinkron untuk non-admin', async () => {
    const admin = await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!' });
    const actor: Actor = { userId: admin.id, userName: admin.display_name, deviceId: getDeviceId() };
    const tu = await createUser({ username: 'tu1', displayName: 'Tata Usaha', password: 'Rahasia123!', role: 'TU' }, actor);

    await setUserActive(tu.id, false, actor);
    await expect(login('tu1', 'Rahasia123!')).rejects.toThrow('dinonaktifkan');
    await setUserActive(tu.id, true, actor);

    await db.device_registry.update(getDeviceId(), { status: 'REVOKED' });
    await expect(login('admin', 'Rahasia123!')).rejects.toThrow('tidak memiliki akses');

    await db.device_registry.update(getDeviceId(), { status: 'PENDING', is_registration_device: 0 });
    await expect(login('tu1', 'Rahasia123!')).rejects.toThrow('sinkronisasi awal');
    await expect(login('admin', 'Rahasia123!')).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('logout hanya menghapus sesi dan tidak menghapus database lokal', async () => {
    const admin = await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!' });
    const actor: Actor = { userId: admin.id, userName: admin.display_name, deviceId: getDeviceId() };
    await createUser({ username: 'guru1', displayName: 'Guru Satu', password: 'Rahasia123!', role: 'GURU' }, actor);
    expect(await db.users.count()).toBe(2);

    await logout(actor);
    expect(currentUserId()).toBeNull();
    expect(await getCurrentUser()).toBeNull();
    expect(await db.users.count()).toBe(2);
    expect(await db.device_registry.count()).toBe(1);
  });

  it('kode aktivasi sekali pakai, kedaluwarsa, dan menghasilkan perangkat PENDING', async () => {
    const admin = await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!' });
    const actor: Actor = { userId: admin.id, userName: admin.display_name, deviceId: getDeviceId() };
    const activation = await createActivationCode('Tablet Guru', actor, 48);
    const hash = await sha256Hex(activation.code);
    const row = await db.application_settings.where('key').equals(`activation:${hash}`).first();
    expect(row).toBeTruthy();
    expect(activation.code).toMatch(/^[\w.-]+$/);

    const device = await redeemActivationCode(activation.code, 'Tablet Guru');
    expect(device.status).toBe('PENDING');
    expect(device.initial_sync_done).toBe(0);
    expect(device.is_registration_device).toBe(0);
    expect(device.activation_code_hash).toBe(hash);
    expect(JSON.parse((await db.application_settings.get(row!.id))!.value).used).toBe(true);
    await expect(redeemActivationCode(activation.code)).rejects.toThrow('sudah digunakan');

    const expired = await createActivationCode('Laptop Lama', actor, 1);
    const expiredHash = await sha256Hex(expired.code);
    const expiredRow = await db.application_settings.where('key').equals(`activation:${expiredHash}`).first();
    await db.application_settings.update(expiredRow!.id, {
      value: JSON.stringify({ expires_at: new Date(Date.now() - 1000).toISOString(), device_name: 'Laptop Lama', used: false })
    });
    await expect(redeemActivationCode(expired.code)).rejects.toThrow('kedaluwarsa');
  });

  it('memverifikasi kode aktivasi pada perangkat yang belum menerima paket admin', async () => {
    const admin = await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!' });
    const actor: Actor = { userId: admin.id, userName: admin.display_name, deviceId: getDeviceId() };
    const activation = await createActivationCode('HP Guru', actor, 48);
    const hash = await sha256Hex(activation.code);
    const row = await db.application_settings.where('key').equals(`activation:${hash}`).first();

    // Perangkat baru: localStorage/IndexedDB berbeda dan belum punya baris aktivasi admin.
    await db.application_settings.delete(row!.id);
    localStorage.setItem('sipersurat_device_id', 'perangkat-baru-tanpa-paket');
    const device = await redeemActivationCode(activation.code, 'HP Guru');
    expect(device.status).toBe('PENDING');
    expect(device.device_id).toBe('perangkat-baru-tanpa-paket');

    const localRow = await db.application_settings.where('key').equals(`activation:${hash}`).first();
    expect(localRow).toBeTruthy();
    expect(JSON.parse(localRow!.value).used).toBe(true);

    const [body, signature] = activation.code.split('.');
    const tampered = `${body}.${signature!.slice(0, -1)}${signature!.endsWith('A') ? 'B' : 'A'}`;
    await expect(redeemActivationCode(tampered)).rejects.toThrow('Kode aktivasi tidak valid.');
    // Kode bersifat case-sensitive: UI tidak boleh mengubah huruf saat disalin.
    await expect(redeemActivationCode(activation.code.toUpperCase())).rejects.toThrow('Kode aktivasi tidak valid.');
  });

  it('membatasi izin berdasarkan peran', () => {
    const user = (role: User['role']) => ({ role } as User);
    expect(can(null, 'letter.create')).toBe(false);
    expect(can(user('ADMIN'), 'semua.izin')).toBe(true);
    expect(can(user('TU'), 'letter.create')).toBe(true);
    expect(can(user('TU'), 'user.manage')).toBe(false);
    expect(can(user('GURU'), 'letter.request')).toBe(true);
    expect(can(user('GURU'), 'letter.create')).toBe(false);
  });

  it('mengubah dan mereset password hanya dengan hash baru', async () => {
    const admin = await setupAdmin({ username: 'admin', displayName: 'Administrator', password: 'Rahasia123!' });
    const actor: Actor = { userId: admin.id, userName: admin.display_name, deviceId: getDeviceId() };
    await changePassword(admin.id, 'Rahasia123!', 'Rahasia456!', actor);
    await expect(login('admin', 'Rahasia123!')).rejects.toThrow('Username atau password salah.');
    await expect(login('admin', 'Rahasia456!')).resolves.toMatchObject({ role: 'ADMIN' });

    await resetPassword(admin.id, 'Rahasia789!', actor);
    await expect(login('admin', 'Rahasia789!')).resolves.toMatchObject({ role: 'ADMIN' });
    expect((await db.audit_logs.toArray()).some((log) => log.action === 'AUTH.PASSWORD_RESET')).toBe(true);
  });
});
