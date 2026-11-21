/** Utilitas kriptografi berbasis Web Crypto API. Password/passphrase tidak pernah ditanam di source. */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function randomToken(bytes = 12): string {
  return bytesToBase64(randomBytes(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return base64ToBytes(normalized + '='.repeat(padding));
}

/**
 * HMAC dipakai untuk kode aktivasi mandiri: perangkat baru dapat memverifikasi
 * kode tanpa memiliki database admin. Kunci berasal dari VITE_ACTIVATION_PEPPER.
 */
export async function hmacSha256Base64Url(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

export async function verifyHmacSha256Base64Url(data: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signature) as BufferSource, encoder.encode(data));
  } catch {
    return false;
  }
}

export function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = typeof data === 'string' ? encoder.encode(data) : data instanceof Uint8Array ? data : data;
  return crypto.subtle.digest('SHA-256', buffer as BufferSource).then((hash) =>
    Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
  );
}

const PBKDF2_ITERATIONS = 310_000;

export interface PasswordRecord {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

export async function hashPassword(password: string, salt = bytesToBase64(randomBytes(16)), iterations = PBKDF2_ITERATIONS): Promise<PasswordRecord> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64ToBytes(salt) as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return { password_hash: bytesToBase64(new Uint8Array(bits)), password_salt: salt, password_iterations: iterations };
}

export async function verifyPassword(password: string, record: Pick<PasswordRecord, 'password_hash' | 'password_salt' | 'password_iterations'>): Promise<boolean> {
  try {
    const candidate = await hashPassword(password, record.password_salt, record.password_iterations || PBKDF2_ITERATIONS);
    const a = base64ToBytes(candidate.password_hash);
    const b = base64ToBytes(record.password_hash);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
  } catch {
    return false;
  }
}

/** Kunci backup diturunkan dari passphrase yang dimasukkan admin (bukan dari source code). */
export async function deriveBackupKey(passphrase: string, saltBase64: string, iterations = 210_000): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(saltBase64) as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload { iv: string; data: string }

export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoder.encode(plaintext));
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) as BufferSource },
    key,
    base64ToBytes(payload.data) as BufferSource
  );
  return decoder.decode(decrypted);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export async function base64ToBlob(base64: string, mime = 'application/octet-stream'): Promise<Blob> {
  return new Blob([base64ToBytes(base64) as BlobPart], { type: mime });
}

export function sanitizeText(value: string, maxLength = 5000): string {
  return value.replace(/[<>]/g, '').trim().slice(0, maxLength);
}
