import { db } from '@/db/schema';
import { createRecord, getActive, listActive, logAudit, updateRecord, type Actor } from '@/db/repository';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { bootstrapAdminDevice, getDeviceId } from '@/lib/device';
import type { RoleName, User } from '@/types';

const SESSION_KEY = 'sipersurat_session_user';

export function currentUserId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSession(userId: string): void {
  localStorage.setItem(SESSION_KEY, userId);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function hasUsers(): Promise<boolean> {
  return (await db.users.count()) > 0;
}

export async function setupAdmin(input: { username: string; displayName: string; password: string; schoolName?: string }): Promise<User> {
  if (await hasUsers()) throw new Error('Akun admin sudah dibuat. Gunakan halaman Pengguna untuk menambah akun.');
  const password = await hashPassword(input.password);
  const actor: Actor = { userId: 'setup', userName: 'Setup Awal', deviceId: getDeviceId() };
  const user = await createRecord<User>('users', {
    username: input.username.trim().toLowerCase(),
    display_name: input.displayName.trim(),
    role: 'ADMIN',
    is_active: 1,
    nip: '', email: '', unit_id: '',
    last_login_at: null,
    ...password
  }, actor, { details: 'Membuat akun administrator awal' });
  if (input.schoolName) {
    const school = await db.school_settings.get('00000000-0000-4000-8000-000000000001');
    if (school) await db.school_settings.update(school.id, { name: input.schoolName, updated_at: new Date().toISOString() });
  }
  await bootstrapAdminDevice({ ...actor, userId: user.id, userName: user.display_name });
  setSession(user.id);
  return user;
}

export async function login(username: string, password: string): Promise<User> {
  const user = await db.users.where('username').equals(username.trim().toLowerCase()).first();
  if (!user || user.deleted_at) throw new Error('Username atau password salah.');
  if (!(await verifyPassword(password, user))) throw new Error('Username atau password salah.');
  if (!user.is_active) throw new Error('Akun ini dinonaktifkan. Hubungi administrator.');
  const device = await db.device_registry.get(getDeviceId());
  if (!device) throw new Error('Perangkat belum terdaftar. Lakukan registrasi perangkat terlebih dahulu.');
  if (device.status === 'REVOKED' || device.status === 'INACTIVE') throw new Error('Perangkat ini tidak memiliki akses. Hubungi administrator.');
  if (device.status === 'PENDING' && user.role !== 'ADMIN') throw new Error('Perangkat belum menjalani sinkronisasi awal dan persetujuan admin.');
  await db.users.update(user.id, { last_login_at: new Date().toISOString() });
  await logAudit('AUTH.LOGIN', 'users', user.id, { userId: user.id, userName: user.display_name, deviceId: getDeviceId() }, 'Berhasil masuk', 'INFO');
  setSession(user.id);
  return { ...user, last_login_at: new Date().toISOString() };
}

/** Logout hanya menghapus sesi. TIDAK menghapus database lokal. */
export async function logout(actor?: Actor): Promise<void> {
  if (actor) await logAudit('AUTH.LOGOUT', 'users', actor.userId, actor, 'Keluar dari aplikasi (data lokal tetap tersimpan)', 'INFO');
  clearSession();
}

export async function getCurrentUser(): Promise<User | null> {
  const id = currentUserId();
  if (!id) return null;
  const user = await getActive<User>('users', id);
  if (!user || !user.is_active) {
    clearSession();
    return null;
  }
  return user;
}

export async function createUser(input: { username: string; displayName: string; password: string; role: RoleName; nip?: string; email?: string; unit_id?: string }, actor: Actor): Promise<User> {
  const exists = await db.users.where('username').equals(input.username.trim().toLowerCase()).first();
  if (exists) throw new Error('Username sudah digunakan.');
  const password = await hashPassword(input.password);
  return createRecord<User>('users', {
    username: input.username.trim().toLowerCase(), display_name: input.displayName.trim(),
    role: input.role, nip: input.nip || '', email: input.email || '', unit_id: input.unit_id || '',
    is_active: 1, last_login_at: null, ...password
  }, actor, { details: `Membuat akun ${input.role}: ${input.username}` });
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string, actor: Actor): Promise<void> {
  const user = await db.users.get(userId);
  if (!user) throw new Error('Pengguna tidak ditemukan.');
  if (!(await verifyPassword(oldPassword, user))) throw new Error('Password lama salah.');
  if (newPassword.length < 8) throw new Error('Password minimal 8 karakter.');
  const password = await hashPassword(newPassword);
  await updateRecord('users', userId, password as never, actor, { details: 'Mengubah password akun' });
}

export async function resetPassword(userId: string, newPassword: string, actor: Actor): Promise<void> {
  if (newPassword.length < 8) throw new Error('Password minimal 8 karakter.');
  const password = await hashPassword(newPassword);
  await updateRecord('users', userId, password as never, actor, { details: 'Reset password oleh administrator' });
  await logAudit('AUTH.PASSWORD_RESET', 'users', userId, actor, 'Reset password oleh administrator', 'CRITICAL');
}

export async function setUserActive(userId: string, active: boolean, actor: Actor): Promise<void> {
  await updateRecord('users', userId, { is_active: active ? 1 : 0 } as never, actor, {
    details: active ? 'Mengaktifkan akun' : 'Menonaktifkan akun (berlaku setelah sinkronisasi pada perangkat lain)'
  });
}

export async function allUsers(): Promise<User[]> {
  return listActive<User>('users');
}

export function can(user: User | null, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'TU') return ['letter.create', 'letter.register', 'disposition.manage', 'archive.manage', 'report.view', 'print'].includes(permission);
  return ['letter.request', 'disposition.followup', 'print.own', 'report.view'].includes(permission);
}
