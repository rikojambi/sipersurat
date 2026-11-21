import { beforeEach, describe, expect, it } from 'vitest';
import { db, SCHEMA_VERSION } from '@/db/schema';
import { createRecord, listActive, softDelete, updateRecord, type Actor } from '@/db/repository';
import { seedIfNeeded } from './helpers';

const actor: Actor = { userId: 'u1', userName: 'Uji', deviceId: 'device-test-1' };

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedIfNeeded();
});

describe('database lokal & change log', () => {
  it('membuat 23 tabel dan skema versi 3', () => {
    expect(db.tables.length).toBe(23);
    expect(SCHEMA_VERSION).toBe(3);
  });

  it('setiap create menghasilkan sync_queue PENDING dengan checksum', async () => {
    const type = await createRecord('letter_types', { name: 'Surat Uji', code: 'UJI', is_active: 1 }, actor);
    const changes = await db.sync_queue.where('record_id').equals(type.id).toArray();
    expect(changes).toHaveLength(1);
    expect(changes[0]!.sync_status).toBe('PENDING');
    expect(changes[0]!.operation).toBe('CREATE');
    expect(changes[0]!.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(changes[0]!.idempotency_key).toContain('device-test-1');
  });

  it('update menaikkan version dan soft delete menyembunyikan data', async () => {
    const type = await createRecord('letter_types', { name: 'Surat Uji', code: 'UJI2', is_active: 1 }, actor);
    const updated = await updateRecord('letter_types', type.id, { name: 'Surat Uji Revisi' }, actor);
    expect(updated?.version).toBe(2);
    const changes = await db.sync_queue.where('record_id').equals(type.id).sortBy('timestamp');
    expect(changes.map((c) => c.operation)).toEqual(['CREATE', 'UPDATE']);
    await softDelete('letter_types', type.id, actor);
    const active = await listActive('letter_types');
    expect(active.some((r) => r.id === type.id)).toBe(false);
    expect((await db.letter_types.get(type.id))?.deleted_at).toBeTruthy();
  });
});
