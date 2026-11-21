import { db } from '@/db/schema';
import { createRecord, type Actor } from '@/db/repository';
import { sha256Hex } from '@/lib/crypto';
import { downloadBlob } from '@/lib/utils';
import type { Attachment } from '@/types';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_FILE_SIZE = 15 * 1024 * 1024;

export function validateFile(file: File): void {
  if (!ALLOWED.includes(file.type)) throw new Error('Format file harus PDF, JPG, atau PNG.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Ukuran file maksimal 15 MB.');
  if (file.size === 0) throw new Error('File kosong tidak diizinkan.');
}

export async function saveAttachment(file: File, category: Attachment['category'], ownerId: string, actor: Actor): Promise<Attachment> {
  validateFile(file);
  const checksum = await sha256Hex(await file.arrayBuffer());
  return createRecord<Attachment>('attachments', {
    name: file.name, mime: file.type, size: file.size, checksum, category,
    owner_id: ownerId, blob: file
  }, actor, { details: `Mengunggah dokumen ${file.name}` });
}

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  const row = await db.attachments.get(id);
  return row && !row.deleted_at ? row : undefined;
}

export async function downloadAttachment(id: string): Promise<void> {
  const att = await getAttachment(id);
  if (!att) throw new Error('Dokumen tidak ditemukan.');
  downloadBlob(att.blob, att.name);
}

export async function previewAttachment(id: string): Promise<string> {
  const att = await getAttachment(id);
  if (!att) throw new Error('Dokumen tidak ditemukan.');
  return URL.createObjectURL(new Blob([att.blob], { type: att.mime }));
}

export async function removeAttachment(id: string, actor: Actor): Promise<void> {
  const att = await db.attachments.get(id);
  if (att) await db.attachments.update(id, { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: att.version + 1, sync_status: 'PENDING', updated_by: actor.userId });
}
