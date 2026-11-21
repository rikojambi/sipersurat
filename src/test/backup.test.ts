import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting } from '@/db/schema';
import { createRecord, type Actor } from '@/db/repository';
import { sha256Hex } from '@/lib/crypto';
import {
  backupSlotsWIB, configureBackupPassphrase, createBackup, inspectBackup, isBackupDue,
  restoreBackup, verifyBackupPassphrase
} from '@/lib/backup';
import { resetDb, outgoingLetter, TEST_ACTOR } from './helpers';
import type { Attachment, OutgoingLetter } from '@/types';

const PASSPHRASE = 'PassphraseRahasiaSip3r!';
const actor: Actor = TEST_ACTOR;
const bytes = new TextEncoder().encode('isi dokumen rahasia sekolah');

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
  await configureBackupPassphrase(PASSPHRASE);
});

async function seedAttachment(): Promise<Attachment> {
  return createRecord<Attachment>('attachments', {
    name: 'bukti.pdf', mime: 'application/pdf', size: bytes.length,
    checksum: await sha256Hex(bytes), category: 'SURAT_MASUK',
    owner_id: 'surat-masuk-1', blob: new Blob([bytes], { type: 'application/pdf' })
  }, actor);
}

describe('backup terenkripsi, restore, dan jadwal WIB', () => {
  it('mengonfigurasi passphrase dan menolak passphrase salah', async () => {
    expect(await verifyBackupPassphrase(PASSPHRASE)).toBe(true);
    expect(await verifyBackupPassphrase('PassphraseSalahSip3r!')).toBe(false);
    await expect(configureBackupPassphrase('pendek')).rejects.toThrow('minimal 10 karakter');
  });

  it('membuat ZIP terenkripsi tanpa salinan sinkronisasi plaintext', async () => {
    await seedAttachment();
    const created = await createBackup('MANUAL', actor, 'Uji');
    expect(created.info.encrypted).toBe(true);
    expect(created.info.schema_version).toBe(3);
    expect(created.checksum).toBe(await sha256Hex(await created.blob.arrayBuffer()));
    expect(created.fileName).toMatch(/^SIPERSURAT_BACKUP_UJI_\d+\.zip$/);

    const zip = await JSZip.loadAsync(created.blob);
    expect(zip.file('database/sipersurat.json.enc')).not.toBeNull();
    expect(zip.file('metadata/encryption.json')).not.toBeNull();
    expect(zip.file('sync/change-log.json')).toBeNull();
    expect(zip.file('sync/sync-state.json')).toBeNull();
    const encrypted = await zip.file('database/sipersurat.json.enc')!.async('string');
    expect(encrypted).not.toContain('bukti.pdf');
    expect(encrypted).not.toContain('isi dokumen rahasia');

    const { preview, tables } = await inspectBackup(created.blob, PASSPHRASE);
    expect(preview.valid).toBe(true);
    expect(preview.counts.attachments).toBe(1);
    const row = tables.attachments![0] as unknown as { blob: Blob };
    expect(row.blob).toBeInstanceOf(Blob);
    expect(await row.blob.text()).toBe('isi dokumen rahasia sekolah');
  });

  it('menolak backup dengan passphrase salah atau checksum rusak', async () => {
    const created = await createBackup('MANUAL', actor, 'Uji');
    await expect(inspectBackup(created.blob, 'PassphraseSalahSip3r!')).rejects.toThrow();

    const zip = await JSZip.loadAsync(created.blob);
    const info = JSON.parse(await zip.file('metadata/backup-info.json')!.async('string')) as { record_count: number };
    zip.file('metadata/backup-info.json', JSON.stringify({ ...info, record_count: 999 }));
    const tampered = await zip.generateAsync({ type: 'blob' });
    await expect(inspectBackup(tampered, PASSPHRASE)).rejects.toThrow('Checksum tidak cocok');
  });

  it('restore mengganti data, memulihkan isi lampiran, dan menyimpan salinan darurat', async () => {
    const before = await createRecord<OutgoingLetter>('outgoing_letters', outgoingLetter({
      id: 'sebelum-backup', subject: 'Surat sebelum backup'
    }), actor);
    const attachment = await seedAttachment();
    const created = await createBackup('MANUAL', actor, 'Uji');

    await createRecord<OutgoingLetter>('outgoing_letters', outgoingLetter({
      id: 'sesudah-backup', subject: 'Surat sesudah backup'
    }), actor);

    const counts = await restoreBackup(created.blob, PASSPHRASE, actor, 'DEVICE');
    expect(counts.outgoing_letters).toBe(1);
    expect((await db.outgoing_letters.get(before.id))?.subject).toBe('Surat sebelum backup');
    expect(await db.outgoing_letters.get('sesudah-backup')).toBeUndefined();

    const restored = await db.attachments.get(attachment.id);
    expect(restored?.blob).toBeInstanceOf(Blob);
    expect(await restored!.blob.text()).toBe('isi dokumen rahasia sekolah');

    const safety = await db.attachments.where('owner_id').equals('LOCAL_SAFETY_BACKUP').first();
    expect(safety?.name).toMatch(/^PRE_RESTORE_/);
    expect(safety?.blob.size).toBeGreaterThan(0);
    expect(await getSetting('restore_mode')).toBe('DEVICE');
    expect(await getSetting('last_restore_at')).toBeTruthy();
  });

  it('menentukan slot backup WIB dan status BACKUP DUE dengan tepat', () => {
    const now = new Date('2026-11-21T07:00:00.000Z'); // 14.00 WIB
    expect(backupSlotsWIB(now).map((s) => s.toISOString())).toEqual([
      '2026-11-20T17:00:00.000Z',
      '2026-11-20T23:00:00.000Z',
      '2026-11-21T05:00:00.000Z',
      '2026-11-21T11:00:00.000Z'
    ]);
    expect(isBackupDue('2026-11-21T05:00:00.000Z', now).due).toBe(false);
    expect(isBackupDue('2026-11-20T23:00:00.000Z', now).due).toBe(true);
    expect(isBackupDue('', now).due).toBe(true);
  });
});
