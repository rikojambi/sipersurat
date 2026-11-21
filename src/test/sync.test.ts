import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, sha256Hex, uuid } from '@/lib/crypto';

const driveRef = vi.hoisted(() => ({ client: null as any }));

vi.mock('@/lib/drive', async () => {
  const actual = await vi.importActual<typeof import('@/lib/drive')>('@/lib/drive');
  return { ...actual, getDriveClient: async () => driveRef.client };
});

import { db } from '@/db/schema';
import { createRecord, updateRecord, type Actor } from '@/db/repository';
import { pendingChangeCount, resolveConflict, syncNow, unresolvedConflicts } from '@/lib/syncManager';
import { FakeDrive } from './fakeDrive';
import { outgoingLetter, resetDb, TEST_ACTOR } from './helpers';
import type { Operation } from '@/types';

interface RemoteChange {
  change_id: string;
  entity: string;
  record_id: string;
  operation: Operation;
  version: number;
  timestamp: string;
  payload: string;
  checksum: string;
  device_id: string;
  user_id: string;
}

const actor: Actor = { ...TEST_ACTOR, deviceId: 'device-local' };

function baseMeta(deviceId = 'device-remote') {
  const t = new Date().toISOString();
  return {
    created_at: t, updated_at: t, created_by: 'remote', updated_by: 'remote',
    device_id: deviceId, sync_status: 'SYNCED' as const, deleted_at: null, version: 1
  };
}

function unitRecord(id: string, name: string) {
  return { ...baseMeta(), id, name, code: id.toUpperCase() };
}

async function remoteChange(record: object, overrides: Partial<RemoteChange> = {}): Promise<RemoteChange> {
  const payload = JSON.stringify(record);
  const change: RemoteChange = {
    change_id: uuid(),
    entity: 'units',
    record_id: String((record as { id?: string }).id ?? ''),
    operation: 'CREATE',
    version: 1,
    timestamp: new Date().toISOString(),
    payload,
    checksum: await sha256Hex(payload),
    device_id: 'device-remote',
    user_id: 'remote-user',
    ...overrides
  };
  return change;
}

async function seedRemotePackage(drive: FakeDrive, changes: RemoteChange[]): Promise<void> {
  const pkg = {
    package_id: uuid(), device_id: 'device-remote',
    created_at: new Date().toISOString(), app_version: '1.0.0', changes
  };
  const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
  const checksum = await sha256Hex(await blob.arrayBuffer());
  const name = `change-device-remote-${pkg.package_id}.json`;
  const file = await drive.uploadBlob(drive.folders.changeLogs, name, blob);
  await drive.uploadJson(drive.folders.manifest, 'manifest-device-remote.json', {
    device_id: 'device-remote', updated_at: new Date().toISOString(),
    entries: [{
      file_id: file.id, name, checksum, device_id: 'device-remote',
      created_at: pkg.created_at, change_ids: changes.map((c) => c.change_id)
    }]
  });
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('sipersurat_device_id', 'device-local');
  driveRef.client = new FakeDrive();
  await resetDb();
});

describe('sinkronisasi Google Drive berbasis paket', () => {
  it('mengubah status PENDING hanya setelah checksum unggahan terverifikasi', async () => {
    const drive = driveRef.client as FakeDrive;
    await createRecord('units', { name: 'Kurikulum', code: 'KUR' }, actor, { audit: false });
    expect(await pendingChangeCount()).toBe(1);

    drive.corruptNextDownload = true;
    await expect(syncNow(actor)).rejects.toThrow('Checksum paket tidak cocok');
    expect(await pendingChangeCount()).toBe(1);
    expect(await drive.findChild(drive.folders.manifest, 'manifest-device-local.json')).toBeUndefined();

    const summary = await syncNow(actor);
    expect(summary.uploadedPackages).toBe(1);
    expect(summary.uploadedChanges).toBe(1);
    // Dalam satu siklus, push menandai UPLOADED lalu pull memverifikasi paket sendiri menjadi SYNCED.
    expect((await db.sync_queue.toArray())[0]?.sync_status).toBe('SYNCED');
    expect(await drive.findChild(drive.folders.manifest, 'manifest-device-local.json')).toBeTruthy();
    expect(await db.data_versions.count()).toBe(1);

    // Siklus berikutnya tidak menerapkan ulang paket yang sama.
    const second = await syncNow(actor);
    expect(second.appliedChanges).toBe(0);
    expect(second.downloadedPackages).toBe(0);
    expect(await db.data_versions.count()).toBe(1);
  });

  it('menarik perubahan perangkat lain sekali saja dan mencatat data version', async () => {
    const drive = driveRef.client as FakeDrive;
    const change = await remoteChange(unitRecord('unit-remote', 'Kesiswaan'));
    await seedRemotePackage(drive, [change]);

    const first = await syncNow(actor);
    expect(first.downloadedPackages).toBe(1);
    expect(first.appliedChanges).toBe(1);
    expect((await db.units.get('unit-remote'))?.name).toBe('Kesiswaan');
    expect(await db.data_versions.get(change.change_id)).toBeTruthy();

    const second = await syncNow(actor);
    expect(second.downloadedPackages).toBe(0);
    expect(second.appliedChanges).toBe(0);
    // 4 unit bawaan dari populate + 1 unit remote.
    expect(await db.units.count()).toBe(5);
  });

  it('mendeteksi konflik pada entitas kritis dan menyelesaikannya dengan versi remote', async () => {
    const drive = driveRef.client as FakeDrive;
    const local = await createRecord('outgoing_letters', outgoingLetter({
      id: 'surat-konflik', subject: 'Versi lokal', official_number: '001/UND/SMKN6-MJ/XI/2026'
    }), actor, { audit: false });
    await updateRecord('outgoing_letters', local.id, { subject: 'Versi lokal revisi' }, actor, { audit: false });

    const remote = await remoteChange(outgoingLetter({
      id: local.id, subject: 'Versi Drive', official_number: '001/UND/SMKN6-MJ/XI/2026', version: 1
    }), { entity: 'outgoing_letters', record_id: local.id, operation: 'UPDATE' });
    await seedRemotePackage(drive, [remote]);

    const summary = await syncNow(actor);
    expect(summary.conflicts).toBe(1);
    expect(await unresolvedConflicts()).toBe(1);
    expect((await db.outgoing_letters.get(local.id))?.subject).toBe('Versi lokal revisi');

    const conflict = (await db.sync_conflicts.toArray())[0]!;
    await resolveConflict(conflict.id, 'REMOTE', actor);
    const resolved = await db.outgoing_letters.get(local.id);
    expect(resolved?.subject).toBe('Versi Drive');
    expect(resolved?.version).toBe(3);
    expect(await db.data_versions.get(remote.change_id)).toBeTruthy();
    expect(await unresolvedConflicts()).toBe(0);
  });

  it('menolak payload remote yang checksum-nya tidak cocok', async () => {
    const drive = driveRef.client as FakeDrive;
    const change = await remoteChange(unitRecord('unit-rusak', 'Rusak'));
    change.checksum = '0'.repeat(64);
    await seedRemotePackage(drive, [change]);

    const summary = await syncNow(actor);
    expect(summary.conflicts).toBe(1);
    expect(await db.units.get('unit-rusak')).toBeUndefined();
    expect((await db.sync_conflicts.toArray())[0]?.remote_payload).toContain('unit-rusak');
  });

  it('mengembalikan Blob lampiran dari payload base64', async () => {
    const drive = driveRef.client as FakeDrive;
    const content = new TextEncoder().encode('isi lampiran dari drive');
    const attachment = {
      ...baseMeta(), id: 'lampiran-remote', name: 'scan.pdf', mime: 'application/pdf',
      size: content.length, checksum: await sha256Hex(content), category: 'LAMPIRAN',
      owner_id: 'surat-1', blob: `__B64__:${bytesToBase64(content)}`
    };
    const change = await remoteChange(attachment, { entity: 'attachments', record_id: 'lampiran-remote' });
    await seedRemotePackage(drive, [change]);

    await syncNow(actor);
    const stored = await db.attachments.get('lampiran-remote');
    expect(stored?.blob).toBeInstanceOf(Blob);
    expect(await stored!.blob.text()).toBe('isi lampiran dari drive');
  });
});
