import Dexie, { type EntityTable, type Table } from 'dexie';
import { uuid } from '@/lib/crypto';
import type {
  ApplicationSetting, Attachment, AuditLog, BackupHistoryRecord, BaseEntity, DataVersion,
  DeviceRegistry, Disposition, DispositionRecipient, DocumentArchive, IncomingLetter,
  LetterClassification, LetterNumberSequence, LetterTemplate, LetterType, Notification,
  OutgoingLetter, Role, SchoolSettings, SyncConflict, SyncHistoryRecord, Unit, User, ChangeRecord
} from '@/types';

export const DB_NAME = 'sipersurat_local';
export const SCHEMA_VERSION = 3;
export const SCHOOL_SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

export const DEFAULT_LETTER_TYPES: Array<{ name: string; code: string }> = [
  { name: 'Surat Undangan', code: 'UND' },
  { name: 'Surat Tugas', code: 'ST' },
  { name: 'Surat Keterangan', code: 'KET' },
  { name: 'Surat Pengantar', code: 'PGR' },
  { name: 'Surat Permohonan', code: 'MOH' },
  { name: 'Surat Pemberitahuan', code: 'PEM' },
  { name: 'Surat Keputusan', code: 'SK' },
  { name: 'Surat Edaran', code: 'ED' },
  { name: 'Surat Rekomendasi', code: 'REK' },
  { name: 'Surat Balasan', code: 'BAL' },
  { name: 'Surat Perjanjian', code: 'PRJ' },
  { name: 'Surat Lainnya', code: 'LAIN' }
];

const defaultSettings: Record<string, string> = {
  numbering_format: '{SEQ}/{CODE}/{SCHOOL}/{MONTH}/{YEAR}',
  roman_month: '1',
  number_reset_policy: 'TAHUNAN',
  backup_enabled: '1',
  backup_interval_hours: '6',
  backup_retention_local_days: '7',
  backup_retention_hourly_days: '30',
  backup_retention_daily_days: '90',
  backup_retention_monthly_months: '12',
  auto_sync_enabled: '1',
  stale_account_warning_hours: '24',
  last_backup_at: '',
  last_backup_due: '',
  last_sync_at: '',
  drive_root_folder_id: '',
  backup_salt: '',
  backup_passphrase_verifier: '',
  backup_passphrase_iterations: '210000',
  app_version: '1.0.0'
};

function baseMeta(): BaseEntity {
  const t = new Date().toISOString();
  return {
    id: uuid(), created_at: t, updated_at: t, created_by: 'system', updated_by: 'system',
    device_id: 'system', sync_status: 'SYNCED', deleted_at: null, version: 1
  };
}

const v1Stores = {
  users: 'id, username, role, is_active, unit_id, sync_status, updated_at, deleted_at',
  roles: 'id, name, sync_status, deleted_at',
  school_settings: 'id, sync_status, updated_at',
  incoming_letters: 'id, agenda_number, agenda_seq, letter_date, received_date, institution, type_id, status, sync_status, updated_at, deleted_at',
  outgoing_letters: 'id, official_number, letter_date, type_id, status, registration_device_id, published_at, sync_status, updated_at, deleted_at',
  letter_types: 'id, code, name, is_active, sync_status, deleted_at',
  letter_classifications: 'id, code, name, sync_status, deleted_at',
  letter_number_sequences: 'id, type_id, year, last_number, [type_id+year], sync_status, deleted_at',
  dispositions: 'id, letter_id, date, status, giver_id, sync_status, updated_at, deleted_at',
  disposition_recipients: 'id, disposition_id, user_id, status, [disposition_id+user_id], sync_status, deleted_at',
  attachments: 'id, category, owner_id, checksum, sync_status, deleted_at',
  document_archives: 'id, letter_id, letter_kind, archived_at, sync_status, deleted_at',
  letter_templates: 'id, type_id, name, sync_status, deleted_at',
  audit_logs: 'id, at, entity, record_id, actor_id, severity, sync_status',
  notifications: 'id, user_id, read_at, sync_status, created_at',
  sync_queue: 'id, entity, record_id, device_id, sync_status, idempotency_key, timestamp, [sync_status+timestamp]',
  sync_history: 'id, direction, device_id, status, started_at',
  sync_conflicts: 'id, entity, record_id, resolved_at, detected_at',
  device_registry: 'id, status, is_registration_device, last_sync_at, last_seen_at, sync_status',
  backup_history: 'id, device_id, type, status, created_at',
  application_settings: 'id, &key',
  units: 'id, code, name, sync_status, deleted_at',
  data_versions: 'change_id, entity, record_id, applied_at'
};

export class SIPERSURATDB extends Dexie {
  users!: EntityTable<User, 'id'>;
  roles!: EntityTable<Role, 'id'>;
  school_settings!: EntityTable<SchoolSettings, 'id'>;
  incoming_letters!: EntityTable<IncomingLetter, 'id'>;
  outgoing_letters!: EntityTable<OutgoingLetter, 'id'>;
  letter_types!: EntityTable<LetterType, 'id'>;
  letter_classifications!: EntityTable<LetterClassification, 'id'>;
  letter_number_sequences!: EntityTable<LetterNumberSequence, 'id'>;
  dispositions!: EntityTable<Disposition, 'id'>;
  disposition_recipients!: EntityTable<DispositionRecipient, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  document_archives!: EntityTable<DocumentArchive, 'id'>;
  letter_templates!: EntityTable<LetterTemplate, 'id'>;
  audit_logs!: EntityTable<AuditLog, 'id'>;
  notifications!: EntityTable<Notification, 'id'>;
  sync_queue!: EntityTable<ChangeRecord, 'id'>;
  sync_history!: EntityTable<SyncHistoryRecord, 'id'>;
  sync_conflicts!: EntityTable<SyncConflict, 'id'>;
  device_registry!: EntityTable<DeviceRegistry, 'id'>;
  backup_history!: EntityTable<BackupHistoryRecord, 'id'>;
  application_settings!: EntityTable<ApplicationSetting, 'id'>;
  units!: EntityTable<Unit, 'id'>;
  data_versions!: Table<DataVersion, string>;

  constructor() {
    super(DB_NAME);
    const v2Stores = {
      ...v1Stores,
      sync_conflicts: 'id, entity, record_id, resolved_at, detected_at, [entity+record_id]',
      device_registry: 'id, status, is_registration_device, last_sync_at, last_seen_at, registered_at, sync_status'
    };
    this.version(1).stores(v1Stores);
    // Migrasi v2: menambah indeks pencarian konflik dan riwayat perangkat.
    // Tidak ada tabel yang dihapus / dikosongkan pada migrasi.
    this.version(2).stores(v2Stores).upgrade(async (tx) => {
      const settings = tx.table('application_settings');
      for (const [key, value] of Object.entries({ ...defaultSettings, schema_migrated_to: '2' })) {
        const existing = await settings.where('key').equals(key).first();
        if (!existing) await settings.add({ ...baseMeta(), id: uuid(), key, value });
      }
    });
    // Migrasi v3: change_id perlu diindeks agar paket sinkronisasi dapat dicocokkan
    // dengan antrian lokal tanpa memindai seluruh tabel. Data lama tidak diubah.
    this.version(3).stores({
      ...v2Stores,
      sync_queue: 'id, change_id, entity, record_id, device_id, sync_status, idempotency_key, timestamp, [sync_status+timestamp]'
    }).upgrade(async (tx) => {
      const settings = tx.table('application_settings');
      const existing = await settings.where('key').equals('schema_migrated_to').first();
      if (existing) await settings.update(existing.id, { value: '3' });
      else await settings.add({ ...baseMeta(), id: uuid(), key: 'schema_migrated_to', value: '3' });
    });
    this.on('populate', async () => {
      const now = new Date().toISOString();
      await this.roles.bulkAdd([
        { ...baseMeta(), name: 'ADMIN', description: 'Pengelola utama aplikasi', permissions: ['*'] },
        { ...baseMeta(), name: 'TU', description: 'Tata usaha / registrasi surat', permissions: ['letter.create', 'letter.register', 'disposition.manage', 'archive.manage', 'report.view', 'print'] },
        { ...baseMeta(), name: 'GURU', description: 'Guru / pegawai', permissions: ['letter.request', 'disposition.followup', 'print.own'] }
      ]);
      await this.letter_types.bulkAdd(DEFAULT_LETTER_TYPES.map((t) => ({ ...baseMeta(), ...t, description: '', is_active: 1 })));
      await this.letter_classifications.bulkAdd([
        { ...baseMeta(), name: 'Biasa', code: 'B', retention_years: 5, description: '' },
        { ...baseMeta(), name: 'Penting', code: 'P', retention_years: 10, description: '' },
        { ...baseMeta(), name: 'Rahasia', code: 'R', retention_years: 20, description: '' },
        { ...baseMeta(), name: 'Sangat Rahasia', code: 'SR', retention_years: 30, description: '' }
      ]);
      await this.units.bulkAdd([
        { ...baseMeta(), name: 'Tata Usaha', code: 'TU' },
        { ...baseMeta(), name: 'Kurikulum', code: 'KUR' },
        { ...baseMeta(), name: 'Kesiswaan', code: 'KES' },
        { ...baseMeta(), name: 'Sarana dan Prasarana', code: 'SAPRAS' }
      ]);
      await this.school_settings.add({
        ...baseMeta(), id: SCHOOL_SETTINGS_ID,
        npsn: '', name: 'SMKN 6 Muaro Jambi', abbreviation: 'SMKN6-MJ',
        address: '', city: 'Muaro Jambi', phone: '', email: '', website: '',
        school_code: 'SMKN6-MJ', headmaster: '', headmaster_nip: '',
        logo_attachment_id: '', letter_footer: ''
      });
      await this.application_settings.bulkAdd(Object.entries(defaultSettings).map(([key, value]) => ({ ...baseMeta(), id: uuid(), key, value })));
      // Template dasar
      await this.letter_templates.bulkAdd(DEFAULT_LETTER_TYPES.slice(0, 9).map((t) => ({
        ...baseMeta(), name: t.name, type_id: '', content: defaultTemplateContent(), description: 'Template bawaan SIPERSURAT'
      })));
      void now;
    });
  }
}

export function defaultTemplateContent(): string {
  return `<p>{PARAGRAPH_1}</p><p>{PARAGRAPH_2}</p><p>Demikian surat ini kami sampaikan, atas perhatian dan kerja samanya kami ucapkan terima kasih.</p>`;
}

export const db = new SIPERSURATDB();

/** Meminta penyimpanan persisten agar IndexedDB tidak dibuang saat tekanan storage. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* browser tidak mendukung */ }
  return false;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; percent: number }> {
  try {
    const e = await navigator.storage?.estimate();
    const usage = e?.usage ?? 0;
    const quota = e?.quota ?? 0;
    return { usage, quota, percent: quota ? (usage / quota) * 100 : 0 };
  } catch {
    return { usage: 0, quota: 0, percent: 0 };
  }
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await db.application_settings.where('key').equals(key).first();
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const row = await db.application_settings.where('key').equals(key).first();
  if (row) await db.application_settings.update(row.id, { value, updated_at: new Date().toISOString(), version: row.version + 1 });
  else await db.application_settings.add({ ...baseMeta(), id: uuid(), key, value });
}
