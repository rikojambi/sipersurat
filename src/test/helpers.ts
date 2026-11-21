import { db, SCHOOL_SETTINGS_ID, setSetting } from '@/db/schema';
import type { Actor } from '@/db/repository';
import type { DeviceRegistry, IncomingLetter, LetterType, OutgoingLetter, SchoolSettings } from '@/types';

export const TEST_ACTOR: Actor = { userId: 'u1', userName: 'Uji', deviceId: 'device-test-1' };
export const REGISTRATION_ACTOR: Actor = { userId: 'tu1', userName: 'TU Uji', deviceId: 'device-registrasi' };

/** Dataset minimal deterministik untuk pengujian tanpa bergantung pada ID auto-seed. */
export async function seedIfNeeded() {
  const t = new Date().toISOString();
  const meta = {
    created_at: t, updated_at: t, created_by: 'test', updated_by: 'test',
    device_id: 'device-test-1', sync_status: 'PENDING' as const, deleted_at: null, version: 1
  };
  if (!(await db.school_settings.get(SCHOOL_SETTINGS_ID))) {
    await db.school_settings.put({
      ...meta, id: SCHOOL_SETTINGS_ID, npsn: '123', name: 'SMKN 6 Muaro Jambi', abbreviation: 'SMKN6-MJ',
      address: 'Muaro Jambi', city: 'Muaro Jambi', phone: '', email: '', website: '', school_code: 'SMKN6-MJ',
      headmaster: 'Drs. H. Contoh', headmaster_nip: '19700101 200001 1 001', logo_attachment_id: '', letter_footer: ''
    });
  }
  await db.letter_types.put({ ...meta, id: 'type-undangan', name: 'Surat Undangan', code: 'UND', description: '', is_active: 1 });
  await db.letter_classifications.put({ ...meta, id: 'class-biasa', name: 'Biasa', code: 'B', retention_years: 5, description: '' });
}

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
  await seedIfNeeded();
}

export async function registerDevice(deviceId: string, overrides: Partial<DeviceRegistry> = {}): Promise<DeviceRegistry> {
  const t = new Date().toISOString();
  const device: DeviceRegistry = {
    id: deviceId, name: 'Perangkat Registrasi', type: 'WINDOWS', last_user_id: 'tu1',
    registered_at: t, last_sync_at: t, status: 'ACTIVE', app_version: '1.0.0',
    is_registration_device: 1, activation_code_hash: '', activation_expires_at: null,
    initial_sync_done: 1, last_seen_at: t, created_at: t, updated_at: t, created_by: 'test',
    updated_by: 'test', device_id: deviceId, sync_status: 'SYNCED', deleted_at: null, version: 1,
    ...overrides
  };
  device.id = deviceId;
  device.device_id = deviceId;
  await db.device_registry.put(device);
  await setSetting('registration_device_id', deviceId);
  return device;
}

export function school(overrides: Partial<SchoolSettings> = {}): SchoolSettings {
  return {
    id: SCHOOL_SETTINGS_ID, npsn: '123', name: 'SMKN 6 Muaro Jambi', abbreviation: 'SMKN6-MJ',
    address: 'Muaro Jambi', city: 'Muaro Jambi', phone: '', email: '', website: '', school_code: 'SMKN6-MJ',
    headmaster: 'Drs. H. Contoh', headmaster_nip: '19700101 200001 1 001', logo_attachment_id: '', letter_footer: '',
    created_at: '', updated_at: '', created_by: '', updated_by: '', device_id: '',
    sync_status: 'SYNCED', deleted_at: null, version: 1,
    ...overrides
  };
}

export function letterType(overrides: Partial<LetterType> = {}): LetterType {
  return {
    id: 'type-undangan', name: 'Surat Undangan', code: 'UND', description: '', is_active: 1,
    created_at: '', updated_at: '', created_by: '', updated_by: '', device_id: '',
    sync_status: 'SYNCED', deleted_at: null, version: 1,
    ...overrides
  };
}

export function outgoingLetter(overrides: Partial<OutgoingLetter> = {}): OutgoingLetter {
  return {
    id: 'surat-keluar-1', official_number: null, published_at: null, published_by: null,
    registration_device_id: null, canceled_at: null, cancellation_reason: '',
    letter_date: '2026-11-21', type_id: 'type-undangan', classification_id: 'class-biasa',
    destination: 'Dinas Pendidikan', institution: 'Dinas Pendidikan', subject: 'Undangan rapat',
    body: '<p>{PARAGRAPH_1}</p><p>Hadir tepat waktu.</p>', signer: 'Drs. H. Contoh',
    signer_position: 'Kepala Sekolah', attachment_ids: [], final_file_id: '', status: 'DIAJUKAN',
    requested_by: 'tu1', reviewed_by: '',
    created_at: '', updated_at: '', created_by: '', updated_by: '', device_id: '',
    sync_status: 'SYNCED', deleted_at: null, version: 1,
    ...overrides
  };
}

export function incomingLetter(overrides: Partial<IncomingLetter> = {}): IncomingLetter {
  return {
    id: 'surat-masuk-1', agenda_number: '001/AGD/2026', agenda_seq: 1, sender_number: '123/A/2026',
    letter_date: '2026-11-20', received_date: '2026-11-21', sender: 'Dinas Pendidikan',
    institution: 'Dinas Pendidikan', subject: 'Undangan koordinasi', type_id: 'type-undangan',
    classification_id: 'class-biasa', nature: 'BIASA', destination: 'Tata Usaha', unit_id: '',
    summary: 'Undangan koordinasi program', attachment_ids: [], received_by: 'tu1', status: 'DITERIMA',
    created_at: '', updated_at: '', created_by: '', updated_by: '', device_id: '',
    sync_status: 'SYNCED', deleted_at: null, version: 1,
    ...overrides
  };
}
