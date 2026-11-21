import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CloudOff, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button, Card, CardContent, Field, Input } from '@/components/ui';
import { hasUsers } from '@/lib/auth';
import { redeemActivationCode } from '@/lib/device';
import { getDevice } from '@/lib/device';

function AuthShell({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 via-blue-900 to-slate-900 px-4 py-10">
    <div className="w-full max-w-md">
      <div className="mb-6 text-center text-white">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-extrabold shadow-lg">S</div>
        <h1 className="text-2xl font-extrabold tracking-wide">SIPERSURAT</h1>
        <p className="mt-1 text-xs text-blue-200">SMKN 6 Muaro Jambi · {subtitle}</p>
      </div>
      {children}
      <p className="mt-6 text-center text-[11px] text-slate-400">Disusun oleh Riko Hardona · Agen pengembang OpenCode</p>
    </div>
  </div>;
}

export function SetupPage() {
  const { setupAdmin, toast } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ username: 'admin', displayName: 'Administrator', password: '', confirm: '', schoolName: 'SMKN 6 Muaro Jambi' });
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return toast('Password minimal 8 karakter.', 'error');
    if (form.password !== form.confirm) return toast('Konfirmasi password tidak cocok.', 'error');
    setBusy(true);
    try {
      await setupAdmin(form);
      toast('Akun administrator dibuat. Perangkat ini ditetapkan sebagai perangkat registrasi resmi.', 'success');
      navigate('/');
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };
  return <AuthShell subtitle="Pembuatan akun awal">
    <Card>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800"><ShieldCheck className="h-4 w-4 shrink-0" /><p>Akun admin dibuat sekali saja dan disimpan lokal. Password di-hash dengan PBKDF2-SHA256. Data tidak dikirim ke server.</p></div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nama sekolah"><Input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} /></Field>
          <Field label="Username admin"><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="Nama tampilan"><Input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
          <Field label="Password" hint="Minimal 8 karakter. Simpan di tempat aman; tidak dapat dikembalikan."><Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Konfirmasi password"><Input required type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
          <Button className="w-full" disabled={busy} type="submit">{busy ? 'Memproses...' : 'Buat Akun & Mulai'} <ArrowRight className="h-4 w-4" /></Button>
        </form>
      </CardContent>
    </Card>
  </AuthShell>;
}

export function LoginPage() {
  const { login, toast, user, refresh } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [needSetup, setNeedSetup] = React.useState(false);

  React.useEffect(() => { void hasUsers().then((v) => setNeedSetup(!v)); void refresh(); }, [refresh]);
  React.useEffect(() => { if (user) navigate('/', { replace: true }); }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await login(username, password); toast('Selamat datang kembali.', 'success'); navigate('/'); }
    catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };
  return <AuthShell subtitle="Masuk ke aplikasi">
    <Card>
      <CardContent className="space-y-4">
        {needSetup && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Belum ada akun. <button className="font-bold underline" onClick={() => navigate('/setup')}>Buat akun administrator</button></div>}
        <form onSubmit={submit} className="space-y-3">
          <Field label="Username"><Input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
          <Field label="Password"><Input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button className="w-full" disabled={busy} type="submit"><LockKeyhole className="h-4 w-4" /> {busy ? 'Memeriksa...' : 'Masuk'}</Button>
        </form>
        <div className="flex gap-2 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600"><CloudOff className="h-4 w-4 shrink-0" /><p>Aplikasi tetap bekerja offline. Data tersimpan di perangkat ini dan tidak dihapus saat logout.</p></div>
        <button className="w-full text-center text-xs font-semibold text-blue-700 hover:underline" onClick={() => navigate('/registrasi-perangkat')}>Registrasi perangkat baru →</button>
      </CardContent>
    </Card>
  </AuthShell>;
}

export function DeviceRegistrationPage() {
  const { toast, refresh, sync } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [device, setDevice] = React.useState<Awaited<ReturnType<typeof getDevice>>>(undefined);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { void getDevice().then(setDevice); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await redeemActivationCode(code, name || undefined);
      toast('Perangkat berhasil didaftarkan. Lakukan sinkronisasi awal.', 'success');
      await refresh();
      setDevice(await getDevice());
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };

  const doInitialSync = async () => {
    setBusy(true);
    try { await sync(); setDevice(await getDevice()); }
    catch { /* toast sudah ditampilkan */ }
    finally { setBusy(false); }
  };

  return <AuthShell subtitle="Registrasi perangkat">
    <Card>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-800"><Smartphone className="h-4 w-4 shrink-0" /><p>Perangkat baru tidak otomatis mendapat akses. Masukkan kode aktivasi yang dibuat admin (berlaku terbatas) lalu lakukan sinkronisasi awal.</p></div>
        {device && <div className="rounded-lg border border-slate-200 p-3 text-xs">
          <p><b>Device ID:</b> {device.id}</p>
          <p><b>Nama:</b> {device.name}</p>
          <p><b>Status:</b> {device.status} · <b>Sinkron awal:</b> {device.initial_sync_done ? 'Selesai' : 'Belum'}</p>
        </div>}
        {(!device || device.status === 'PENDING') && <form onSubmit={submit} className="space-y-3">
          <Field label="Kode aktivasi dari admin"><Input required value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Masukkan kode aktivasi" /></Field>
          <Field label="Nama perangkat (opsional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. HP Bu Rina" /></Field>
          <Button disabled={busy} className="w-full" type="submit">Daftarkan Perangkat</Button>
        </form>}
        {device?.status === 'PENDING' && <div className="space-y-2">
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" /><p>Status perangkat menunggu. Hubungkan Google Drive (admin) lalu jalankan sinkronisasi awal; setelah itu admin menyetujui perangkat ini.</p></div>
          <Button variant="outline" className="w-full" onClick={doInitialSync} disabled={busy}>Jalankan Sinkronisasi Awal</Button>
        </div>}
        {device?.status === 'REVOKED' && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">Otorisasi perangkat ini dicabut. Hubungi administrator.</p>}
        <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>← Kembali ke masuk</Button>
      </CardContent>
    </Card>
  </AuthShell>;
}
