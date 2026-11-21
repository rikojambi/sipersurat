import { sha256Hex } from '@/lib/crypto';
import type { DriveFile, FolderIds } from '@/lib/drive';

interface StoredFile {
  id: string;
  name: string;
  parentId: string;
  mimeType: string;
  content: Blob;
}

/** Drive client tiruan untuk menguji kontrak paket/manifest tanpa Google OAuth. */
export class FakeDrive {
  private files = new Map<string, StoredFile>();
  private counter = 0;
  corruptNextDownload = false;

  readonly folders: FolderIds = {
    root: 'f-root', data: 'f-data', devices: 'f-devices', changeLogs: 'f-changes',
    manifest: 'f-manifest', backup: 'f-backup', hourly: 'f-hourly', daily: 'f-daily',
    monthly: 'f-monthly', archive: 'f-archive', incoming: 'f-incoming', outgoing: 'f-outgoing'
  };

  get isConnected(): boolean { return true; }

  async connect(): Promise<string> { return 'fake-token'; }
  async checksum(blob: Blob): Promise<string> { return sha256Hex(await blob.arrayBuffer()); }
  async ensureStructure(): Promise<FolderIds> { return this.folders; }
  async getFolders(): Promise<FolderIds> { return this.folders; }

  async getFile(id: string): Promise<DriveFile> {
    const file = this.files.get(id);
    if (!file) throw new Error(`File ${id} tidak ditemukan.`);
    return this.toDriveFile(file);
  }

  async download(id: string): Promise<Blob> {
    const file = this.files.get(id);
    if (!file) throw new Error(`File ${id} tidak ditemukan.`);
    if (this.corruptNextDownload) {
      this.corruptNextDownload = false;
      return new Blob(['paket-rusak'], { type: file.mimeType });
    }
    return file.content;
  }

  async findChild(parentId: string, name: string): Promise<DriveFile | undefined> {
    const found = this.all().find((file) => file.parentId === parentId && file.name === name);
    return found ? this.toDriveFile(found) : undefined;
  }

  async list(query: string, _fields?: string): Promise<DriveFile[]> {
    const parent = /'([^']+)' in parents/.exec(query)?.[1];
    const contains = /name contains '([^']+)'/.exec(query)?.[1];
    const exact = /name='([^']+)'/.exec(query)?.[1];
    return this.all()
      .filter((file) => !parent || file.parentId === parent)
      .filter((file) => !contains || file.name.includes(contains))
      .filter((file) => !exact || file.name === exact)
      .map((file) => this.toDriveFile(file));
  }

  async uploadJson(parentId: string, name: string, data: unknown, mimeType = 'application/json'): Promise<DriveFile> {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    return this.create(parentId, name, new Blob([body], { type: mimeType }), mimeType);
  }

  async updateJson(fileId: string, data: unknown, mimeType = 'application/json'): Promise<DriveFile> {
    const file = this.files.get(fileId);
    if (!file) throw new Error(`File ${fileId} tidak ditemukan.`);
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    file.content = new Blob([body], { type: mimeType });
    file.mimeType = mimeType;
    return this.toDriveFile(file);
  }

  async uploadBlob(parentId: string, name: string, blob: Blob): Promise<DriveFile> {
    return this.create(parentId, name, blob, blob.type || 'application/octet-stream');
  }

  async remove(fileId: string): Promise<void> { this.files.delete(fileId); }
  async pickFolder(): Promise<string> { return this.folders.root; }
  async share(): Promise<void> { /* tidak dipakai dalam pengujian */ }

  private create(parentId: string, name: string, content: Blob, mimeType: string): DriveFile {
    const id = `fake-file-${++this.counter}`;
    const file: StoredFile = { id, name, parentId, mimeType, content };
    this.files.set(id, file);
    return this.toDriveFile(file);
  }

  private all(): StoredFile[] { return [...this.files.values()]; }

  private toDriveFile(file: StoredFile): DriveFile {
    return { id: file.id, name: file.name, mimeType: file.mimeType, size: String(file.content.size) };
  }
}
