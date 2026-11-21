import { db, getSetting } from '@/db/schema';
import { createRecord, getActive, listActive, logAudit, updateRecord, type Actor } from '@/db/repository';
import { getDeviceId, isRegistrationDevice } from '@/lib/device';
import type { LetterNumberSequence, LetterType, OutgoingLetter, SchoolSettings } from '@/types';

const ROMAN: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI',
  7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII'
};

/** Tanggal YYYY-MM-DD dibaca sebagai tanggal lokal agar tidak bergeser di zona waktu lain. */
function asDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12)
    : new Date(value);
}

export function romanMonth(date: Date | string): string {
  const d = asDate(date);
  return ROMAN[d.getMonth() + 1] || String(d.getMonth() + 1);
}

export async function formatOfficialNumber(
  seq: number,
  type: LetterType,
  school: SchoolSettings,
  date: string,
  format?: string
): Promise<string> {
  const f = format || await getSetting('numbering_format', '{SEQ}/{CODE}/{SCHOOL}/{MONTH}/{YEAR}');
  const d = asDate(date);
  return f
    .replaceAll('{SEQ}', String(seq).padStart(3, '0'))
    .replaceAll('{CODE}', type.code || 'LAIN')
    .replaceAll('{SCHOOL}', school.school_code || school.abbreviation || 'SMKN6-MJ')
    .replaceAll('{MONTH}', romanMonth(d))
    .replaceAll('{YEAR}', String(d.getFullYear()));
}

export interface NumberingGate { allowed: boolean; reason: string }

/** Pemeriksaan SINGLE WRITER — blokir penerbitan bila prasyarat tidak terpenuhi. */
export async function checkNumberingGate(): Promise<NumberingGate> {
  if (!(await isRegistrationDevice())) {
    return { allowed: false, reason: 'Perangkat ini bukan perangkat registrasi resmi. Surat harus diajukan dan menunggu registrasi.' };
  }
  const conflicts = (await db.sync_conflicts.toArray()).filter((c) => !c.resolved_at).length;
  if (conflicts > 0) return { allowed: false, reason: `Ada ${conflicts} konflik sinkronisasi yang belum diselesaikan.` };
  const device = await db.device_registry.get(getDeviceId());
  if (!device?.initial_sync_done) return { allowed: false, reason: 'Sinkronisasi awal perangkat belum selesai.' };
  const lastSync = device.last_sync_at ? new Date(device.last_sync_at).getTime() : 0;
  const staleHours = Number(await getSetting('stale_account_warning_hours', '24')) || 24;
  const pending = await db.sync_queue.where('sync_status').equals('PENDING').count();
  if (!lastSync || (Date.now() - lastSync > staleHours * 3600_000 && pending > 0)) {
    return { allowed: false, reason: 'Data sinkronisasi perangkat registrasi belum mutakhir. Jalankan sinkronisasi terlebih dahulu.' };
  }
  return { allowed: true, reason: '' };
}

export async function knownOfficialNumbers(): Promise<Set<string>> {
  const letters = await listActive<OutgoingLetter>('outgoing_letters');
  const set = new Set<string>();
  for (const l of letters) if (l.official_number) set.add(l.official_number);
  // Nomor yang dibatalkan tetap berada dalam daftar karena record tidak dihapus.
  return set;
}

export interface PublishResult { number: string; letter: OutgoingLetter }

// Antrean lokal menjaga satu penulis nomor juga saat dua permintaan diterbitkan bersamaan.
let publishQueue: Promise<unknown> = Promise.resolve();

export function publishOfficialNumber(letterId: string, actor: Actor): Promise<PublishResult> {
  const run = publishQueue.then(() => doPublishOfficialNumber(letterId, actor));
  publishQueue = run.catch(() => undefined);
  return run;
}

async function doPublishOfficialNumber(letterId: string, actor: Actor): Promise<PublishResult> {
  const gate = await checkNumberingGate();
  if (!gate.allowed) throw new Error(gate.reason);
  const letter = await getActive<OutgoingLetter>('outgoing_letters', letterId);
  if (!letter) throw new Error('Surat keluar tidak ditemukan.');
  if (letter.official_number) throw new Error('Nomor resmi sudah diterbitkan dan tidak dapat diubah.');
  if (!['DIAJUKAN', 'PEMERIKSAAN', 'DISETUJUI'].includes(letter.status)) {
    throw new Error(`Status ${letter.status} belum memungkinkan penerbitan nomor resmi.`);
  }
  const type = await getActive<LetterType>('letter_types', letter.type_id);
  if (!type) throw new Error('Jenis surat tidak ditemukan.');
  const school = await db.school_settings.get('00000000-0000-4000-8000-000000000001');
  if (!school) throw new Error('Identitas sekolah belum diatur.');
  const date = letter.letter_date || new Date().toISOString();
  const year = asDate(date).getFullYear();
  let seqRow = await db.letter_number_sequences.where('[type_id+year]').equals([type.id, year]).first();
  if (!seqRow) {
    seqRow = await createRecord<LetterNumberSequence>('letter_number_sequences', {
      type_id: type.id, year, last_number: 0,
      policy_reset: (await getSetting('number_reset_policy', 'TAHUNAN')) as LetterNumberSequence['policy_reset'],
      start_number: Number(await getSetting('number_start', '1')) || 1
    }, actor, { audit: false });
  }
  const known = await knownOfficialNumbers();
  let candidate = Math.max(seqRow.last_number, seqRow.start_number - 1) + 1;
  let number = await formatOfficialNumber(candidate, type, school, date);
  while (known.has(number)) {
    candidate += 1;
    number = await formatOfficialNumber(candidate, type, school, date);
  }
  await db.letter_number_sequences.update(seqRow.id, { last_number: candidate, updated_at: new Date().toISOString(), version: seqRow.version + 1, sync_status: 'PENDING', device_id: actor.deviceId });
  const updated = await updateRecord<OutgoingLetter>('outgoing_letters', letter.id, {
    official_number: number,
    published_at: new Date().toISOString(),
    published_by: actor.userId,
    registration_device_id: actor.deviceId,
    status: 'TERDAFTAR'
  }, actor, { details: `Menerbitkan nomor resmi ${number}` });
  await logAudit('NUMBER.PUBLISHED', 'outgoing_letters', letter.id, actor, `Nomor resmi ${number} diterbitkan oleh perangkat registrasi ${actor.deviceId}`, 'CRITICAL');
  return { number, letter: updated! };
}

export async function cancelOfficialNumber(letterId: string, reason: string, actor: Actor): Promise<void> {
  const letter = await getActive<OutgoingLetter>('outgoing_letters', letterId);
  if (!letter?.official_number) throw new Error('Surat belum memiliki nomor resmi.');
  await updateRecord<OutgoingLetter>('outgoing_letters', letterId, {
    status: 'DIBATALKAN', canceled_at: new Date().toISOString(), cancellation_reason: reason
  }, actor, { operation: 'CANCEL', details: `Membatalkan nomor ${letter.official_number}: ${reason}` });
  await logAudit('NUMBER.CANCELED', 'outgoing_letters', letterId, actor, `Nomor ${letter.official_number} dibatalkan. Nomor tidak dipakai ulang.`, 'CRITICAL');
}

export async function nextAgendaNumber(): Promise<{ number: string; seq: number }> {
  const year = new Date().getFullYear();
  const rows = await db.incoming_letters.where('agenda_seq').above(0).toArray().catch(() => db.incoming_letters.toArray());
  const max = rows.filter((r) => new Date(r.created_at).getFullYear() === year || r.agenda_number.endsWith(`/${year}`))
    .reduce((m, r) => Math.max(m, r.agenda_seq || 0), 0);
  const seq = max + 1;
  return { number: `${String(seq).padStart(3, '0')}/AGD/${year}`, seq };
}

export async function numberingHistory(limit = 100) {
  const rows = await db.audit_logs.toArray();
  return rows.filter((r) => r.action.startsWith('NUMBER.')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
