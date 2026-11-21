import { describe, expect, it } from 'vitest';
import { base64ToBlob, blobToBase64, decryptText, deriveBackupKey, encryptText, hashPassword, randomToken, sha256Hex, uuid, verifyPassword } from '@/lib/crypto';

describe('kriptografi Web Crypto', () => {
  it('menghasilkan UUID unik', () => {
    const ids = new Set(Array.from({ length: 50 }, () => uuid()));
    expect(ids.size).toBe(50);
  });

  it('hash password PBKDF2 dapat diverifikasi dan menolak password salah', async () => {
    const record = await hashPassword('Sip3rsurat!');
    expect(record.password_hash).not.toContain('Sip3rsurat!');
    expect(await verifyPassword('Sip3rsurat!', record)).toBe(true);
    expect(await verifyPassword('salah', record)).toBe(false);
  });

  it('SHA-256 deterministik', async () => {
    const a = await sha256Hex('sipersurat');
    const b = await sha256Hex('sipersurat');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enkripsi AES-GCM dapat didekripsi dengan passphrase yang sama', async () => {
    const salt = 'c2FsdC1zaXBlcnN1cmF0LTEyMzQ=';
    const key = await deriveBackupKey('passphrase-rahasia', salt, 1000);
    const encrypted = await encryptText(key, '{"data":"rahasia"}');
    expect(encrypted.data).not.toContain('rahasia');
    expect(await decryptText(key, encrypted)).toBe('{"data":"rahasia"}');
  });

  it('blob dapat dikonversi bolak-balik melalui base64', async () => {
    const blob = new Blob(['dokumen pdf'], { type: 'application/pdf' });
    const encoded = await blobToBase64(blob);
    const decoded = await base64ToBlob(encoded, 'application/pdf');
    expect(await decoded.text()).toBe('dokumen pdf');
  });

  it('token aktivasi bersifat acak', () => {
    expect(randomToken(12)).not.toBe(randomToken(12));
  });
});
