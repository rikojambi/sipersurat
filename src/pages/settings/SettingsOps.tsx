import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Cloud, Database, Download, LockKeyhole, RefreshCw, Trash2, Upload } from 'lucide-react';
import { db, getSetting } from '@/db/schema';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Field, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from '@/components/ui';
import { getDriveClient, resetDriveClient, setRootFolderId } from '@/lib/drive';
import { checkNumberingGate, knownOfficialNumbers, numberingHistory } from '@/lib/numbering';
import { applyRetention, configureBackupPassphrase, createBackup, inspectBackup, restoreBackup, setBackupPassphrase, uploadBackup, verifyBackupPassphrase } from '@/lib/backup';
import { resolveConflict } from '@/lib/syncManager';
import { downloadBlob, formatBytes, formatDate } from '@/lib/utils';
import { exportExcel } from '@/lib/pdf';
import type { BackupHistoryRecord, SyncConflict } from '@/types';

export function NumberingPage() {
  const sequences = useLiveQuery(() => db.letter_number_sequences.toArray(), [], []);
  const types = useLiveQuery(() => db.letter_types.toArray(), [], []);
  const [gate, setGate] = React.useState({ allowed: false, reason: 'Memeriksa...' });
  const [history, setHistory] = React.useState<Awaited<ReturnType<typeof numberingHistory>>>([]);
  const [known, setKnown] = React.useState(0);
  React.useEffect(() => { void (async () => { setGate(await checkNumberingGate()); setHistory(await numberingHistory(50)); setKnown((await knownOfficialNumbers()).size); })(); }, [sequences]);

  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Penomoran Resmi</h2><p className="text-sm text-slate-500">Mekanisme SINGLE WRITER: hanya perangkat registrasi yang menerbitkan nomor.</p></div>
    <div className={`rounded-xl border p-4 ${gate.allowed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex gap-2 text-sm">{gate.allowed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />}
        <div><p className="font-bold">{gate.allowed ? 'Penerbitan nomor resmi aktif' : 'Penerbitan nomor resmi diblokir'}</p><p className="text-xs">{gate.reason || 'Perangkat registrasi memiliki data sinkronisasi mutakhir.'}</p></div>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent><p className="text-2xl font-extrabold">{known}</p><p className="text-xs text-slate-500">Nomor resmi diketahui</p></CardContent></Card>
      <Card><CardContent><p className="text-2xl font-extrabold">{sequences?.length || 0}</p><p className="text-xs text-slate-500">Seri nomor aktif</p></CardContent></Card>
      <Card><CardContent><p className="text-2xl font-extrabold">{history.length}</p><p className="text-xs text-slate-500">Riwayat penerbitan</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Seri Penomoran</CardTitle></CardHeader><CardContent><DataTable rows={sequences || []} searchKeys={[]} columns={[
      { key: 'type', label: 'Jenis', render: (s) => types.find((t) => t.id === s.type_id)?.name || s.type_id },
      { key: 'year', label: 'Tahun' },
      { key: 'start_number', label: 'Nomor awal' },
      { key: 'last_number', label: 'Terakhir diterbitkan', render: (s) => <span className="font-bold text-blue-800">{String(s.last_number).padStart(3, '0')}</span> },
      { key: 'policy_reset', label: 'Kebijakan reset' }
    ]} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Riwayat Penomoran</CardTitle></CardHeader><CardContent><DataTable rows={history} searchKeys={['details', 'action']} columns={[
      { key: 'at', label: 'Waktu', render: (h) => formatDate(h.at, true) },
      { key: 'action', label: 'Aksi', render: (h) => <Badge variant={h.action === 'NUMBER.CANCELED' ? 'danger' : 'success'}>{h.action}</Badge> },
      { key: 'details', label: 'Keterangan' },
      { key: 'actor_name', label: 'Oleh' }
    ]} /></CardContent></Card>
  </div>;
}

export function SyncPage() {
  const { toast, sync, online, pending, driveConnected, lastSync, refresh } = useApp();
  const history = useLiveQuery(() => db.sync_history.reverse().toArray(), [], []);
  const queue = useLiveQuery(() => db.sync_queue.filter((c) => c.sync_status !== 'SYNCED').toArray(), [], []);
  const [folderId, setFolderId] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [env, setEnv] = React.useState({ clientId: '', picker: '', scopes: '' });

  React.useEffect(() => { void (async () => { const c = await getDriveClient(); setEnv({ clientId: c['config']?.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || '', picker: import.meta.env.VITE_GOOGLE_PICKER_API_KEY || '', scopes: import.meta.env.VITE_GOOGLE_SCOPES || '' }); setFolderId(c.rootFolderId || ''); })(); }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const drive = await getDriveClient();
      await drive.connect(true);
      toast('Akun Google Drive berhasil dihubungkan (token hanya disimpan di memori).', 'success');
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setConnecting(false); }
  };
  const pick = async () => {
    try {
      const drive = await getDriveClient();
      const id = await drive.pickFolder();
      setFolderId(id);
      await setRootFolderId(id);
      await drive.ensureStructure();
      toast('Folder dipilih dan struktur SIPERSURAT dibuat.', 'success');
      await refresh();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const saveFolder = async () => {
    await setRootFolderId(folderId.trim());
    resetDriveClient();
    const drive = await getDriveClient();
    await drive.connect(false).catch(() => drive.connect(true));
    await drive.ensureStructure();
    toast('Folder induk disimpan dan struktur diverifikasi.', 'success');
    await refresh();
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-extrabold text-slate-900">Google Drive & Sinkronisasi</h2><p className="text-sm text-slate-500">Pertukaran paket perubahan berbasis manifest, checksum, dan idempotency key.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => void connect()} disabled={connecting}><Cloud className="h-4 w-4" /> {connecting ? 'Menghubungkan...' : driveConnected ? 'Perbarui Koneksi' : 'Hubungkan Drive'}</Button><Button onClick={async () => { try { await sync(); } catch { /* toast */ } }} disabled={!online}><RefreshCw className="h-4 w-4" /> Sinkron Sekarang</Button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardContent><p className="text-xl font-extrabold">{pending}</p><p className="text-xs text-slate-500">Perubahan pending</p></CardContent></Card>
      <Card><CardContent><p className="text-xl font-extrabold">{(queue || []).filter((q) => q.sync_status === 'CONFLICT').length}</p><p className="text-xs text-slate-500">Konflik</p></CardContent></Card>
      <Card><CardContent><p className="text-xs font-bold">{driveConnected ? 'Terhubung' : 'Belum terhubung'}</p><p className="text-xs text-slate-500">Status Drive</p></CardContent></Card>
      <Card><CardContent><p className="text-xs font-bold">{formatDate(lastSync, true)}</p><p className="text-xs text-slate-500">Sinkron terakhir</p></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Konfigurasi Google Drive</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="OAuth Client ID (dari .env)" hint={env.clientId ? 'Terdaftar' : 'Belum diatur — tambahkan VITE_GOOGLE_CLIENT_ID ke .env'}><Input readOnly value={env.clientId ? `${env.clientId.slice(0, 12)}...` : 'Belum diatur'} /></Field>
        <Field label="Scope"><Input readOnly value={env.scopes} /></Field>
      </div>
      <Field label="Folder induk SIPERSURAT (ID Drive)" hint="Gunakan Picker atau masukkan ID folder yang sudah dibagikan admin. Struktur SIPERSURAT/DATA-SYNC, BACKUP, ARCHIVE dibuat otomatis.">
        <div className="flex gap-2"><Input value={folderId} onChange={(e) => setFolderId(e.target.value)} placeholder="1AbC... folder ID" /><Button variant="outline" onClick={() => void pick()} disabled={!env.picker}>Pilih via Picker</Button><Button onClick={() => void saveFolder()}>Simpan</Button></div>
      </Field>
      {!env.picker && <p className="text-xs text-slate-500">Picker memerlukan VITE_GOOGLE_PICKER_API_KEY dengan pembatasan HTTP referrer. Tanpa itu, masukkan Folder ID manual.</p>}
      <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">
        SIPERSURAT/<br />&nbsp;&nbsp;DATA-SYNC/&nbsp; {`{ DEVICES, CHANGE-LOGS, MANIFEST }`}<br />&nbsp;&nbsp;BACKUP/&nbsp;&nbsp;&nbsp;&nbsp; {`{ HOURLY, DAILY, MONTHLY }`}<br />&nbsp;&nbsp;ARCHIVE/&nbsp;&nbsp;&nbsp; {`{ SURAT-MASUK, SURAT-KELUAR }`}
      </div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Antrean Perubahan</CardTitle></CardHeader><CardContent><DataTable rows={queue || []} searchKeys={['entity', 'change_id']} columns={[
      { key: 'entity', label: 'Entitas' },
      { key: 'operation', label: 'Operasi' },
      { key: 'version', label: 'Versi' },
      { key: 'device_id', label: 'Perangkat', render: (c) => c.device_id.slice(0, 8) },
      { key: 'sync_status', label: 'Status', render: (c) => <Badge variant={c.sync_status === 'CONFLICT' ? 'danger' : 'warning'}>{c.sync_status}</Badge> },
      { key: 'timestamp', label: 'Waktu', render: (c) => formatDate(c.timestamp, true) }
    ]} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Riwayat Sinkronisasi</CardTitle></CardHeader><CardContent><DataTable rows={history || []} searchKeys={['message']} columns={[
      { key: 'started_at', label: 'Waktu', render: (h) => formatDate(h.started_at, true) },
      { key: 'direction', label: 'Arah' },
      { key: 'status', label: 'Status', render: (h) => <Badge variant={h.status === 'BERHASIL' ? 'success' : 'danger'}>{h.status}</Badge> },
      { key: 'packages', label: 'Paket' }, { key: 'records', label: 'Rekam' }, { key: 'message', label: 'Keterangan' }
    ]} /></CardContent></Card>
  </div>;
}

export function BackupPage() {
  const { actor, toast, device, lastBackup, backupDue, refresh, lockPassphrase } = useApp();
  const history = useLiveQuery(() => db.backup_history.reverse().toArray(), [], []) as BackupHistoryRecord[];
  const [secret, setSecret] = React.useState('');
  const [configured, setConfigured] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Awaited<ReturnType<typeof inspectBackup>>['preview'] | null>(null);
  const [driveFiles, setDriveFiles] = React.useState<Array<{ id: string; name: string; size?: string }>>([]);
  const [encryptedBlob, setEncryptedBlob] = React.useState<{ blob: Blob; passphrase: string } | null>(null);

  React.useEffect(() => { void (async () => { const salt = await getSetting('backup_salt'); setConfigured(!!salt); })(); }, []);

  const setupPassphrase = async () => {
    try { await configureBackupPassphrase(secret); setConfigured(true); setSecret(''); toast('Passphrase backup dikonfigurasi untuk sesi ini.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const unlock = async () => {
    if (!(await verifyBackupPassphrase(secret))) return toast('Passphrase salah.', 'error');
    setBackupPassphrase(secret); setSecret(''); toast('Passphrase aktif pada sesi ini.', 'success');
  };

  const manualBackup = async (upload: boolean) => {
    setBusy(true);
    try {
      const drive = await getDriveClient();
      await drive.connect(false).catch(() => drive.connect(true));
      const folders = await drive.ensureStructure();
      const created = await createBackup('MANUAL', actor, device?.name || 'Perangkat');
      if (upload) await uploadBackup(created, folders, actor);
      else downloadBlob(created.blob, created.fileName);
      await refresh();
      toast(upload ? 'Backup manual berhasil diunggah dan diverifikasi.' : 'Backup manual diunduh ke perangkat.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  const inspect = async () => {
    if (!restoreFile) return;
    try {
      const result = await inspectBackup(restoreFile, secret);
      setPreview(result.preview);
      setEncryptedBlob({ blob: restoreFile, passphrase: secret });
      toast('Backup valid. Periksa ringkasan sebelum restore.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const doRestore = async (mode: 'DEVICE' | 'MIGRATION') => {
    if (!encryptedBlob) return;
    if (!confirm('PERINGATAN: restore akan mengganti database lokal. Backup darurat database saat ini dibuat otomatis. Lanjutkan?')) return;
    setBusy(true);
    try {
      const counts = await restoreBackup(encryptedBlob.blob, encryptedBlob.passphrase, actor, mode);
      toast(`Restore selesai. ${Object.values(counts).reduce((a, b) => a + b, 0)} record dipulihkan.`, 'success');
      await refresh(); setPreview(null); setEncryptedBlob(null);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  const listDriveBackups = async () => {
    try {
      const drive = await getDriveClient();
      await drive.connect(false).catch(() => drive.connect(true));
      const folders = await drive.ensureStructure();
      const files = await drive.list(`'${folders.backup}' in parents and trashed=false`, 'files(id,name,size)');
      setDriveFiles(files);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const downloadDriveBackup = async (id: string, name: string) => {
    const drive = await getDriveClient();
    downloadBlob(await drive.download(id), name);
  };

  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Backup Google Drive</h2><p className="text-sm text-slate-500">Jadwal 00.00, 06.00, 12.00, 18.00 WIB saat aplikasi aktif + backup tertunda saat dibuka.</p></div>
    <div className={`rounded-xl border p-3 text-sm ${backupDue ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      <b>Status: {backupDue ? 'BACKUP DUE — jalankan backup tertunda' : 'Backup dalam jadwal'}</b> · Terakhir {formatDate(lastBackup, true)} WIB
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> Kunci Backup (AES-GCM)</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Passphrase tidak disimpan dalam source code maupun backup. Salt dan verifier disimpan; passphrase hanya aktif di memori selama sesi.</p>
        <Field label={configured ? 'Masukkan passphrase untuk membuka kunci sesi' : 'Buat passphrase baru (minimal 10 karakter)'}><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
        <div className="flex gap-2"><Button onClick={() => void (configured ? unlock() : setupPassphrase())} disabled={!secret}>{configured ? 'Buka Kunci' : 'Simpan Passphrase'}</Button><Button variant="ghost" onClick={() => { lockPassphrase(); toast('Kunci backup dikunci.', 'info'); }}>Kunci</Button></div>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">Passphrase wajib dimasukkan kembali setelah aplikasi ditutup. Backup terjadwal otomatis dilompati dengan status tertunda jika kunci tidak aktif.</div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Backup Manual</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Backup meliputi database, dokumen, change log, sync state, dan metadata. Zip dienkripsi AES-256-GCM.</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void manualBackup(true)} disabled={busy}><Upload className="h-4 w-4" /> Backup ke Drive</Button><Button variant="outline" onClick={() => void manualBackup(false)} disabled={busy}><Download className="h-4 w-4" /> Download Zip</Button></div>
        <Button variant="outline" onClick={async () => { try { const n = await applyRetention(actor); toast(`${n} backup lama dihapus.`, 'success'); await refresh(); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } }}><Trash2 className="h-4 w-4" /> Terapkan Retensi</Button>
        <p className="text-[11px] text-slate-400">Retensi: lokal 7 hari · 6-jam 30 hari · harian 90 hari · bulanan 12 bulan. Backup lama hanya dihapus setelah backup baru terverifikasi.</p>
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Restore & Migrasi Perangkat</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="File backup (.zip)"><Input type="file" accept=".zip,application/zip" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} /></Field>
        <Field label="Passphrase backup"><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void inspect()} disabled={!restoreFile || !secret}>Validasi & Lihat Ringkasan</Button><Button onClick={() => void listDriveBackups()}>Lihat Backup di Drive</Button></div>
      {preview && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
        <p><b>ID:</b> {preview.info.backup_id}</p><p><b>Perangkat:</b> {preview.info.device_name} · <b>Waktu:</b> {formatDate(preview.info.created_at, true)}</p>
        <p><b>Skema:</b> v{preview.schemaVersion} · <b>Rekam:</b> {preview.info.record_count} · <b>Dokumen:</b> {preview.info.document_count} · <b>Ukuran zip:</b> {formatBytes(encryptedBlob?.blob.size || 0)}</p>
        <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => void doRestore('DEVICE')} disabled={busy}>Restore Perangkat Ini</Button><Button size="sm" variant="outline" onClick={() => void doRestore('MIGRATION')} disabled={busy}>Migrasi ke Perangkat Baru</Button></div>
        {preview.warnings.length > 0 && <p className="mt-1 text-amber-700">{preview.warnings.join('; ')}</p>}
      </div>}
      {driveFiles.length > 0 && <div className="rounded-lg border border-slate-200 p-2"><p className="mb-1 text-xs font-bold">Backup di Google Drive:</p>{driveFiles.map((f) => <div key={f.id} className="flex items-center justify-between border-b border-slate-100 py-1 text-xs"><span className="truncate">{f.name}</span><Button size="sm" variant="ghost" onClick={() => void downloadDriveBackup(f.id, f.name)}><Download className="h-3 w-3" /> Unduh</Button></div>)}</div>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Riwayat Backup</CardTitle></CardHeader><CardContent><DataTable rows={history || []} searchKeys={['file_name', 'device_name']} columns={[
      { key: 'created_at', label: 'Waktu', render: (b) => formatDate(b.created_at, true) },
      { key: 'device_name', label: 'Perangkat' },
      { key: 'type', label: 'Jenis' },
      { key: 'status', label: 'Status', render: (b) => <Badge variant={b.status === 'BERHASIL' ? 'success' : 'danger'}>{b.status}</Badge> },
      { key: 'size', label: 'Ukuran', render: (b) => formatBytes(b.size) },
      { key: 'record_count', label: 'Rekam' },
      { key: 'document_count', label: 'Dokumen' },
      { key: 'checksum', label: 'Checksum', render: (b) => b.checksum.slice(0, 12) }
    ]} /></CardContent></Card>
  </div>;
}

export function ConflictsPage() {
  const { actor, toast } = useApp();
  const conflicts = useLiveQuery(() => db.sync_conflicts.reverse().toArray(), [], []) as SyncConflict[];
  const open = conflicts.filter((c) => !c.resolved_at);
  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Konflik Sinkronisasi</h2><p className="text-sm text-slate-500">Data tidak pernah ditimpa diam-diam; admin menentukan penyelesaian.</p></div>
    <Card><CardHeader><CardTitle>Konflik belum selesai ({open.length})</CardTitle></CardHeader><CardContent className="space-y-3">
      {open.map((c) => <div key={c.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{c.entity} · {c.record_id.slice(0, 12)}</p><Badge variant="warning">lokal v{c.local_version} vs remote v{c.remote_version}</Badge></div>
        <p className="mt-1 text-xs text-amber-900">Terdeteksi {formatDate(c.detected_at, true)}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="max-h-40 overflow-auto rounded bg-white p-2 text-[10px]">{c.local_payload}</pre><pre className="max-h-40 overflow-auto rounded bg-white p-2 text-[10px]">{c.remote_payload}</pre></div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['LOKAL', 'REMOTE', 'GABUNGAN'] as const).map((r) => <Button key={r} size="sm" variant={r === 'LOKAL' ? 'default' : 'outline'} onClick={async () => { try { await resolveConflict(c.id, r, actor); toast(`Konflik diselesaikan: ${r}`, 'success'); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } }}>Pakai {r}</Button>)}
        </div>
      </div>)}
      {!open.length && <p className="py-8 text-center text-sm text-slate-400">Tidak ada konflik yang perlu diselesaikan.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Riwayat Penyelesaian</CardTitle></CardHeader><CardContent><DataTable rows={conflicts.filter((c) => c.resolved_at)} searchKeys={['entity']} columns={[
      { key: 'detected_at', label: 'Terdeteksi', render: (c) => formatDate(c.detected_at, true) },
      { key: 'entity', label: 'Entitas' }, { key: 'resolution', label: 'Keputusan' }, { key: 'resolved_by', label: 'Oleh' },
      { key: 'resolved_at', label: 'Waktu', render: (c) => formatDate(c.resolved_at, true) }
    ]} /></CardContent></Card>
  </div>;
}

export function AuditPage() {
  const logs = useLiveQuery(() => db.audit_logs.reverse().toArray(), [], []);
  const [severity, setSeverity] = React.useState('');
  const filtered = (logs || []).filter((l) => !severity || l.severity === severity);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-extrabold text-slate-900">Audit Log</h2><p className="text-sm text-slate-500">Catatan aktivitas penting, termasuk penerbitan nomor dan restore.</p></div>
      <div className="flex gap-2"><Select value={severity} onValueChange={setSeverity}><SelectTrigger className="w-40"><SelectValue placeholder="Semua level" /></SelectTrigger><SelectContent><SelectItem value="INFO">Info</SelectItem><SelectItem value="WARNING">Warning</SelectItem><SelectItem value="CRITICAL">Critical</SelectItem></SelectContent></Select>
        <Button variant="outline" onClick={() => exportExcel('audit-log', [{ name: 'Audit', rows: filtered.map((l) => ({ Waktu: formatDate(l.at, true), Aksi: l.action, Entitas: l.entity, Pengguna: l.actor_name, Detail: l.details, Level: l.severity, Perangkat: l.device_id })) }])}><Download className="h-4 w-4" /> Excel</Button></div>
    </div>
    <Card><CardContent><DataTable rows={filtered} searchKeys={['action', 'details', 'actor_name', 'entity']} columns={[
      { key: 'at', label: 'Waktu', render: (l) => formatDate(l.at, true) },
      { key: 'action', label: 'Aksi', render: (l) => <span className="font-mono text-xs">{l.action}</span> },
      { key: 'actor_name', label: 'Pengguna' },
      { key: 'details', label: 'Keterangan' },
      { key: 'severity', label: 'Level', render: (l) => <Badge variant={l.severity === 'CRITICAL' ? 'danger' : l.severity === 'WARNING' ? 'warning' : 'muted'}>{l.severity}</Badge> },
      { key: 'device_id', label: 'Perangkat', render: (l) => l.device_id.slice(0, 8) }
    ]} /></CardContent></Card>
  </div>;
}
