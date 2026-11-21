export type RoleName = 'ADMIN' | 'TU' | 'GURU';
export type SyncStatus = 'PENDING' | 'UPLOADED' | 'SYNCED' | 'CONFLICT' | 'FAILED';
export type Operation = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL';

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  device_id: string;
  sync_status: SyncStatus;
  deleted_at: string | null;
  version: number;
}

export interface User extends BaseEntity {
  username: string;
  display_name: string;
  role: RoleName;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  is_active: number;
  nip: string;
  email: string;
  unit_id: string;
  last_login_at: string | null;
}

export interface Role extends BaseEntity {
  name: RoleName;
  permissions: string[];
  description: string;
}

export interface SchoolSettings extends BaseEntity {
  npsn: string;
  name: string;
  abbreviation: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  school_code: string;
  headmaster: string;
  headmaster_nip: string;
  logo_attachment_id: string;
  letter_footer: string;
}

export interface IncomingLetter extends BaseEntity {
  agenda_number: string;
  agenda_seq: number;
  sender_number: string;
  letter_date: string;
  received_date: string;
  sender: string;
  institution: string;
  subject: string;
  type_id: string;
  classification_id: string;
  nature: 'BIASA' | 'PENTING' | 'RAHASIA' | 'SANGAT_RAHASIA';
  destination: string;
  unit_id: string;
  summary: string;
  attachment_ids: string[];
  received_by: string;
  status: 'DITERIMA' | 'DIDISPOSISI' | 'DITINDAKLANJUTI' | 'SELESAI' | 'DIARSIPKAN';
}

export type OfficialStatus =
  | 'DRAFT' | 'DIAJUKAN' | 'PEMERIKSAAN' | 'REVISI' | 'DISETUJUI'
  | 'TERDAFTAR' | 'DITANDATANGANI' | 'DIKIRIM' | 'SELESAI' | 'DIBATALKAN';

export interface OutgoingLetter extends BaseEntity {
  official_number: string | null;
  published_at: string | null;
  published_by: string | null;
  registration_device_id: string | null;
  canceled_at: string | null;
  cancellation_reason: string;
  letter_date: string;
  type_id: string;
  classification_id: string;
  destination: string;
  institution: string;
  subject: string;
  body: string;
  signer: string;
  signer_position: string;
  attachment_ids: string[];
  final_file_id: string;
  status: OfficialStatus;
  requested_by: string;
  reviewed_by: string;
}

export interface LetterType extends BaseEntity {
  name: string;
  code: string;
  description: string;
  is_active: number;
}

export interface LetterClassification extends BaseEntity {
  name: string;
  code: string;
  retention_years: number;
  description: string;
}

export interface LetterNumberSequence extends BaseEntity {
  type_id: string;
  year: number;
  last_number: number;
  policy_reset: 'TAHUNAN' | 'BULANAN' | 'TIDAK_PERNAH';
  start_number: number;
}

export interface Disposition extends BaseEntity {
  number: string;
  letter_id: string;
  date: string;
  giver_id: string;
  instruction_type: 'DIKETAHUI' | 'DITINDAKLANJUTI' | 'DIPELAJARI' | 'DIKOORDINASIKAN' | 'DILAKSANAKAN' | 'DIARSIPKAN';
  instructions: string;
  due_date: string;
  notes: string;
  status: 'MENUNGGU' | 'DIPROSES' | 'SELESAI' | 'DITUNDA';
}

export interface DispositionRecipient extends BaseEntity {
  disposition_id: string;
  user_id: string;
  status: 'MENUNGGU' | 'DIPROSES' | 'SELESAI' | 'DITUNDA';
  follow_up: string;
  follow_up_at: string | null;
}

export interface Attachment extends BaseEntity {
  name: string;
  mime: string;
  size: number;
  checksum: string;
  category: 'SURAT_MASUK' | 'SURAT_KELUAR' | 'LAMPIRAN' | 'TEMPLATE' | 'LOGO';
  owner_id: string;
  blob: Blob;
}

export interface DocumentArchive extends BaseEntity {
  letter_id: string;
  letter_kind: 'SURAT_MASUK' | 'SURAT_KELUAR';
  archive_number: string;
  archived_at: string;
  location: string;
  retention_years: number;
  notes: string;
}

export interface LetterTemplate extends BaseEntity {
  name: string;
  type_id: string;
  content: string;
  description: string;
}

export interface AuditLog extends BaseEntity {
  action: string;
  entity: string;
  record_id: string;
  actor_id: string;
  actor_name: string;
  details: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  at: string;
}

export interface Notification extends BaseEntity {
  user_id: string;
  title: string;
  message: string;
  link: string;
  type: 'INFO' | 'DISPOSISI' | 'SINKRONISASI' | 'BACKUP' | 'PENTING';
  read_at: string | null;
}

export interface ChangeRecord {
  id: string;
  change_id: string;
  entity: string;
  record_id: string;
  operation: Operation;
  device_id: string;
  user_id: string;
  timestamp: string;
  version: number;
  payload: string;
  checksum: string;
  sync_status: SyncStatus;
  attempts: number;
  idempotency_key: string;
  error: string;
}

export interface SyncHistoryRecord extends BaseEntity {
  direction: 'UPLOAD' | 'DOWNLOAD';
  device_id: string;
  packages: number;
  records: number;
  started_at: string;
  finished_at: string | null;
  status: 'BERHASIL' | 'GAGAL' | 'BERJALAN';
  message: string;
  checksum: string;
}

export interface SyncConflict extends BaseEntity {
  entity: string;
  record_id: string;
  local_payload: string;
  remote_payload: string;
  local_version: number;
  remote_version: number;
  remote_change_id: string;
  detected_at: string;
  resolved_at: string | null;
  resolution: 'LOKAL' | 'REMOTE' | 'GABUNGAN' | null;
  resolved_by: string;
}

export type DeviceStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REVOKED';

export interface DeviceRegistry extends BaseEntity {
  name: string;
  type: 'ANDROID' | 'TABLET' | 'WINDOWS' | 'BROWSER';
  last_user_id: string;
  registered_at: string;
  last_sync_at: string | null;
  status: DeviceStatus;
  app_version: string;
  is_registration_device: number;
  activation_code_hash: string;
  activation_expires_at: string | null;
  initial_sync_done: number;
  last_seen_at: string;
}

export interface BackupHistoryRecord extends BaseEntity {
  device_id: string;
  device_name: string;
  user_name: string;
  type: 'HOURLY' | 'DAILY' | 'MONTHLY' | 'MANUAL';
  file_name: string;
  drive_file_id: string;
  size: number;
  checksum: string;
  status: 'BERHASIL' | 'MENUNGGU' | 'TERTUNDA' | 'GAGAL' | 'KONFLIK' | 'BELUM_PERNAH';
  record_count: number;
  document_count: number;
  schema_version: number;
  app_version: string;
  encrypted: number;
  message: string;
}

export interface ApplicationSetting extends BaseEntity {
  key: string;
  value: string;
}

export interface Unit extends BaseEntity {
  name: string;
  code: string;
}

export interface DataVersion {
  change_id: string;
  entity: string;
  record_id: string;
  version: number;
  applied_at: string;
  device_id: string;
}

export interface DriveConfig {
  clientId: string;
  scopes: string;
  pickerApiKey: string;
  rootFolderId: string;
  connected: boolean;
}

export type EntityName = keyof DBTables;

export interface DBTables {
  users: User;
  roles: Role;
  school_settings: SchoolSettings;
  incoming_letters: IncomingLetter;
  outgoing_letters: OutgoingLetter;
  letter_types: LetterType;
  letter_classifications: LetterClassification;
  letter_number_sequences: LetterNumberSequence;
  dispositions: Disposition;
  disposition_recipients: DispositionRecipient;
  attachments: Attachment;
  document_archives: DocumentArchive;
  letter_templates: LetterTemplate;
  audit_logs: AuditLog;
  notifications: Notification;
  sync_queue: ChangeRecord;
  sync_history: SyncHistoryRecord;
  sync_conflicts: SyncConflict;
  device_registry: DeviceRegistry;
  backup_history: BackupHistoryRecord;
  application_settings: ApplicationSetting;
  units: Unit;
  data_versions: DataVersion;
}
