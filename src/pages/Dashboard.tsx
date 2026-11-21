import * as React from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowRight, CloudOff, Database, FileCheck2, FileInput, FileOutput, ListChecks, RefreshCw } from 'lucide-react';
import { db } from '@/db/schema';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Disposition, IncomingLetter, OutgoingLetter } from '@/types';

function StatCard({ label, value, icon: Icon, tone, to }: { label: string; value: number | string; icon: React.ElementType; tone: string; to: string }) {
  return <Link to={to} className="group">
    <Card className="transition-transform hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}><Icon className="h-6 w-6" /></div>
        <div><p className="text-2xl font-extrabold text-slate-900">{value}</p><p className="text-xs font-medium text-slate-500">{label}</p></div>
        <ArrowRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1" />
      </CardContent>
    </Card>
  </Link>;
}

export function DashboardPage() {
  const { user, pending, conflicts, online, storage, lastSync, lastBackup, backupDue, device, sync } = useApp();
  const incoming = useLiveQuery(() => db.incoming_letters.filter((r) => !r.deleted_at).reverse().sortBy('created_at'), [], []);
  const outgoing = useLiveQuery(() => db.outgoing_letters.filter((r) => !r.deleted_at).reverse().sortBy('created_at'), [], []);
  const dispositions = useLiveQuery(() => db.dispositions.filter((r) => !r.deleted_at && r.status !== 'SELESAI').reverse().sortBy('created_at'), [], []);
  const [busy, setBusy] = React.useState(false);

  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const isThisMonth = (d: string) => { const x = new Date(d); return x.getMonth() === thisMonth && x.getFullYear() === thisYear; };
  const activeDispositions = (dispositions as Disposition[]).filter((d) => !d.deleted_at);
  const visibleIncoming = (incoming as IncomingLetter[]).filter((l) => user?.role !== 'GURU' || l.unit_id === user.unit_id || l.destination.includes(user.display_name));
  const visibleOutgoing = (outgoing as OutgoingLetter[]).filter((l) => user?.role !== 'GURU' || l.requested_by === user.id);

  const runSync = async () => {
    setBusy(true);
    try { await sync(); } catch { /* sudah ada toast */ } finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <div>
      <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Dashboard</h2>
      <p className="text-sm text-slate-500">Selamat datang, {user?.display_name}. Berikut ringkasan buku agenda surat.</p>
    </div>

    {(conflicts > 0 || !online || backupDue || (lastSync && Date.now() - new Date(lastSync).getTime() > 86400000)) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-900 space-y-1">
          <p className="font-bold">Perhatian status sistem</p>
          {conflicts > 0 && <p>· Ada {conflicts} konflik sinkronisasi yang perlu diselesaikan admin.</p>}
          {!online && <p>· Perangkat offline. Perubahan tetap tersimpan lokal dan akan dikirim saat online.</p>}
          {backupDue && <p>· Backup enam jam tertunda. Buka halaman Backup & Restore dan jalankan backup.</p>}
          {lastSync && Date.now() - new Date(lastSync).getTime() > 86400000 && <p>· Sinkronisasi terakhir lebih dari 24 jam. Status akun/perangkat mungkin belum mutakhir.</p>}
        </div>
      </div>
    </div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Surat masuk (bulan ini)" value={visibleIncoming.filter((l) => isThisMonth(l.received_date)).length} icon={FileInput} tone="bg-blue-100 text-blue-700" to="/surat-masuk" />
      <StatCard label="Surat keluar (bulan ini)" value={visibleOutgoing.filter((l) => isThisMonth(l.letter_date)).length} icon={FileOutput} tone="bg-indigo-100 text-indigo-700" to="/surat-keluar" />
      <StatCard label="Disposisi aktif" value={activeDispositions.length} icon={ListChecks} tone="bg-amber-100 text-amber-700" to="/disposisi" />
      <StatCard label="Belum tersinkron" value={pending} icon={RefreshCw} tone={pending ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'} to="/pengaturan/sinkronisasi" />
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Surat masuk terbaru</CardTitle><Link to="/surat-masuk" className="text-xs font-semibold text-blue-700">Lihat semua →</Link></CardHeader>
        <CardContent className="divide-y divide-slate-100 p-0">
          {visibleIncoming.slice(0, 6).map((l) => <div key={l.id} className="flex items-start gap-3 px-5 py-3">
            <div className="mt-0.5 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{l.agenda_number}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{l.subject}</p><p className="truncate text-xs text-slate-500">{l.institution || l.sender} · {formatDate(l.received_date)}</p></div>
            <Badge variant={l.status === 'SELESAI' ? 'success' : 'default'}>{l.status}</Badge>
          </div>)}
          {!visibleIncoming.length && <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada surat masuk.</p>}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Status perangkat</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">Nama</span><b className="text-slate-800">{device?.name || '-'}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge variant={device?.status === 'ACTIVE' ? 'success' : 'warning'}>{device?.status || '-'}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-500">Registrasi resmi</span><b>{device?.is_registration_device ? 'Ya' : 'Tidak'}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Sinkron terakhir</span><b>{formatDate(lastSync, true)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Backup terakhir</span><b>{formatDate(lastBackup, true)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Penyimpanan</span><b className={storage.percent > 80 ? 'text-red-600' : ''}>{storage.percent.toFixed(1)}%</b></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Aksi cepat</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Link to="/surat-masuk"><Button variant="outline" size="sm" className="w-full"><FileInput className="h-4 w-4" /> Surat Masuk</Button></Link>
            <Link to="/surat-keluar"><Button variant="outline" size="sm" className="w-full"><FileOutput className="h-4 w-4" /> Surat Keluar</Button></Link>
            <Button variant="outline" size="sm" onClick={runSync} disabled={!online || busy}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Sinkron</Button>
            <Link to="/pengaturan/backup"><Button variant="outline" size="sm" className="w-full"><Database className="h-4 w-4" /> Backup</Button></Link>
          </CardContent>
        </Card>
      </div>
    </div>

    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>Disposisi menunggu tindak lanjut</CardTitle><Link to="/disposisi" className="text-xs font-semibold text-blue-700">Lihat semua →</Link></CardHeader>
      <CardContent className="divide-y divide-slate-100 p-0">
        {activeDispositions.slice(0, 5).map((d) => <div key={d.id} className="flex items-center gap-3 px-5 py-3">
          <FileCheck2 className="h-4 w-4 text-amber-600" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.number} · {d.instruction_type}</p><p className="truncate text-xs text-slate-500">{d.instructions}</p></div>
          <Badge variant="warning">{d.status}</Badge>
        </div>)}
        {!activeDispositions.length && <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400"><CloudOff className="h-4 w-4" /> Tidak ada disposisi aktif.</div>}
      </CardContent>
    </Card>
    <p className="text-center text-[11px] text-slate-400">Zona waktu Asia/Jakarta · Format tanggal DD-MM-YYYY · Data tersimpan lokal di perangkat ini</p>
  </div>;
}
