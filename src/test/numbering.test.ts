import { beforeEach, describe, expect, it } from 'vitest';
import { db, setSetting } from '@/db/schema';
import { createRecord, type Actor } from '@/db/repository';
import { backupSlotsWIB, isBackupDue } from '@/lib/backup';
import { cancelOfficialNumber, checkNumberingGate, formatOfficialNumber, knownOfficialNumbers, publishOfficialNumber, romanMonth } from '@/lib/numbering';
import { seedIfNeeded } from './helpers';
import type { DeviceRegistry, LetterType, OutgoingLetter, SchoolSettings } from '@/types';

const actor: Actor = { userId: 'tu1', userName: 'TU Uji', deviceId: 'device-registrasi' };

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded();
  localStorage.setItem('sipersurat_device_id', actor.deviceId);
  const t = new Date().toISOString();
  const device: DeviceRegistry = {
    id: actor.deviceId, name: 'Perangkat Registrasi', type: 'WINDOWS', last_user_id: 'tu1',
    registered_at: t, last_sync_at: t, status: 'ACTIVE', app_version: '1.0.0',
    is_registration_device: 1, activation_code_hash: '', activation_expires_at: null,
    initial_sync_done: 1, last_seen_at: t, created_at: t, updated_at: t, created_by: 'test',
    updated_by: 'test', device_id: actor.deviceId, sync_status: 'SYNCED', deleted_at: null, version: 1
  };
  await db.device_registry.add(device);
  await setSetting('registration_device_id', actor.deviceId);
});

const type = (): LetterType => ({ id: 'type-undangan', name: 'Surat Undangan', code: 'UND', description: '', is_active: 1, created_at: '', updated_at: '', created_by: '', updated_by: '', device_id: '', sync_status: 'SYNCED', deleted_at: null, version: 1 });
const school = (): SchoolSettings => ({ id: 'x', npsn: '', name: 'SMKN 6 Muaro Jambi', abbreviation: 'SMKN6-MJ', address: '', city: '', phone: '', email: '', website: '', school_code: 'SMKN6-MJ', headmaster: '', headmaster_nip: '', logo_attachment_id: '', letter_footer: '', created_at: '', updated_at: '', created_by: '', updated_by: '', device_id: '', sync_status: 'SYNCED', deleted_at: null, version: 1 });

describe('penomoran surat resmi SINGLE WRITER', () => {
  it('format bulan Romawi dan format nomor sesuai konfigurasi', async () => {
    expect(romanMonth('2026-11-21')).toBe('XI');
    expect(romanMonth('2026-01-01')).toBe('I');
    expect(await formatOfficialNumber(1, type(), school(), '2026-11-21')).toBe('001/UND/SMKN6-MJ/XI/2026');
  });

  it('memblokir penerbitan bila perangkat bukan registrasi resmi', async () => {
    await setSetting('registration_device_id', 'perangkat-lain');
    const gate = await checkNumberingGate();
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('bukan perangkat registrasi');
  });

  it('menerbitkan nomor berurutan, tidak duplikat, dan tidak memakai ulang nomor dibatalkan', async () => {
    expect((await checkNumberingGate()).allowed).toBe(true);
    const makeLetter = () => createRecord<OutgoingLetter>('outgoing_letters', {
      official_number: null, letter_date: '2026-11-21', type_id: 'type-undangan', classification_id: 'class-biasa',
      destination: 'Dinas Pendidikan', institution: 'Dinas Pendidikan', subject: 'Undangan', body: 'Isi surat', signer: 'Kepala Sekolah',
      signer_position: 'Kepala Sekolah', attachment_ids: [], final_file_id: '', status: 'DIAJUKAN', requested_by: 'tu1',
      reviewed_by: '', published_at: null, published_by: null, registration_device_id: null, canceled_at: null, cancellation_reason: ''
    }, actor);

    const a = await makeLetter();
    const first = await publishOfficialNumber(a.id, actor);
    expect(first.number).toBe('001/UND/SMKN6-MJ/XI/2026');
    const b = await makeLetter();
    const second = await publishOfficialNumber(b.id, actor);
    expect(second.number).toBe('002/UND/SMKN6-MJ/XI/2026');
    expect((await knownOfficialNumbers()).size).toBe(2);

    await cancelOfficialNumber(b.id, 'Duplikat data', actor);
    const c = await makeLetter();
    const third = await publishOfficialNumber(c.id, actor);
    expect(third.number).toBe('003/UND/SMKN6-MJ/XI/2026');

    await expect(publishOfficialNumber(c.id, actor)).rejects.toThrow('sudah diterbitkan');
  });

  it('mendeteksi backup due pada jadwal terlewat', () => {
    const now = new Date('2026-11-21T07:00:00.000Z'); // 14.00 WIB
    const slots = backupSlotsWIB(now);
    expect(slots).toHaveLength(4);
    const due = isBackupDue('2026-11-21T00:00:00.000Z', now); // 07.00 WIB
    expect(due.due).toBe(true);
    const notDue = isBackupDue('2026-11-21T05:00:00.000Z', now); // 12.00 WIB
    expect(notDue.due).toBe(false);
  });
});
