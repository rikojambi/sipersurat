import { db } from './schema';
import { blobToBase64, sha256Hex, uuid } from '@/lib/crypto';
import type { AuditLog, BaseEntity, EntityName, Notification, Operation } from '@/types';

export interface Actor { userId: string; userName: string; deviceId: string }

export const SYSTEM_ACTOR: Actor = { userId: 'system', userName: 'Sistem', deviceId: 'local' };

function now(): string { return new Date().toISOString(); }

function tableOf(entity: EntityName) {
  return db[entity] as unknown as {
    get(id: string): Promise<BaseEntity | undefined>;
    add(item: unknown): Promise<string>;
    put(item: unknown): Promise<string>;
    update(id: string, patch: unknown): Promise<number>;
    toArray(): Promise<BaseEntity[]>;
    where(fields: string): { equals(value: string): { first(): Promise<BaseEntity | undefined> } };
  };
}

/** Mengubah Blob menjadi base64 bertanda agar dapat dikirim sebagai payload JSON. */
export async function prepareForSync(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return `__B64__:${await blobToBase64(value)}`;
  if (Array.isArray(value)) return Promise.all(value.map(prepareForSync));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await prepareForSync(v);
    return out;
  }
  return value;
}

export async function addChange(
  entity: EntityName,
  recordId: string,
  operation: Operation,
  record: unknown,
  actor: Actor,
  version: number
): Promise<void> {
  const plain = await prepareForSync(record);
  const payload = JSON.stringify(plain);
  const changeId = uuid();
  await db.sync_queue.add({
    id: changeId,
    change_id: changeId,
    entity,
    record_id: recordId,
    operation,
    device_id: actor.deviceId,
    user_id: actor.userId,
    timestamp: now(),
    version,
    payload,
    checksum: await sha256Hex(payload),
    sync_status: 'PENDING',
    attempts: 0,
    idempotency_key: `${actor.deviceId}:${changeId}`,
    error: ''
  });
}

export async function createRecord<T extends BaseEntity>(
  entity: EntityName,
  data: Partial<T> | Record<string, unknown>,
  actor: Actor = SYSTEM_ACTOR,
  options: { silent?: boolean; audit?: boolean; details?: string } = {}
): Promise<T> {
  const t = now();
  const record = {
    ...data,
    id: (data.id as string) || uuid(),
    created_at: (data.created_at as string) || t,
    updated_at: t,
    created_by: actor.userId,
    updated_by: actor.userId,
    device_id: actor.deviceId,
    sync_status: 'PENDING' as const,
    deleted_at: null,
    version: 1
  } as T;
  await tableOf(entity).add(record);
  if (!options.silent) await addChange(entity, record.id, 'CREATE', record, actor, record.version);
  if (options.audit !== false) {
    await logAudit(`${entity}.CREATE`, entity, record.id, actor, `Membuat data ${entity}`, 'INFO');
  }
  return record;
}

export async function updateRecord<T extends BaseEntity>(
  entity: EntityName,
  id: string,
  patch: Partial<T> | Record<string, unknown>,
  actor: Actor = SYSTEM_ACTOR,
  options: { silent?: boolean; operation?: Operation; audit?: boolean; details?: string } = {}
): Promise<T | undefined> {
  const table = tableOf(entity);
  const existing = await table.get(id) as T | undefined;
  if (!existing) return undefined;
  const version = existing.version + 1;
  const updated = {
    ...patch,
    updated_at: now(),
    updated_by: actor.userId,
    device_id: actor.deviceId,
    version,
    sync_status: 'PENDING' as const
  };
  await table.update(id, updated);
  const full = { ...existing, ...updated } as T;
  if (!options.silent) await addChange(entity, id, options.operation ?? 'UPDATE', full, actor, version);
  if (options.audit !== false) {
    await logAudit(`${entity}.${options.operation ?? 'UPDATE'}`, entity, id, actor, options.details || `Memperbarui data ${entity}`, 'INFO');
  }
  return full;
}

export async function softDelete(entity: EntityName, id: string, actor: Actor = SYSTEM_ACTOR): Promise<void> {
  await updateRecord(entity, id, { deleted_at: now() } as never, actor, { operation: 'DELETE', details: `Menghapus data ${entity} (soft delete)` });
}

export async function restoreRecord(entity: EntityName, id: string, actor: Actor = SYSTEM_ACTOR): Promise<void> {
  await updateRecord(entity, id, { deleted_at: null } as never, actor, { details: `Memulihkan data ${entity}` });
}

export async function getActive<T extends BaseEntity>(entity: EntityName, id: string): Promise<T | undefined> {
  const row = await tableOf(entity).get(id) as T | undefined;
  return row && !row.deleted_at ? row : undefined;
}

export async function listActive<T extends BaseEntity>(entity: EntityName): Promise<T[]> {
  const rows = await tableOf(entity).toArray();
  return rows.filter((r) => !r.deleted_at) as T[];
}

export async function logAudit(
  action: string,
  entity: string,
  recordId: string,
  actor: Actor,
  details: string,
  severity: AuditLog['severity'] = 'INFO'
): Promise<void> {
  const t = now();
  await db.audit_logs.add({
    id: uuid(), action, entity, record_id: recordId, actor_id: actor.userId,
    actor_name: actor.userName, details, severity, at: t,
    created_at: t, updated_at: t, created_by: actor.userId, updated_by: actor.userId,
    device_id: actor.deviceId, sync_status: 'PENDING', deleted_at: null, version: 1
  });
}

export async function notify(
  userId: string, title: string, message: string, link: string,
  type: Notification['type'] = 'INFO', actor: Actor = SYSTEM_ACTOR
): Promise<void> {
  await createRecord<Notification>('notifications', { user_id: userId, title, message, link, type, read_at: null }, actor, { audit: false });
}
