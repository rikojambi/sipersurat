import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { KeyRound, Plus, Save, ShieldOff, Smartphone, Trash2 } from 'lucide-react';
import { db, SCHOOL_SETTINGS_ID, getSetting, setSetting } from '@/db/schema';
import { createRecord, logAudit, softDelete, updateRecord } from '@/db/repository';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue, Switch, Textarea } from '@/components/ui';
import { createActivationCode } from '@/lib/device';
import { saveAttachment } from '@/lib/attachments';
import { resetPassword, setUserActive, createUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import type { DeviceRegistry, LetterClassification, LetterType, SchoolSettings, Unit, User } from '@/types';

export function SchoolSettingsPage() {
  const { actor, toast } = useApp();
  const school = useLiveQuery(() => db.school_settings.get(SCHOOL_SETTINGS_ID), []);
  const [form, setForm] = React.useState<Partial<SchoolSettings>>({});
  React.useEffect(() => { if (school) setForm(school); }, [school]);
  const [logo, setLogo] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fmt, setFmt] = React.useState('{SEQ}/{CODE}/{SCHOOL}/{MONTH}/{YEAR}');
  const [code, setCode] = React.useState('SMKN6-MJ');
  const [resetPolicy, setResetPolicy] = React.useState('TAHUNAN');
  React.useEffect(() => {
    void Promise.all([getSetting('numbering_format', fmt), getSetting('school_code', code), getSetting('number_reset_policy', resetPolicy)])
      .then(([a, b, c]) => { setFmt(a); setCode(b); setResetPolicy(c); });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let logoId = form.logo_attachment_id || '';
      if (logo) logoId = (await saveAttachment(logo, 'LOGO', SCHOOL_SETTINGS_ID, actor)).id;
      await db.school_settings.update(SCHOOL_SETTINGS_ID, { ...form, logo_attachment_id: logoId, updated_at: new Date().toISOString(), version: (school?.version || 1) + 1, sync_status: 'PENDING' });
      await Promise.all([
        setSetting('numbering_format', fmt), setSetting('school_code', code), setSetting('number_reset_policy', resetPolicy)
      ]);
      await logAudit('SETTINGS.SCHOOL_UPDATED', 'school_settings', SCHOOL_SETTINGS_ID, actor, 'Identitas sekolah dan format penomoran diperbarui', 'WARNING');
      toast('Identitas sekolah dan pengaturan nomor disimpan.', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };
  const field = (key: keyof SchoolSettings, label: string) => <Field key={key} label={label}><Input value={String(form[key] ?? '')} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>;

  return <form onSubmit={save} className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Identitas Sekolah</h2><p className="text-sm text-slate-500">Kop surat, kepala sekolah, dan kebijakan penomoran.</p></div>
    <Card><CardHeader><CardTitle>Profil sekolah</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      {field('npsn', 'NPSN')}{field('name', 'Nama sekolah')}{field('abbreviation', 'Singkatan')}{field('school_code', 'Kode sekolah')}
      {field('address', 'Alamat')}{field('city', 'Kota')}{field('phone', 'Telepon')}{field('email', 'Email')}{field('website', 'Website')}
      {field('headmaster', 'Nama kepala sekolah')}{field('headmaster_nip', 'NIP kepala sekolah')}
      <Field label="Logo sekolah (PNG/JPG)" hint="Dipakai pada kop surat cetak."><Input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogo(e.target.files?.[0] || null)} /></Field>
      <div className="sm:col-span-2"><Field label="Catatan kaki surat"><Textarea value={form.letter_footer ?? ''} onChange={(e) => setForm({ ...form, letter_footer: e.target.value })} /></Field></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Format nomor surat</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <Field label="Format" hint="Variabel: {SEQ} {CODE} {SCHOOL} {MONTH} {YEAR}"><Input value={fmt} onChange={(e) => setFmt(e.target.value)} /></Field>
      <Field label="Kode sekolah pada nomor"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <Field label="Kebijakan reset nomor"><Select value={resetPolicy} onValueChange={setResetPolicy}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TAHUNAN">Tahunan</SelectItem><SelectItem value="BULANAN">Bulanan</SelectItem><SelectItem value="TIDAK_PERNAH">Tidak pernah</SelectItem></SelectContent></Select></Field>
      <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800"><b>Contoh:</b> 001/UND/{code}/XI/{new Date().getFullYear()}</div>
    </CardContent></Card>
    <Button type="submit" disabled={busy}><Save className="h-4 w-4" /> {busy ? 'Menyimpan...' : 'Simpan Pengaturan'}</Button>
  </form>;
}

export function UsersPage() {
  const { actor, toast } = useApp();
  const users = useLiveQuery(() => db.users.filter((u) => !u.deleted_at).toArray(), [], []) as User[];
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ username: '', displayName: '', password: '', role: 'GURU' as User['role'], nip: '', email: '' });
  const [resetFor, setResetFor] = React.useState<User | null>(null);
  const [newPass, setNewPass] = React.useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(form, actor);
      toast('Akun berhasil dibuat dan akan disinkronkan.', 'success');
      setOpen(false); setForm({ username: '', displayName: '', password: '', role: 'GURU', nip: '', email: '' });
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
  };

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-extrabold text-slate-900">Pengguna & Role</h2><p className="text-sm text-slate-500">Kelola akun admin, TU, dan guru.</p></div>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Tambah Akun</Button></div>
    <div className="grid gap-3 sm:grid-cols-3">
      {(['ADMIN', 'TU', 'GURU'] as const).map((r) => <Card key={r}><CardContent><p className="text-2xl font-extrabold">{users.filter((u) => u.role === r).length}</p><p className="text-xs text-slate-500">{r}</p></CardContent></Card>)}
    </div>
    <Card><CardContent>
      <DataTable rows={users} searchKeys={['username', 'display_name', 'role']} columns={[
        { key: 'display_name', label: 'Nama', render: (u) => <><span className="font-semibold">{u.display_name}</span><span className="block text-xs text-slate-400">@{u.username}</span></> },
        { key: 'role', label: 'Role', render: (u) => <Badge variant={u.role === 'ADMIN' ? 'default' : u.role === 'TU' ? 'success' : 'muted'}>{u.role}</Badge> },
        { key: 'nip', label: 'NIP' }, { key: 'last_login_at', label: 'Login terakhir', render: (u) => formatDate(u.last_login_at, true) },
        { key: 'is_active', label: 'Status', render: (u) => <Badge variant={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
        { key: 'actions', label: 'Aksi', render: (u) => <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setResetFor(u)}><KeyRound className="h-3 w-3" /> Reset</Button>
          <Button size="sm" variant="ghost" onClick={() => void setUserActive(u.id, !u.is_active, actor)}>{u.is_active ? <ShieldOff className="h-3 w-3" /> : 'Aktifkan'}</Button>
        </div> }
      ]} />
    </CardContent></Card>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>Keterbatasan pencabutan akses:</b> akun yang dinonaktifkan tetap dapat dipakai pada perangkat offline hingga perangkat tersebut sinkron dan menerima status terbaru.</div>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>Tambah Akun</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Nama tampilan"><Input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label="Username"><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label="Role"><Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as User['role'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ADMIN">Admin</SelectItem><SelectItem value="TU">Tata Usaha</SelectItem><SelectItem value="GURU">Guru</SelectItem></SelectContent></Select></Field>
        <Field label="NIP"><Input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password sementara" hint="Minimal 8 karakter"><Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit">Simpan</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>

    <Dialog open={!!resetFor} onOpenChange={(v) => !v && setResetFor(null)}><DialogContent>
      <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>{resetFor?.display_name}</DialogDescription></DialogHeader>
      <Field label="Password baru"><Input type="password" minLength={8} value={newPass} onChange={(e) => setNewPass(e.target.value)} /></Field>
      <DialogFooter><Button onClick={async () => { if (!resetFor) return; try { await resetPassword(resetFor.id, newPass, actor); toast('Password berhasil direset.', 'success'); setResetFor(null); setNewPass(''); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } }}>Reset Password</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

export function DevicesPage() {
  const { actor, toast, sync, device: currentDevice } = useApp();
  const devices = useLiveQuery(() => db.device_registry.toArray(), [], []) as DeviceRegistry[];
  const [name, setName] = React.useState('');
  const [codeInfo, setCodeInfo] = React.useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const generate = async () => {
    try {
      const result = await createActivationCode(name || 'Perangkat Baru', actor);
      setCodeInfo(result);
      toast('Kode aktivasi dibuat. Sampaikan ke pengguna perangkat baru.', 'success');
    } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const setStatus = async (d: DeviceRegistry, status: DeviceRegistry['status']) => {
    await updateRecord('device_registry', d.id, { status } as never, actor, { details: `Status perangkat diubah menjadi ${status}` });
    toast(`Status perangkat menjadi ${status}.`, 'success');
  };

  const setRegistration = async (d: DeviceRegistry) => {
    for (const item of devices) if (item.is_registration_device) await updateRecord('device_registry', item.id, { is_registration_device: 0 } as never, actor, { audit: false });
    await updateRecord('device_registry', d.id, { is_registration_device: 1, status: 'ACTIVE' } as never, actor, { details: 'Menetapkan perangkat registrasi resmi' });
    await setSetting('registration_device_id', d.id);
    await logAudit('DEVICE.REGISTRATION_SET', 'device_registry', d.id, actor, 'Perangkat registrasi resmi ditetapkan', 'CRITICAL');
    toast('Perangkat registrasi resmi diperbarui.', 'success');
  };

  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Perangkat Terdaftar</h2><p className="text-sm text-slate-500">Registrasi dengan kode aktivasi, persetujuan, dan pengelolaan otorisasi.</p></div>
    <Card><CardHeader><CardTitle>Buat Kode Aktivasi</CardTitle></CardHeader><CardContent className="flex flex-wrap items-end gap-2">
      <div className="min-w-52 flex-1"><Field label="Nama perangkat yang akan didaftarkan"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. HP Bu Rina" /></Field></div>
      <Button onClick={() => void generate()}><Smartphone className="h-4 w-4" /> Buat Kode (48 jam)</Button>
      {codeInfo && <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-xs text-emerald-700">Kode aktivasi (tampil sekali):</p>
        <p className="select-all font-mono text-lg font-bold tracking-wider text-emerald-900">{codeInfo.code}</p>
        <p className="text-[11px] text-emerald-700">Berlaku sampai {formatDate(codeInfo.expires_at, true)} WIB</p>
      </div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Daftar Perangkat ({devices.length})</CardTitle></CardHeader><CardContent>
      <DataTable rows={devices} searchKeys={['name', 'id', 'type']} columns={[
        { key: 'name', label: 'Nama', render: (d) => <><span className="font-semibold">{d.name}</span><span className="block font-mono text-[10px] text-slate-400">{d.id.slice(0, 12)}...</span></> },
        { key: 'type', label: 'Jenis' },
        { key: 'status', label: 'Status', render: (d) => <Badge variant={d.status === 'ACTIVE' ? 'success' : d.status === 'PENDING' ? 'warning' : 'danger'}>{d.status}</Badge> },
        { key: 'is_registration_device', label: 'Registrasi resmi', render: (d) => d.is_registration_device ? <Badge>Ya</Badge> : '-' },
        { key: 'initial_sync_done', label: 'Sinkron awal', render: (d) => d.initial_sync_done ? 'Selesai' : 'Belum' },
        { key: 'last_sync_at', label: 'Sync terakhir', render: (d) => formatDate(d.last_sync_at, true) },
        { key: 'app_version', label: 'Versi' },
        { key: 'actions', label: 'Aksi', render: (d) => <div className="flex flex-wrap gap-1">
          {d.status === 'PENDING' && <Button size="sm" variant="outline" onClick={() => void setStatus(d, 'ACTIVE')}>Setujui</Button>}
          {d.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => void setStatus(d, 'INACTIVE')}>Nonaktifkan</Button>}
          {d.status !== 'REVOKED' && <Button size="sm" variant="ghost" onClick={() => void setStatus(d, 'REVOKED')}>Cabut</Button>}
          {!d.is_registration_device && <Button size="sm" variant="ghost" onClick={() => void setRegistration(d)}>Jadikan Registrasi</Button>}
          {d.id === currentDevice?.id && <Button size="sm" variant="outline" onClick={async () => { setBusy(true); try { await sync(); } finally { setBusy(false); } }} disabled={busy}>Sinkron</Button>}
        </div> }
      ]} />
    </CardContent></Card>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Perangkat PENDING belum dapat mengakses seluruh data. Perangkat baru wajib melakukan sinkronisasi awal sebelum disetujui. Pencabutan akses bersifat eventual pada perangkat yang sedang offline.</div>
  </div>;
}

export function MasterDataPage() {
  const { actor, toast } = useApp();
  const types = useLiveQuery(() => db.letter_types.filter((t) => !t.deleted_at).toArray(), [], []) as LetterType[];
  const classes = useLiveQuery(() => db.letter_classifications.filter((c) => !c.deleted_at).toArray(), [], []) as LetterClassification[];
  const units = useLiveQuery(() => db.units.filter((u) => !u.deleted_at).toArray(), [], []) as Unit[];
  const [typeForm, setTypeForm] = React.useState({ name: '', code: '' });
  const [classForm, setClassForm] = React.useState({ name: '', code: '', retention_years: 5 });
  const [unitForm, setUnitForm] = React.useState({ name: '', code: '' });

  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Jenis & Klasifikasi</h2><p className="text-sm text-slate-500">Master data yang dipakai dalam penomoran dan agenda.</p></div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeader><CardTitle>Jenis Surat</CardTitle></CardHeader><CardContent className="space-y-2">
        {types.map((t) => <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-sm"><span className="flex-1">{t.name}</span><Badge variant="muted">{t.code}</Badge><Switch checked={!!t.is_active} onCheckedChange={(v) => void updateRecord('letter_types', t.id, { is_active: v ? 1 : 0 } as never, actor)} /><Button size="icon" variant="ghost" onClick={() => void softDelete('letter_types', t.id, actor)}><Trash2 className="h-3 w-3 text-red-500" /></Button></div>)}
        <div className="flex gap-1 pt-2"><Input placeholder="Nama jenis" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /><Input className="w-20" placeholder="Kode" value={typeForm.code} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} /><Button size="icon" onClick={async () => { if (!typeForm.name || !typeForm.code) return toast('Nama dan kode wajib diisi.', 'error'); await createRecord('letter_types', { ...typeForm, description: '', is_active: 1 }, actor); setTypeForm({ name: '', code: '' }); }}><Plus className="h-4 w-4" /></Button></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Klasifikasi</CardTitle></CardHeader><CardContent className="space-y-2">
        {classes.map((c) => <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-sm"><span className="flex-1">{c.name}</span><Badge variant="muted">{c.code}</Badge><Button size="icon" variant="ghost" onClick={() => void softDelete('letter_classifications', c.id, actor)}><Trash2 className="h-3 w-3 text-red-500" /></Button></div>)}
        <div className="grid grid-cols-2 gap-1 pt-2"><Input placeholder="Nama" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /><Input placeholder="Kode" value={classForm.code} onChange={(e) => setClassForm({ ...classForm, code: e.target.value.toUpperCase() })} /><Input type="number" placeholder="Retensi (tahun)" value={classForm.retention_years} onChange={(e) => setClassForm({ ...classForm, retention_years: Number(e.target.value) })} /><Button onClick={async () => { if (!classForm.name) return; await createRecord('letter_classifications', { ...classForm, description: '' }, actor); setClassForm({ name: '', code: '', retention_years: 5 }); }}>Tambah</Button></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Unit Kerja</CardTitle></CardHeader><CardContent className="space-y-2">
        {units.map((u) => <div key={u.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-sm"><span className="flex-1">{u.name}</span><Badge variant="muted">{u.code}</Badge><Button size="icon" variant="ghost" onClick={() => void softDelete('units', u.id, actor)}><Trash2 className="h-3 w-3 text-red-500" /></Button></div>)}
        <div className="flex gap-1 pt-2"><Input placeholder="Nama unit" value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} /><Input className="w-20" placeholder="Kode" value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value.toUpperCase() })} /><Button size="icon" onClick={async () => { if (!unitForm.name) return; await createRecord('units', unitForm, actor); setUnitForm({ name: '', code: '' }); }}><Plus className="h-4 w-4" /></Button></div>
      </CardContent></Card>
    </div>
  </div>;
}

export function TemplatesPage() {
  const { actor, toast } = useApp();
  const templates = useLiveQuery(() => db.letter_templates.filter((t) => !t.deleted_at).toArray(), [], []);
  const types = useLiveQuery(() => db.letter_types.toArray(), [], []);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: '', type_id: '', content: '', description: '' });

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-extrabold text-slate-900">Template Surat</h2><p className="text-sm text-slate-500">Template teks dengan variabel {`{PARAGRAPH_1}`} dan {`{PARAGRAPH_2}`}.</p></div>
      <Button onClick={() => { setEditing(null); setForm({ name: '', type_id: '', content: '<p>{PARAGRAPH_1}</p><p>{PARAGRAPH_2}</p>', description: '' }); }}><Plus className="h-4 w-4" /> Template Baru</Button></div>
    {editing && <Card><CardHeader><CardTitle>Edit Template</CardTitle></CardHeader><CardContent className="grid gap-3">
      <Field label="Nama"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Jenis surat"><Select value={form.type_id} onValueChange={(v) => setForm({ ...form, type_id: v })}><SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger><SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Konten HTML"><Textarea className="min-h-52 font-mono text-xs" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
      <div className="flex gap-2"><Button onClick={async () => { try { if (editing === 'new') await createRecord('letter_templates', form, actor); else await updateRecord('letter_templates', editing, form, actor); toast('Template disimpan.', 'success'); setEditing(null); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } }}>Simpan</Button><Button variant="outline" onClick={() => setEditing(null)}>Batal</Button></div>
    </CardContent></Card>}
    <Card><CardContent><DataTable rows={templates || []} searchKeys={['name']} columns={[
      { key: 'name', label: 'Nama Template' },
      { key: 'type', label: 'Jenis', render: (t) => types.find((x) => x.id === t.type_id)?.name || 'Umum' },
      { key: 'actions', label: 'Aksi', render: (t) => <div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => { setEditing(t.id); setForm({ name: t.name, type_id: t.type_id, content: t.content, description: t.description }); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void softDelete('letter_templates', t.id, actor)}>Hapus</Button></div> }
    ]} /></CardContent></Card>
  </div>;
}
