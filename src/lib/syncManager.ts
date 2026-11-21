import { db } from '@/db/schema';
import { base64ToBlob, sha256Hex, uuid } from '@/lib/crypto';
import { getDeviceId, markInitialSyncDone } from '@/lib/device';
import { getDriveClient, type DriveFile, type FolderIds } from '@/lib/drive';
import { logAudit, notify, type Actor } from '@/db/repository';
import { setSetting } from '@/db/schema';
import type { BaseEntity, ChangeRecord, EntityName, SyncConflict } from '@/types';

interface ChangePackage {
  package_id: string;
  device_id: string;
  created_at: string;
  app_version: string;
  changes: Array<Pick<ChangeRecord, 'change_id' | 'entity' | 'record_id' | 'operation' | 'version' | 'timestamp' | 'payload' | 'checksum' | 'device_id' | 'user_id'>>;
}
interface ManifestEntry { file_id: string; name: string; checksum: string; device_id: string; created_at: string; change_ids: string[] }
interface Manifest { device_id: string; updated_at: string; entries: ManifestEntry[] }

export interface SyncSummary {
  uploadedPackages: number;
  uploadedChanges: number;
  downloadedPackages: number;
  appliedChanges: number;
  conflicts: number;
  message: string;
}

const SYNCABLE: EntityName[] = [
  'users', 'roles', 'school_settings', 'incoming_letters', 'outgoing_letters',
  'letter_types', 'letter_classifications', 'letter_number_sequences', 'dispositions',
  'disposition_recipients', 'attachments', 'document_archives', 'letter_templates',
  'audit_logs', 'notifications', 'device_registry', 'application_settings', 'units'
];
const CRITICAL_ENTITIES: EntityName[] = ['outgoing_letters', 'letter_number_sequences', 'device_registry', 'users', 'roles', 'school_settings'];

let running = false;
export function isSyncRunning(): boolean { return running; }

function tableOf(entity: EntityName) {
  return db[entity] as unknown as {
    get(id: string): Promise<BaseEntity | undefined>;
    put(item: unknown): Promise<string>;
    update(id: string, patch: unknown): Promise<number>;
  };
}

async function restoreValue(value: unknown): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith('__B64__:')) return base64ToBlob(value.slice(8));
  if (Array.isArray(value)) return Promise.all(value.map((item) => restoreValue(item)));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await restoreValue(v);
    return out;
  }
  return value;
}

async function historyStart(direction: 'UPLOAD' | 'DOWNLOAD', deviceId: string, checksum = '') {
  const t = new Date().toISOString();
  const id = uuid();
  await db.sync_history.add({
    id, direction, device_id: deviceId, packages: 0, records: 0, started_at: t,
    finished_at: null, status: 'BERJALAN', message: '', checksum,
    created_at: t, updated_at: t, created_by: 'system', updated_by: 'system',
    sync_status: 'PENDING', deleted_at: null, version: 1
  });
  return id;
}

async function historyFinish(id: string, status: 'BERHASIL' | 'GAGAL', packages: number, records: number, message: string) {
  await db.sync_history.update(id, { status, packages, records, message, finished_at: new Date().toISOString() });
}

async function recordApplied(change: ChangePackage['changes'][number], deviceId: string) {
  await db.data_versions.put({
    change_id: change.change_id, entity: change.entity, record_id: change.record_id,
    version: change.version, applied_at: new Date().toISOString(), device_id: deviceId
  });
}

async function pushChanges(folders: FolderIds, deviceId: string): Promise<{ packages: number; records: number }> {
  const pending = await db.sync_queue.where('sync_status').equals('PENDING').toArray();
  if (!pending.length) return { packages: 0, records: 0 };
  const drive = await getDriveClient();
  const batch = pending.slice(0, 300);
  const pkg: ChangePackage = {
    package_id: uuid(), device_id: deviceId, created_at: new Date().toISOString(), app_version: '1.0.0',
    changes: batch.map((c) => ({
      change_id: c.change_id, entity: c.entity, record_id: c.record_id, operation: c.operation,
      version: c.version, timestamp: c.timestamp, payload: c.payload, checksum: c.checksum,
      device_id: c.device_id, user_id: c.user_id
    }))
  };
  const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
  const checksum = await drive.checksum(blob);
  const name = `change-${deviceId}-${Date.now()}-${pkg.package_id}.json`;
  const file = await drive.uploadJson(folders.changeLogs, name, pkg);
  // Verifikasi nyata: unduh kembali dan samakan checksum sebelum status diubah.
  const downloaded = await drive.download(file.id);
  if (await drive.checksum(downloaded) !== checksum) throw new Error('Checksum paket tidak cocok setelah unggah.');
  await drive.getFile(file.id);

  const manifestName = `manifest-${deviceId}.json`;
  const existing = await drive.findChild(folders.manifest, manifestName);
  const prev = existing ? JSON.parse(await (await drive.download(existing.id)).text()) as Manifest : { device_id: deviceId, updated_at: '', entries: [] };
  const entry: ManifestEntry = { file_id: file.id, name, checksum, device_id: deviceId, created_at: pkg.created_at, change_ids: batch.map((c) => c.change_id) };
  const manifest: Manifest = { device_id: deviceId, updated_at: new Date().toISOString(), entries: [...prev.entries.filter((e) => e.file_id !== file.id), entry] };
  if (existing) await drive.updateJson(existing.id, manifest);
  else await drive.uploadJson(folders.manifest, manifestName, manifest);
  const verifyManifest = await drive.findChild(folders.manifest, manifestName);
  if (!verifyManifest) throw new Error('Manifest tidak dikonfirmasi Google Drive.');

  // Status berubah hanya setelah Drive mengonfirmasi penyimpanan paket dan manifest.
  for (const c of batch) {
    await db.sync_queue.update(c.id, { sync_status: 'UPLOADED', attempts: c.attempts + 1 });
  }
  return { packages: 1, records: batch.length };
}

async function handleConflict(change: ChangePackage['changes'][number], local: BaseEntity | undefined, reason: string) {
  const existing = await db.sync_conflicts.where('[entity+record_id]').equals([change.entity, change.record_id]).first()
    .catch(() => db.sync_conflicts.toArray().then((rows) => rows.find((r) => r.entity === change.entity && r.record_id === change.record_id && !r.resolved_at)));
  if (existing && !existing.resolved_at) return;
  const t = new Date().toISOString();
  const conflict = {
    id: uuid(), entity: change.entity, record_id: change.record_id,
    local_payload: JSON.stringify(local ?? null), remote_payload: change.payload,
    local_version: local?.version ?? 0, remote_version: change.version,
    remote_change_id: change.change_id, detected_at: t, resolved_at: null, resolution: null, resolved_by: '',
    created_at: t, updated_at: t, created_by: 'system', updated_by: 'system',
    device_id: change.device_id, sync_status: 'CONFLICT' as const, deleted_at: null, version: 1
  } as SyncConflict;
  await db.sync_conflicts.add(conflict);
  await db.sync_queue.where('change_id').equals(change.change_id).modify({ sync_status: 'CONFLICT', error: reason });
  const admins = (await db.users.filter((u) => u.role === 'ADMIN' && !u.deleted_at).toArray());
  for (const admin of admins) await notify(admin.id, 'Konflik sinkronisasi', `${change.entity}: ${reason}`, '/pengaturan/konflik', 'PENTING');
}

async function applyChange(change: ChangePackage['changes'][number]): Promise<'APPLIED' | 'SKIPPED' | 'CONFLICT'> {
  if (!SYNCABLE.includes(change.entity as EntityName)) return 'SKIPPED';
  if (await db.data_versions.get(change.change_id)) return 'SKIPPED';
  if (change.device_id === getDeviceId()) {
    await recordApplied(change, change.device_id);
    await db.sync_queue.where('change_id').equals(change.change_id).modify({ sync_status: 'SYNCED' });
    return 'SKIPPED';
  }
  const table = tableOf(change.entity as EntityName);
  const local = await table.get(change.record_id);
  const remote = (await restoreValue(JSON.parse(change.payload))) as BaseEntity;
  const payloadChecksum = await sha256Hex(change.payload);
  if (payloadChecksum !== change.checksum) {
    await handleConflict(change, local, 'Checksum payload tidak cocok.');
    return 'CONFLICT';
  }
  const critical = CRITICAL_ENTITIES.includes(change.entity as EntityName);
  const isOfficialNumber = change.entity === 'outgoing_letters' && !!(remote as unknown as Record<string, unknown>).official_number;
  if ((critical || isOfficialNumber) && local && local.version >= change.version) {
    await handleConflict(change, local, 'Perubahan pada data kritis memerlukan keputusan admin.');
    return 'CONFLICT';
  }
  if (local && local.version > change.version) {
    await handleConflict(change, local, 'Versi lokal lebih baru daripada versi remote.');
    return 'CONFLICT';
  }
  if (local && local.version === change.version && JSON.stringify(local) !== JSON.stringify(remote)) {
    await handleConflict(change, local, 'Versi sama tetapi isi berbeda.');
    return 'CONFLICT';
  }
  let finalRecord: BaseEntity = remote;
  if (change.operation === 'DELETE') finalRecord = { ...remote, deleted_at: remote.deleted_at || new Date().toISOString() };
  await table.put({ ...finalRecord, sync_status: 'SYNCED' });
  await recordApplied(change, change.device_id);
  await db.sync_queue.where('change_id').equals(change.change_id).modify({ sync_status: 'SYNCED' });
  return 'APPLIED';
}

async function pullChanges(folders: FolderIds): Promise<{ packages: number; applied: number; conflicts: number }> {
  const drive = await getDriveClient();
  const manifests = await drive.list(`'${folders.manifest}' in parents and name contains 'manifest-' and trashed=false`, 'files(id,name)');
  const seen = new Set<string>();
  let packages = 0, applied = 0, conflicts = 0;
  for (const manifestFile of manifests) {
    let manifest: Manifest;
    try { manifest = JSON.parse(await (await drive.download(manifestFile.id)).text()) as Manifest; }
    catch { continue; }
    for (const entry of manifest.entries || []) {
      if (seen.has(entry.file_id)) continue;
      seen.add(entry.file_id);
      const appliedFlags = await Promise.all(entry.change_ids.map((cid) => db.data_versions.get(cid).then((row) => !!row)));
      if (appliedFlags.every(Boolean)) continue;
      let pkg: ChangePackage;
      try {
        const blob = await drive.download(entry.file_id);
        if (await drive.checksum(blob) !== entry.checksum) throw new Error('Checksum paket tidak cocok.');
        pkg = JSON.parse(await blob.text()) as ChangePackage;
      } catch (e) {
        await logAudit('SYNC.PACKAGE_INVALID', 'sync_queue', entry.file_id, { userId: 'system', userName: 'Sinkronisasi', deviceId: getDeviceId() }, String(e), 'WARNING');
        continue;
      }
      packages++;
      for (const change of pkg.changes) {
        const result = await applyChange(change);
        if (result === 'APPLIED') applied++;
        if (result === 'CONFLICT') conflicts++;
      }
    }
  }
  return { packages, applied, conflicts };
}

export async function syncNow(actor?: Actor): Promise<SyncSummary> {
  if (running) throw new Error('Sinkronisasi sedang berjalan pada perangkat ini.');
  running = true;
  const deviceId = getDeviceId();
  const started = await historyStart('UPLOAD', deviceId);
  try {
    const drive = await getDriveClient();
    await drive.connect(false).catch(() => drive.connect(true));
    const folders = await drive.ensureStructure();
    const pushed = await pushChanges(folders, deviceId);
    await historyFinish(started, 'BERHASIL', pushed.packages, pushed.records, 'Unggah paket berhasil dikonfirmasi Drive');
    const downloadHistory = await historyStart('DOWNLOAD', deviceId);
    const pulled = await pullChanges(folders);
    await historyFinish(downloadHistory, 'BERHASIL', pulled.packages, pulled.applied, `Diterapkan ${pulled.applied} perubahan, ${pulled.conflicts} konflik`);
    await markInitialSyncDone(deviceId);
    await setSetting('last_sync_at', new Date().toISOString());
    await db.device_registry.update(deviceId, { last_sync_at: new Date().toISOString(), sync_status: 'SYNCED' });
    if (actor) await logAudit('SYNC.COMPLETED', 'sync_history', started, actor, `Sinkronisasi selesai: ${pushed.records} dikirim, ${pulled.applied} diterima, ${pulled.conflicts} konflik`, 'INFO');
    return {
      uploadedPackages: pushed.packages, uploadedChanges: pushed.records,
      downloadedPackages: pulled.packages, appliedChanges: pulled.applied, conflicts: pulled.conflicts,
      message: `Sinkronisasi berhasil. ${pushed.records} perubahan dikirim, ${pulled.applied} diterima${pulled.conflicts ? `, ${pulled.conflicts} konflik` : ''}.`
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await historyFinish(started, 'GAGAL', 0, 0, message);
    await logAudit('SYNC.FAILED', 'sync_history', started, actor || { userId: 'system', userName: 'Sinkronisasi', deviceId }, message, 'WARNING');
    throw new Error(message);
  } finally { running = false; }
}

export async function resolveConflict(conflictId: string, resolution: 'LOKAL' | 'REMOTE' | 'GABUNGAN', actor: Actor): Promise<void> {
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict || conflict.resolved_at) throw new Error('Konflik tidak ditemukan atau sudah diselesaikan.');
  const table = tableOf(conflict.entity as EntityName);
  if (resolution === 'REMOTE' || resolution === 'GABUNGAN') {
    const remote = (await restoreValue(JSON.parse(conflict.remote_payload))) as BaseEntity;
    let merged = remote;
    if (resolution === 'GABUNGAN') {
      const local = JSON.parse(conflict.local_payload) as Record<string, unknown>;
      const remoteObj = remote as unknown as Record<string, unknown>;
      const combined: Record<string, unknown> = { ...remoteObj };
      for (const [key, value] of Object.entries(local)) {
        if (['id', 'created_at', 'created_by', 'version', 'device_id'].includes(key)) continue;
        if (value && typeof value === 'object') continue;
        if (value && String(value).trim() && String(value) !== String(remoteObj[key])) combined[`${key}_lokal`] = value;
      }
      merged = combined as unknown as BaseEntity;
    }
    await table.put({ ...merged, id: conflict.record_id, version: Math.max(conflict.local_version, conflict.remote_version) + 1, sync_status: 'PENDING', updated_at: new Date().toISOString(), updated_by: actor.userId });
  }
  await db.sync_conflicts.update(conflictId, { resolved_at: new Date().toISOString(), resolution, resolved_by: actor.userId, sync_status: 'SYNCED' });
  await db.data_versions.put({
    change_id: conflict.remote_change_id, entity: conflict.entity, record_id: conflict.record_id,
    version: conflict.remote_version, applied_at: new Date().toISOString(), device_id: actor.deviceId
  });
  await logAudit('SYNC.CONFLICT_RESOLVED', 'sync_conflicts', conflictId, actor, `Konflik ${conflict.entity} diselesaikan dengan ${resolution}`, 'CRITICAL');
}

export async function pendingChangeCount(): Promise<number> {
  return db.sync_queue.where('sync_status').equals('PENDING').count();
}

export async function unresolvedConflicts(): Promise<number> {
  return (await db.sync_conflicts.toArray()).filter((c) => !c.resolved_at).length;
}

export async function unusedDriveFiles(folders: FolderIds): Promise<DriveFile[]> {
  const drive = await getDriveClient();
  return drive.list(`'${folders.changeLogs}' in parents and trashed=false`, 'files(id,name,modifiedTime)');
}
