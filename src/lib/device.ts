import { db, getSetting, setSetting } from '@/db/schema';
import { logAudit } from '@/db/repository';
import {
  base64UrlToBytes, bytesToBase64Url, hmacSha256Base64Url, randomBytes,
  sha256Hex, uuid, verifyHmacSha256Base64Url
} from '@/lib/crypto';
import type { Actor } from '@/db/repository';
import type { DeviceRegistry } from '@/types';

const DEVICE_KEY = 'sipersurat_device_id';

export const APP_VERSION = '1.0.0';

/**
 * Kode aktivasi adalah token mandiri (payload + HMAC) sehingga perangkat baru
 * dapat memverifikasinya sebelum paket Drive pertama diterima. Pepper harus
 * sama pada semua instalasi; set VITE_ACTIVATION_PEPPER di build produksi.
 */
const ACTIVATION_PEPPER = import.meta.env.VITE_ACTIVATION_PEPPER || 'SIPERSURAT-LOCAL-ACTIVATION-v1';
const ACTIVATION_VERSION = 1;
const tokenEncoder = new TextEncoder();
const tokenDecoder = new TextDecoder();

interface ActivationPayload { v: number; exp: string; name: string; nonce: string }

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function detectDeviceType(): DeviceRegistry['type'] {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return /Tablet|iPad/i.test(ua) || Math.min(screen.width, screen.height) > 700 ? 'TABLET' : 'ANDROID';
  if (/Windows/i.test(ua)) return 'WINDOWS';
  return 'BROWSER';
}

export function defaultDeviceName(): string {
  const type = detectDeviceType();
  const names: Record<DeviceRegistry['type'], string> = {
    ANDROID: 'HP Android', TABLET: 'Tablet Android', WINDOWS: 'Laptop Windows', BROWSER: 'Browser'
  };
  return `${names[type]}-${getDeviceId().slice(0, 4).toUpperCase()}`;
}

export async function getDevice(): Promise<DeviceRegistry | undefined> {
  return db.device_registry.get(getDeviceId());
}

export async function ensureDeviceRecord(name?: string): Promise<DeviceRegistry> {
  const id = getDeviceId();
  const existing = await db.device_registry.get(id);
  if (existing) return existing;
  const t = new Date().toISOString();
  const record: DeviceRegistry = {
    id, name: name || defaultDeviceName(), type: detectDeviceType(),
    last_user_id: '', registered_at: t, last_sync_at: null,
    status: 'PENDING', app_version: APP_VERSION, is_registration_device: 0,
    activation_code_hash: '', activation_expires_at: null, initial_sync_done: 0,
    last_seen_at: t, created_at: t, updated_at: t, created_by: 'system',
    updated_by: 'system', device_id: id, sync_status: 'PENDING', deleted_at: null, version: 1
  };
  await db.device_registry.add(record);
  return record;
}

export async function bootstrapAdminDevice(actor: Actor, name?: string): Promise<DeviceRegistry> {
  const device = await ensureDeviceRecord(name);
  if (device.is_registration_device && device.status === 'ACTIVE') return device;
  const updated = { ...device, status: 'ACTIVE' as const, is_registration_device: 1, initial_sync_done: 1, last_user_id: actor.userId };
  await db.device_registry.put(updated);
  await setSetting('registration_device_id', device.id);
  await logAudit('DEVICE.BOOTSTRAP', 'device_registry', device.id, actor, 'Perangkat awal ditetapkan sebagai perangkat registrasi resmi', 'CRITICAL');
  return updated;
}

export interface ActivationCode { code: string; expires_at: string; device_name: string }

export async function createActivationCode(deviceName: string, actor: Actor, hours = 48): Promise<ActivationCode> {
  const expires = new Date(Date.now() + hours * 3600_000).toISOString();
  const payload: ActivationPayload = {
    v: ACTIVATION_VERSION,
    exp: expires,
    name: deviceName,
    nonce: bytesToBase64Url(randomBytes(12))
  };
  const body = bytesToBase64Url(tokenEncoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256Base64Url(body, ACTIVATION_PEPPER);
  const code = `${body}.${signature}`;
  const hash = await sha256Hex(code);
  const t = new Date().toISOString();
  await db.application_settings.add({
    id: uuid(), key: `activation:${hash}`, value: JSON.stringify({ expires_at: expires, device_name: deviceName, created_by: actor.userId, used: false }),
    created_at: t, updated_at: t, created_by: actor.userId, updated_by: actor.userId,
    device_id: actor.deviceId, sync_status: 'PENDING', deleted_at: null, version: 1
  });
  await logAudit('DEVICE.ACTIVATION_CREATED', 'device_registry', hash, actor, `Kode aktivasi dibuat untuk ${deviceName} (${hours} jam)`, 'WARNING');
  return { code, expires_at: expires, device_name: deviceName };
}

export async function redeemActivationCode(code: string, name?: string): Promise<DeviceRegistry> {
  const token = code.trim();
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new Error('Kode aktivasi tidak valid.');
  if (!(await verifyHmacSha256Base64Url(body, signature, ACTIVATION_PEPPER))) throw new Error('Kode aktivasi tidak valid.');

  let payload: ActivationPayload;
  try {
    payload = JSON.parse(tokenDecoder.decode(base64UrlToBytes(body))) as ActivationPayload;
  } catch {
    throw new Error('Kode aktivasi tidak valid.');
  }
  if (payload.v !== ACTIVATION_VERSION || !payload.exp || !payload.nonce) throw new Error('Kode aktivasi tidak valid.');

  const hash = await sha256Hex(token);
  const row = await db.application_settings.where('key').equals(`activation:${hash}`).first();
  const info = row ? JSON.parse(row.value) as { expires_at: string; device_name: string; used: boolean } : undefined;
  if (info?.used) throw new Error('Kode aktivasi sudah digunakan.');
  const expiresAt = info?.expires_at || payload.exp;
  if (new Date(expiresAt).getTime() < Date.now()) throw new Error('Kode aktivasi sudah kedaluwarsa.');

  const id = getDeviceId();
  const existing = await db.device_registry.get(id);
  const t = new Date().toISOString();
  const device: DeviceRegistry = {
    id,
    name: name || info?.device_name || payload.name || defaultDeviceName(),
    type: detectDeviceType(),
    last_user_id: '',
    registered_at: existing?.registered_at || t,
    last_sync_at: null,
    status: 'PENDING',
    app_version: APP_VERSION,
    is_registration_device: 0,
    activation_code_hash: hash,
    activation_expires_at: expiresAt,
    initial_sync_done: 0,
    last_seen_at: t,
    created_at: existing?.created_at || t,
    updated_at: t,
    created_by: existing?.created_by || 'system',
    updated_by: 'system',
    device_id: id,
    sync_status: 'PENDING',
    deleted_at: null,
    version: (existing?.version ?? 0) + 1
  };
  await db.device_registry.put(device);
  if (row) {
    await db.application_settings.update(row.id, { value: JSON.stringify({ ...info, used: true }), updated_at: t });
  } else {
    // Perangkat baru belum menerima paket Drive admin; catat pemakaian secara lokal.
    // Pemakaian lintas perangkat tetap bergantung pada sinkronisasi (lihat batasan offline).
    await db.application_settings.add({
      id: uuid(), key: `activation:${hash}`,
      value: JSON.stringify({ expires_at: expiresAt, device_name: payload.name, created_by: 'device', used: true }),
      created_at: t, updated_at: t, created_by: 'device', updated_by: 'device',
      device_id: id, sync_status: 'PENDING', deleted_at: null, version: 1
    });
  }
  await setSetting('device_activated_at', t);
  return device;
}

export async function touchDevice(): Promise<void> {
  const id = getDeviceId();
  const d = await db.device_registry.get(id);
  if (d) await db.device_registry.update(id, { last_seen_at: new Date().toISOString() });
}

export async function markInitialSyncDone(deviceId: string): Promise<void> {
  const d = await db.device_registry.get(deviceId);
  if (d) await db.device_registry.update(deviceId, { initial_sync_done: 1, last_sync_at: new Date().toISOString(), sync_status: 'SYNCED' });
}

export async function isRegistrationDevice(): Promise<boolean> {
  const configured = await getSetting('registration_device_id');
  if (configured) return configured === getDeviceId();
  const d = await getDevice();
  return !!d?.is_registration_device;
}
