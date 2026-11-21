import { getSetting, setSetting } from '@/db/schema';
import { sha256Hex } from '@/lib/crypto';

export const FOLDER_TEMPLATE = {
  root: 'SIPERSURAT',
  data: 'DATA-SYNC',
  devices: 'DEVICES',
  changeLogs: 'CHANGE-LOGS',
  manifest: 'MANIFEST',
  backup: 'BACKUP',
  hourly: 'HOURLY',
  daily: 'DAILY',
  monthly: 'MONTHLY',
  archive: 'ARCHIVE',
  incoming: 'SURAT-MASUK',
  outgoing: 'SURAT-KELUAR'
} as const;

export interface DriveFile { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; appProperties?: Record<string, string> }

export interface DriveConfigState {
  clientId: string;
  scopes: string;
  pickerApiKey: string;
  rootFolderId: string;
}

export async function getDriveConfig(): Promise<DriveConfigState> {
  return {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    scopes: import.meta.env.VITE_GOOGLE_SCOPES || 'https://www.googleapis.com/auth/drive.file',
    pickerApiKey: import.meta.env.VITE_GOOGLE_PICKER_API_KEY || '',
    rootFolderId: await getSetting('drive_root_folder_id', '')
  };
}

export async function setRootFolderId(id: string): Promise<void> {
  await setSetting('drive_root_folder_id', id);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Gagal memuat skrip ${src}`));
    document.head.appendChild(s);
  });
}

export async function loadGoogleScripts(needPicker = false): Promise<void> {
  await loadScript('https://accounts.google.com/gsi/client');
  if (needPicker) await loadScript('https://apis.google.com/js/api.js');
}

export interface FolderIds {
  root: string; data: string; devices: string; changeLogs: string; manifest: string;
  backup: string; hourly: string; daily: string; monthly: string;
  archive: string; incoming: string; outgoing: string;
}

export class DriveClient {
  private accessToken = '';
  private expiresAt = 0;
  private config: DriveConfigState;
  private folderIds: FolderIds | null = null;

  constructor(config: DriveConfigState) { this.config = config; }

  get isConnected(): boolean { return !!this.accessToken && Date.now() < this.expiresAt; }
  get rootFolderId(): string { return this.config.rootFolderId; }

  async connect(interactive = true): Promise<string> {
    if (this.isConnected) return this.accessToken;
    if (!this.config.clientId) throw new Error('Google OAuth Client ID belum diatur di .env (VITE_GOOGLE_CLIENT_ID).');
    await loadGoogleScripts(false);
    return new Promise<string>((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: this.config.scopes,
        prompt: interactive ? 'consent' : '',
        callback: (response: { access_token?: string; expires_in?: number; error?: string }) => {
          if (response.error || !response.access_token) {
            reject(new Error(`Otorisasi Google gagal: ${response.error || 'token tidak diterima'}`));
            return;
          }
          this.accessToken = response.access_token;
          this.expiresAt = Date.now() + (response.expires_in || 3600) * 1000 - 60_000;
          resolve(this.accessToken);
        }
      });
      client.requestAccessToken();
    });
  }

  private async api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.isConnected) await this.connect(false).catch(() => this.connect(true));
    const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.accessToken}`, ...(init.body instanceof Blob ? {} : { 'Content-Type': 'application/json' }), ...init.headers }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Google Drive API ${response.status}: ${text.slice(0, 250)}`);
    }
    return response.status === 204 ? (undefined as T) : await response.json() as T;
  }

  private async uploadMedia<T>(url: string, method: string, blob: Blob, metadata?: Record<string, unknown>): Promise<T> {
    if (!this.isConnected) await this.connect(false).catch(() => this.connect(true));
    let body: BodyInit = blob;
    let headers: Record<string, string> = { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': blob.type || 'application/octet-stream' };
    if (metadata) {
      const boundary = `sipersurat${Date.now()}`;
      const parts: string[] = [];
      parts.push(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`);
      parts.push(`--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`);
      const tail = `\r\n--${boundary}--`;
      const headBytes = new TextEncoder().encode(parts.join(''));
      const tailBytes = new TextEncoder().encode(tail);
      body = new Blob([headBytes, blob, tailBytes]);
      headers = { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` };
    }
    const response = await fetch(url, { method, headers, body });
    if (!response.ok) throw new Error(`Google Drive upload ${response.status}: ${(await response.text()).slice(0, 250)}`);
    return response.json() as Promise<T>;
  }

  async list(query: string, fields = 'files(id,name,mimeType,size,modifiedTime,appProperties),nextPageToken'): Promise<DriveFile[]> {
    const all: DriveFile[] = [];
    let token = '';
    do {
      const res = await this.api<{ files: DriveFile[]; nextPageToken?: string }>(
        `files?q=${encodeURIComponent(query)}&pageSize=1000&fields=${encodeURIComponent(fields)}&pageToken=${encodeURIComponent(token)}&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`
      );
      all.push(...(res.files || []));
      token = res.nextPageToken || '';
    } while (token);
    return all;
  }

  async getFile(id: string): Promise<DriveFile> {
    return this.api<DriveFile>(`files/${id}?fields=id,name,mimeType,size,modifiedTime,appProperties`);
  }

  async download(id: string): Promise<Blob> {
    if (!this.isConnected) await this.connect(false).catch(() => this.connect(true));
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) throw new Error(`Gagal mengunduh file Drive ${res.status}`);
    return res.blob();
  }

  async findChild(parentId: string, name: string): Promise<DriveFile | undefined> {
    const files = await this.list(`'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`, 'files(id,name,mimeType)');
    return files[0];
  }

  async createFolder(name: string, parentId: string): Promise<DriveFile> {
    return this.api<DriveFile>('files?fields=id,name,mimeType', {
      method: 'POST',
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
  }

  async ensureFolder(name: string, parentId: string): Promise<string> {
    const existing = await this.findChild(parentId, name);
    if (existing) return existing.id;
    const created = await this.createFolder(name, parentId);
    return created.id;
  }

  /** Membuat seluruh struktur folder di bawah folder yang dipilih admin. */
  async ensureStructure(): Promise<FolderIds> {
    if (!this.config.rootFolderId) throw new Error('Folder SIPERSURAT belum dipilih oleh admin.');
    const root = await this.ensureFolder(FOLDER_TEMPLATE.root, this.config.rootFolderId);
    const data = await this.ensureFolder(FOLDER_TEMPLATE.data, root);
    const backup = await this.ensureFolder(FOLDER_TEMPLATE.backup, root);
    const archive = await this.ensureFolder(FOLDER_TEMPLATE.archive, root);
    const [devices, changeLogs, manifest, hourly, daily, monthly, incoming, outgoing] = await Promise.all([
      this.ensureFolder(FOLDER_TEMPLATE.devices, data),
      this.ensureFolder(FOLDER_TEMPLATE.changeLogs, data),
      this.ensureFolder(FOLDER_TEMPLATE.manifest, data),
      this.ensureFolder(FOLDER_TEMPLATE.hourly, backup),
      this.ensureFolder(FOLDER_TEMPLATE.daily, backup),
      this.ensureFolder(FOLDER_TEMPLATE.monthly, backup),
      this.ensureFolder(FOLDER_TEMPLATE.incoming, archive),
      this.ensureFolder(FOLDER_TEMPLATE.outgoing, archive)
    ]);
    this.folderIds = { root, data, devices, changeLogs, manifest, backup, hourly, daily, monthly, archive, incoming, outgoing };
    return this.folderIds;
  }

  async getFolders(): Promise<FolderIds> { return this.folderIds || this.ensureStructure(); }

  async uploadJson(parentId: string, name: string, data: unknown, mimeType = 'application/json'): Promise<DriveFile> {
    const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: mimeType });
    return this.uploadMedia<DriveFile>(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size&supportsAllDrives=true`, 'POST', blob, { name, parents: [parentId] });
  }

  async updateJson(fileId: string, data: unknown, mimeType = 'application/json'): Promise<DriveFile> {
    const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: mimeType });
    return this.uploadMedia<DriveFile>(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,size&supportsAllDrives=true`, 'PATCH', blob);
  }

  async uploadBlob(parentId: string, name: string, blob: Blob): Promise<DriveFile> {
    return this.uploadMedia<DriveFile>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size&supportsAllDrives=true', 'POST', blob, { name, parents: [parentId] });
  }

  async remove(fileId: string): Promise<void> { await this.api(`files/${fileId}`, { method: 'DELETE' }); }

  async share(fileId: string, email: string, role: 'reader' | 'writer' = 'reader'): Promise<void> {
    await this.api(`files/${fileId}/permissions?sendNotificationEmail=false`, {
      method: 'POST',
      body: JSON.stringify({ type: 'user', role, emailAddress: email })
    });
  }

  async pickFolder(): Promise<string> {
    if (!this.config.pickerApiKey) throw new Error('Google Picker API Key belum diatur (VITE_GOOGLE_PICKER_API_KEY). Anda juga dapat memasukkan Folder ID secara manual.');
    await loadGoogleScripts(true);
    await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()));
    if (!this.isConnected) await this.connect(true);
    return new Promise<string>((resolve, reject) => {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMode(window.google.picker.DocsViewMode.LIST);
      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(this.accessToken)
        .setDeveloperKey(this.config.pickerApiKey)
        .setAppId(this.config.clientId.split('-')[0])
        .setTitle('Pilih folder induk SIPERSURAT')
        .setCallback((data: { action: string; docs?: Array<{ id: string }> }) => {
          if (data.action === window.google.picker.Action.PICKED && data.docs?.[0]) { picker.dispose(); resolve(data.docs[0].id); }
          if (data.action === window.google.picker.Action.CANCEL) { picker.dispose(); reject(new Error('Pemilihan folder dibatalkan.')); }
        })
        .build();
      picker.setVisible(true);
    });
  }

  /** Menghasilkan checksum SHA-256 dari Blob untuk diverifikasi lawan bicara. */
  async checksum(blob: Blob): Promise<string> { return sha256Hex(await blob.arrayBuffer()); }
}

let client: DriveClient | null = null;

export async function getDriveClient(): Promise<DriveClient> {
  if (!client) client = new DriveClient(await getDriveConfig());
  return client;
}

export function resetDriveClient(): void { client = null; }
