import JSZip from 'jszip';
import { db, getSetting, setSetting, SCHEMA_VERSION } from '@/db/schema';
import { deriveBackupKey, decryptText, encryptText, randomBytes, bytesToBase64, sha256Hex, uuid, blobToBase64, base64ToBlob, type EncryptedPayload } from '@/lib/crypto';
import { getDeviceId, APP_VERSION } from '@/lib/device';
import { getDriveClient, type FolderIds } from '@/lib/drive';
import { logAudit, type Actor } from '@/db/repository';
import type { Attachment, BackupHistoryRecord } from '@/types';

const BACKUP_TABLES = [
  'users', 'roles', 'school_settings', 'incoming_letters', 'outgoing_letters', 'letter_types',
  'letter_classifications', 'letter_number_sequences', 'dispositions', 'disposition_recipients',
  'attachments', 'document_archives', 'letter_templates', 'audit_logs', 'notifications',
  'sync_queue', 'sync_history', 'sync_conflicts', 'device_registry', 'backup_history',
  'application_settings', 'units', 'data_versions'
] as const;

let passphraseInMemory = '';

export function setBackupPassphrase(passphrase: string): void { passphraseInMemory = passphrase; }
export function hasBackupPassphrase(): boolean { return !!passphraseInMemory; }
export function clearBackupPassphrase(): void { passphraseInMemory = ''; }

export async function configureBackupPassphrase(passphrase: string): Promise<void> {
  if (passphrase.length < 10) throw new Error('Passphrase backup minimal 10 karakter.');
  const salt = bytesToBase64(randomBytes(16));
  const key = await deriveBackupKey(passphrase, salt);
  const verifier = await encryptText(key, 'SIPERSURAT_BACKUP_VERIFIER_V1');
  await setSetting('backup_salt', salt);
  await setSetting('backup_passphrase_verifier', JSON.stringify(verifier));
  await setSetting('backup_passphrase_iterations', '210000');
  passphraseInMemory = passphrase;
}

export async function verifyBackupPassphrase(passphrase: string): Promise<boolean> {
  const salt = await getSetting('backup_salt');
  const verifier = await getSetting('backup_passphrase_verifier');
  if (!salt || !verifier) return false;
  try {
    const key = await deriveBackupKey(passphrase, salt, Number(await getSetting('backup_passphrase_iterations', '210000')));
    return (await decryptText(key, JSON.parse(verifier) as EncryptedPayload)) === 'SIPERSURAT_BACKUP_VERIFIER_V1';
  } catch { return false; }
}

async function requireKey() {
  if (!passphraseInMemory) throw new Error('Passphrase backup belum dimasukkan pada sesi ini.');
  const salt = await getSetting('backup_salt');
  if (!salt) throw new Error('Passphrase backup belum dikonfigurasi admin.');
  return deriveBackupKey(passphraseInMemory, salt, Number(await getSetting('backup_passphrase_iterations', '210000')));
}

export interface BackupInfo {
  backup_id: string;
  device_id: string;
  device_name: string;
  user_name: string;
  created_at: string;
  app_version: string;
  schema_version: number;
  type: 'HOURLY' | 'DAILY' | 'MONTHLY' | 'MANUAL';
  record_count: number;
  document_count: number;
  encrypted: boolean;
  encryption: string;
}

export interface CreatedBackup { blob: Blob; info: BackupInfo; checksum: string; fileName: string }

export async function createBackup(type: BackupInfo['type'], actor: Actor, deviceName = 'Perangkat'): Promise<CreatedBackup> {
  const key = await requireKey();
  const tables: Record<string, unknown[]> = {};
  let recordCount = 0;
  for (const table of BACKUP_TABLES) {
    const rows = await (db[table] as unknown as { toArray(): Promise<unknown[]> }).toArray();
    tables[table] = rows;
    recordCount += rows.length;
  }
  // Password hash/salt tetap disimpan (hash, bukan password asli), token OAuth tidak pernah masuk backup.
  const databaseJson = JSON.stringify({ schema_version: SCHEMA_VERSION, exported_at: new Date().toISOString(), tables });
  const encrypted = await encryptText(key, databaseJson);
  const salt = await getSetting('backup_salt');

  const zip = new JSZip();
  zip.file('database/sipersurat.json.enc', JSON.stringify(encrypted));
  zip.file('metadata/encryption.json', JSON.stringify({ algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', salt, iterations: Number(await getSetting('backup_passphrase_iterations', '210000')) }));

  const attachments = (tables.attachments || []) as Attachment[];
  let documentCount = 0;
  const folders: Record<string, string> = {
    'SURAT_MASUK': 'storage/surat-masuk/', 'SURAT_KELUAR': 'storage/surat-keluar/',
    'LAMPIRAN': 'storage/lampiran/', 'TEMPLATE': 'storage/templates/', 'LOGO': 'storage/templates/'
  };
  for (const att of attachments) {
    if (!(att.blob instanceof Blob)) continue;
    const safeName = att.name.replace(/[^\w.-]/g, '_');
    zip.file(`${folders[att.category] || 'storage/lampiran/'}${att.id}_${safeName}`, await blobToBase64(att.blob), { base64: true });
    documentCount++;
  }
  // sync_queue / data_versions / sync_history sudah termasuk dalam database terenkripsi.
  // Jangan menulis salinan plaintext di ZIP karena payload dapat berisi lampiran dan data sensitif.

  const info: BackupInfo = {
    backup_id: uuid(), device_id: getDeviceId(), device_name: deviceName,
    user_name: actor.userName, created_at: new Date().toISOString(), app_version: APP_VERSION,
    schema_version: SCHEMA_VERSION, type, record_count: recordCount, document_count: documentCount,
    encrypted: true, encryption: 'AES-256-GCM / PBKDF2-SHA256'
  };
  zip.file('metadata/backup-info.json', JSON.stringify(info, null, 2));

  // Checksum bagian dalam untuk setiap entry, memungkinkan verifikasi per-file saat restore.
  const hashes: Record<string, string> = {};
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    hashes[path] = await sha256Hex(await entry.async('arraybuffer'));
  }
  zip.file('metadata/checksum.sha256', JSON.stringify(hashes, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  // Checksum arsip final disimpan di metadata backup_history dan dijamin oleh Google Drive.
  const checksum = await sha256Hex(await blob.arrayBuffer());
  const stamp = new Date().toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '');
  const fileName = `SIPERSURAT_BACKUP_${deviceName.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}_${stamp}.zip`;
  return { blob, info, checksum, fileName };
}

export interface BackupPreview { info: BackupInfo; counts: Record<string, number>; schemaVersion: number; valid: boolean; warnings: string[] }

export async function inspectBackup(blob: Blob, passphrase?: string): Promise<{ preview: BackupPreview; tables: Record<string, unknown[]>; attachments: Array<{ path: string; attachmentId: string; blob: Blob }> }> {
  const zip = await JSZip.loadAsync(blob);
  const hashes = JSON.parse(await zip.file('metadata/checksum.sha256')!.async('string')) as Record<string, string>;
  const warnings: string[] = [];
  for (const [path, hash] of Object.entries(hashes)) {
    const entry = zip.file(path);
    if (!entry) { warnings.push(`File hilang: ${path}`); continue; }
    const actual = await sha256Hex(await entry.async('arraybuffer'));
    if (actual !== hash) throw new Error(`Checksum tidak cocok pada ${path}. Backup mungkin rusak.`);
  }
  const info = JSON.parse(await zip.file('metadata/backup-info.json')!.async('string')) as BackupInfo;
  const encryption = JSON.parse(await zip.file('metadata/encryption.json')!.async('string')) as { salt: string; iterations: number };
  const enc = JSON.parse(await zip.file('database/sipersurat.json.enc')!.async('string')) as EncryptedPayload;
  const key = await deriveBackupKey(passphrase || passphraseInMemory, encryption.salt, encryption.iterations);
  const dbJson = await decryptText(key, enc);
  const parsed = JSON.parse(dbJson) as { schema_version: number; tables: Record<string, unknown[]> };
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(parsed.tables)) counts[name] = rows.length;
  if (parsed.schema_version > SCHEMA_VERSION) warnings.push(`Backup berasal dari skema lebih baru (${parsed.schema_version}). Perlu migrasi aplikasi.`);
  const attachments: Array<{ path: string; attachmentId: string; blob: Blob }> = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.startsWith('storage/')) continue;
    const fileName = entry.name.split('/').pop() || '';
    const attachmentId = fileName.split('_')[0] || '';
    if (!attachmentId) continue;
    attachments.push({ path: entry.name, attachmentId, blob: await base64ToBlob(await entry.async('base64')) });
  }
  // Blob tidak bisa diserialisasi JSON. Kembalikan isi file storage ke record attachment
  // yang sesuai sebelum dipakai restore, termasuk MIME aslinya.
  const attachmentRows = (parsed.tables.attachments || []) as Array<Record<string, unknown>>;
  const attachmentById = new Map(attachmentRows.map((row) => [String(row.id), row]));
  for (const file of attachments) {
    const row = attachmentById.get(file.attachmentId);
    if (!row) continue;
    row.blob = new Blob([file.blob], { type: String(row.mime || file.blob.type || 'application/octet-stream') });
  }
  return { preview: { info, counts, schemaVersion: parsed.schema_version, valid: warnings.length === 0, warnings }, tables: parsed.tables, attachments };
}

export async function uploadBackup(created: CreatedBackup, folders: FolderIds, actor: Actor): Promise<BackupHistoryRecord> {
  const drive = await getDriveClient();
  const folderByType: Record<BackupInfo['type'], string> = {
    HOURLY: folders.hourly, DAILY: folders.daily, MONTHLY: folders.monthly, MANUAL: folders.backup
  };
  const file = await drive.uploadBlob(folderByType[created.info.type], created.fileName, created.blob);
  const downloaded = await drive.download(file.id);
  const verified = await sha256Hex(await downloaded.arrayBuffer()) === created.checksum;
  const t = new Date().toISOString();
  const record: BackupHistoryRecord = {
    id: uuid(), device_id: created.info.device_id, device_name: created.info.device_name,
    user_name: created.info.user_name, type: created.info.type, file_name: created.fileName,
    drive_file_id: file.id, size: created.blob.size, checksum: created.checksum,
    status: verified ? 'BERHASIL' : 'GAGAL', record_count: created.info.record_count,
    document_count: created.info.document_count, schema_version: created.info.schema_version,
    app_version: created.info.app_version, encrypted: 1, message: verified ? 'Terverifikasi oleh Google Drive' : 'Checksum tidak cocok setelah unggah',
    created_at: t, updated_at: t, created_by: actor.userId, updated_by: actor.userId,
    sync_status: verified ? 'SYNCED' : 'FAILED', deleted_at: null, version: 1
  };
  await db.backup_history.add(record);
  await setSetting('last_backup_at', new Date().toISOString());
  await logAudit('BACKUP.CREATED', 'backup_history', record.id, actor, `Backup ${created.info.type} ${created.fileName} ${verified ? 'terverifikasi' : 'GAGAL'}`, verified ? 'INFO' : 'WARNING');
  if (!verified) throw new Error('Backup gagal diverifikasi setelah unggah.');
  return record;
}

/** Backup lokal darurat sebelum restore disimpan sebagai attachment khusus. */
export async function localSafetyBackup(actor: Actor): Promise<Attachment> {
  const created = await createBackup('MANUAL', actor);
  const attachment: Attachment = {
    id: uuid(), name: `PRE_RESTORE_${created.fileName}`, mime: 'application/zip', size: created.blob.size,
    checksum: created.checksum, category: 'LAMPIRAN', owner_id: 'LOCAL_SAFETY_BACKUP', blob: created.blob,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: actor.userId,
    updated_by: actor.userId, device_id: actor.deviceId, sync_status: 'PENDING', deleted_at: null, version: 1
  };
  await db.attachments.add(attachment);
  return attachment;
}

export async function restoreBackup(blob: Blob, passphrase: string, actor: Actor, mode: 'DEVICE' | 'MIGRATION'): Promise<Record<string, number>> {
  const { preview, tables } = await inspectBackup(blob, passphrase);
  if (!preview.valid) throw new Error(`Backup tidak valid: ${preview.warnings.join('; ')}`);
  // Passphrase restore juga dipakai untuk membuat salinan darurat, tanpa ditulis ke storage.
  passphraseInMemory = passphrase;
  // Salinan darurat dibuat sebelum transaksi. Jika transaksi gagal, salinan ini tetap ada;
  // jika berhasil, salinan dipasang kembali setelah integritas restore diverifikasi.
  const safety = await localSafetyBackup(actor);
  await db.transaction('rw', BACKUP_TABLES.map((t) => db[t as keyof typeof db]) as never[], async () => {
    for (const table of BACKUP_TABLES) {
      const target = db[table] as unknown as { clear(): Promise<void>; bulkPut(rows: unknown[]): Promise<void> };
      await target.clear();
      const rows = (tables[table] || []) as Array<Record<string, unknown>>;
      if (rows.length) await target.bulkPut(rows);
    }
  });
  const verify: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    verify[table] = await (db[table] as unknown as { count(): Promise<number> }).count();
    if (verify[table] !== (tables[table] || []).length) throw new Error(`Integritas restore gagal pada tabel ${table}.`);
  }
  await db.attachments.put(safety);
  await setSetting('last_restore_at', new Date().toISOString());
  await setSetting('restore_mode', mode);
  await logAudit('RESTORE.COMPLETED', 'application_settings', preview.info.backup_id, actor, `Restore ${mode} dari backup ${preview.info.backup_id} (${preview.info.record_count} record)`, 'CRITICAL');
  return verify;
}

/** Slot WIB: 00.00, 06.00, 12.00, 18.00 (Asia/Jakarta = UTC+7 tanpa DST). */
export function backupSlotsWIB(date = new Date()): Date[] {
  const wib = new Date(date.getTime() + 7 * 3600_000);
  return [0, 6, 12, 18].map((hour) => {
    const d = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), hour, 0, 0));
    return new Date(d.getTime() - 7 * 3600_000);
  });
}

export function isBackupDue(lastBackupAt: string, now = new Date()): { due: boolean; slot: Date } {
  const slots = backupSlotsWIB(now);
  const currentSlot = [...slots].reverse().find((s) => s.getTime() <= now.getTime()) || slots[0]!;
  const last = lastBackupAt ? new Date(lastBackupAt).getTime() : 0;
  return { due: !last || last < currentSlot.getTime(), slot: currentSlot };
}

let backupRunning = false;
export async function runBackupIfDue(actor: Actor, deviceName: string): Promise<{ ran: boolean; message: string }> {
  if (backupRunning) return { ran: false, message: 'Proses backup sedang berjalan.' };
  if ((await getSetting('backup_enabled', '1')) !== '1') return { ran: false, message: 'Backup otomatis dinonaktifkan.' };
  if (!hasBackupPassphrase()) return { ran: false, message: 'Backup tertunda: passphrase belum dimasukkan pada sesi ini.' };
  const last = await getSetting('last_backup_at', '');
  const due = isBackupDue(last);
  if (!due.due) return { ran: false, message: 'Backup masih dalam jadwal.' };
  backupRunning = true;
  try {
    const created = await createBackup('HOURLY', actor, deviceName);
    const drive = await getDriveClient();
    await drive.connect(false).catch(() => drive.connect(true));
    const folders = await drive.ensureStructure();
    await uploadBackup(created, folders, actor);
    await setSetting('last_backup_due', '');
    return { ran: true, message: `Backup tertunda pukul ${due.slot.toISOString()} berhasil dijalankan.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setSetting('last_backup_due', due.slot.toISOString());
    await logAudit('BACKUP.FAILED', 'backup_history', getDeviceId(), actor, message, 'WARNING');
    throw new Error(message);
  } finally { backupRunning = false; }
}

export async function applyRetention(actor: Actor): Promise<number> {
  const settings: Record<string, number> = {
    HOURLY: Number(await getSetting('backup_retention_hourly_days', '30')),
    DAILY: Number(await getSetting('backup_retention_daily_days', '90')),
    MONTHLY: Number(await getSetting('backup_retention_monthly_months', '12')) * 30,
    MANUAL: Number(await getSetting('backup_retention_local_days', '7'))
  };
  const drive = await getDriveClient();
  const rows = await db.backup_history.toArray();
  let deleted = 0;
  for (const row of rows) {
    if (row.status !== 'BERHASIL') continue;
    const newerExists = rows.some((r) => r.status === 'BERHASIL' && r.type === row.type && new Date(r.created_at) > new Date(row.created_at));
    if (!newerExists) continue;
    const ageDays = (Date.now() - new Date(row.created_at).getTime()) / 86_400_000;
    if (ageDays > (settings[row.type] || 30)) {
      try { await drive.remove(row.drive_file_id); await db.backup_history.delete(row.id); deleted++; }
      catch { /* biarkan backup lama jika penghapusan gagal */ }
    }
  }
  if (deleted) await logAudit('BACKUP.RETENTION', 'backup_history', 'retention', actor, `${deleted} backup lama dihapus setelah backup baru terverifikasi`, 'INFO');
  return deleted;
}
