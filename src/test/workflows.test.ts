import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createRecord, getActive, listActive, notify, updateRecord, type Actor } from '@/db/repository';
import { getAttachment, MAX_FILE_SIZE, removeAttachment, saveAttachment, validateFile } from '@/lib/attachments';
import { nextAgendaNumber, publishOfficialNumber } from '@/lib/numbering';
import { buildLetterPdf, buildTablePdf } from '@/lib/pdf';
import { sha256Hex } from '@/lib/crypto';
import { incomingLetter, letterType, outgoingLetter, registerDevice, resetDb, school, TEST_ACTOR } from './helpers';
import type { Disposition, DispositionRecipient, DocumentArchive, IncomingLetter, Notification, OutgoingLetter } from '@/types';

const actor: Actor = TEST_ACTOR;

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
});

describe('alur kerja surat dan dokumen', () => {
  it('membuat surat masuk, disposisi, tindak lanjut, dan arsip dengan nomor agenda berurutan', async () => {
    const year = new Date().getFullYear();
    const first = await nextAgendaNumber();
    expect(first).toEqual({ number: `001/AGD/${year}`, seq: 1 });

    const letter = await createRecord<IncomingLetter>('incoming_letters', {
      ...incomingLetter({ id: 'masuk-1', agenda_number: first.number, agenda_seq: first.seq })
    }, actor);

    const disposition = await createRecord<Disposition>('dispositions', {
      number: 'DISP/001/2026', letter_id: letter.id, date: '2026-11-21', giver_id: 'tu1',
      instruction_type: 'DITINDAKLANJUTI', instructions: 'Segera ditindaklanjuti', due_date: '2026-11-25',
      notes: '', status: 'MENUNGGU'
    }, actor);
    const recipient = await createRecord<DispositionRecipient>('disposition_recipients', {
      disposition_id: disposition.id, user_id: 'guru1', status: 'MENUNGGU', follow_up: '', follow_up_at: null
    }, actor);
    await updateRecord('disposition_recipients', recipient.id, {
      status: 'SELESAI', follow_up: 'Sudah dikonfirmasi', follow_up_at: new Date().toISOString()
    }, actor);
    await updateRecord('dispositions', disposition.id, { status: 'SELESAI' }, actor);

    const archived = await createRecord<DocumentArchive>('document_archives', {
      letter_id: letter.id, letter_kind: 'SURAT_MASUK', archive_number: 'ARS/001/2026',
      archived_at: new Date().toISOString(), location: 'Lemari A', retention_years: 5, notes: ''
    }, actor);
    await updateRecord('incoming_letters', letter.id, { status: 'DIARSIPKAN' }, actor);

    expect((await getActive<IncomingLetter>('incoming_letters', letter.id))?.status).toBe('DIARSIPKAN');
    expect((await getActive<DispositionRecipient>('disposition_recipients', recipient.id))?.status).toBe('SELESAI');
    expect((await listActive<DocumentArchive>('document_archives')).some((r) => r.id === archived.id)).toBe(true);
    expect(await nextAgendaNumber()).toEqual({ number: `002/AGD/${year}`, seq: 2 });
  });

  it('menolak publikasi nomor saat status masih DRAFT lalu menerbitkan setelah diajukan', async () => {
    await registerDevice('device-registrasi');
    localStorage.setItem('sipersurat_device_id', 'device-registrasi');
    const registrationActor: Actor = { ...actor, deviceId: 'device-registrasi' };
    const draft = await createRecord<OutgoingLetter>('outgoing_letters', {
      ...outgoingLetter({ id: 'keluar-draft', status: 'DRAFT' })
    }, registrationActor);

    await expect(publishOfficialNumber(draft.id, registrationActor)).rejects.toThrow('Status DRAFT');
    await updateRecord('outgoing_letters', draft.id, { status: 'DIAJUKAN' }, registrationActor);
    const published = await publishOfficialNumber(draft.id, registrationActor);
    expect(published.number).toBe('001/UND/SMKN6-MJ/XI/2026');
    expect(published.letter.status).toBe('TERDAFTAR');
    expect(published.letter.registration_device_id).toBe('device-registrasi');
    expect((await db.audit_logs.toArray()).some((log) => log.action === 'NUMBER.PUBLISHED')).toBe(true);
  });

  it('memvalidasi lampiran, menyimpan checksum, dan menghapusnya secara lunak', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const file = new File([bytes], 'bukti.pdf', { type: 'application/pdf' });
    const attachment = await saveAttachment(file, 'LAMPIRAN', 'surat-1', actor);
    expect(attachment.checksum).toBe(await sha256Hex(bytes));
    expect(attachment.owner_id).toBe('surat-1');
    expect(await getAttachment(attachment.id)).toMatchObject({ name: 'bukti.pdf', mime: 'application/pdf' });

    expect(() => validateFile(new File(['x'], 'bukti.txt', { type: 'text/plain' }))).toThrow('Format file');
    expect(() => validateFile(new File([], 'kosong.pdf', { type: 'application/pdf' }))).toThrow('File kosong');
    const huge = new File(['x'], 'besar.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: MAX_FILE_SIZE + 1 });
    expect(() => validateFile(huge)).toThrow('Ukuran file maksimal 15 MB');

    await removeAttachment(attachment.id, actor);
    expect(await getAttachment(attachment.id)).toBeUndefined();
    expect((await db.attachments.get(attachment.id))?.deleted_at).toBeTruthy();
  });

  it('menghasilkan PDF surat dan PDF tabel yang dapat dicetak', async () => {
    const pdf = buildLetterPdf(
      outgoingLetter({ official_number: '001/UND/SMKN6-MJ/XI/2026', status: 'TERDAFTAR' }),
      school(),
      letterType()
    );
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(1000);
    expect(await pdf.slice(0, 5).text()).toBe('%PDF-');

    const table = buildTablePdf('Buku Agenda Surat Masuk', 'SMKN 6 Muaro Jambi', [
      { key: 'agenda_number', label: 'No. Agenda' },
      { key: 'subject', label: 'Perihal' }
    ], [incomingLetter()]);
    expect(table.type).toBe('application/pdf');
    expect(await table.slice(0, 5).text()).toBe('%PDF-');
  });

  it('membuat notifikasi dan jejak audit untuk setiap perubahan penting', async () => {
    const letter = await createRecord<OutgoingLetter>('outgoing_letters', outgoingLetter(), actor, {
      details: 'Membuat draft surat keluar'
    });
    await notify('tu1', 'Surat baru', `${letter.subject} menunggu pemeriksaan`, '/surat-keluar', 'DISPOSISI', actor);
    const notifications = await listActive<Notification>('notifications');
    expect(notifications.some((n) => n.user_id === 'tu1' && n.title === 'Surat baru')).toBe(true);
    expect((await db.audit_logs.toArray()).some((log) => log.entity === 'outgoing_letters' && log.action === 'outgoing_letters.CREATE')).toBe(true);
  });
});
