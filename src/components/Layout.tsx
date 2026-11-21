import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive, BookOpen, Building2, Cloud, CloudOff, Database, FileText,
  FileOutput, History, LayoutDashboard, ListChecks, LogOut, Menu, RefreshCw,
  Settings, ShieldCheck, Smartphone, Users, X, AlertTriangle, HardDrive, KeyRound, FileClock
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui';
import { cn, formatBytes, initial } from '@/lib/utils';
import type { RoleName } from '@/types';

interface NavItem { to: string; label: string; icon: React.ElementType; roles?: RoleName[] }

const mainNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/surat-masuk', label: 'Surat Masuk', icon: FileText },
  { to: '/surat-keluar', label: 'Surat Keluar', icon: FileOutput },
  { to: '/disposisi', label: 'Disposisi', icon: ListChecks },
  { to: '/agenda', label: 'Buku Agenda', icon: BookOpen },
  { to: '/arsip', label: 'Arsip Digital', icon: Archive },
  { to: '/laporan', label: 'Laporan', icon: History }
];

const settingsNav: NavItem[] = [
  { to: '/pengaturan', label: 'Identitas Sekolah', icon: Building2, roles: ['ADMIN'] },
  { to: '/pengaturan/pengguna', label: 'Pengguna & Role', icon: Users, roles: ['ADMIN'] },
  { to: '/pengaturan/perangkat', label: 'Perangkat Terdaftar', icon: Smartphone, roles: ['ADMIN'] },
  { to: '/pengaturan/master', label: 'Jenis & Klasifikasi', icon: FileClock, roles: ['ADMIN'] },
  { to: '/pengaturan/template', label: 'Template Surat', icon: FileText, roles: ['ADMIN'] },
  { to: '/pengaturan/penomoran', label: 'Penomoran Resmi', icon: KeyRound, roles: ['ADMIN', 'TU'] },
  { to: '/pengaturan/sinkronisasi', label: 'Google Drive & Sync', icon: Cloud, roles: ['ADMIN'] },
  { to: '/pengaturan/backup', label: 'Backup & Restore', icon: Database, roles: ['ADMIN'] },
  { to: '/pengaturan/konflik', label: 'Konflik Sinkronisasi', icon: AlertTriangle, roles: ['ADMIN'] },
  { to: '/pengaturan/audit', label: 'Audit Log', icon: ShieldCheck, roles: ['ADMIN'] }
];

function NavGroup({ items, title }: { items: NavItem[]; title?: string }) {
  const { user } = useApp();
  const visible = items.filter((i) => !i.roles || i.roles.includes(user?.role || 'GURU'));
  if (!visible.length) return null;
  return <div className="mb-4">
    {title && <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>}
    {visible.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn(
        'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isActive ? 'bg-blue-800 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
      )}>
        <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span>
      </NavLink>
    ))}
  </div>;
}

function StatusPill({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', color)}>{children}</span>;
}

export function Layout() {
  const { user, online, pending, conflicts, storage, lastBackup, backupDue, driveConnected, sync, logout } = useApp();
  const [drawer, setDrawer] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [syncing, setSyncing] = React.useState(false);

  React.useEffect(() => { setDrawer(false); }, [location.pathname]);

  const doSync = async () => {
    setSyncing(true);
    try { await sync(); } catch { /* toast ditampilkan context */ } finally { setSyncing(false); }
  };

  const sidebar = <div className="flex h-full flex-col bg-navy-900 text-white">
    <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg font-extrabold">S</div>
      <div className="min-w-0">
        <p className="truncate text-base font-extrabold tracking-wide">SIPERSURAT</p>
        <p className="truncate text-[10px] text-slate-400">SMKN 6 Muaro Jambi</p>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <NavGroup items={mainNav} title="Menu Utama" />
      <NavGroup items={settingsNav} title="Pengaturan" />
    </div>
    <div className="border-t border-white/10 px-4 py-3 text-[10px] text-slate-400">
      <p>Local-first PWA · v1.0.0</p>
      <p>Disusun: Riko Hardona · OpenCode</p>
    </div>
  </div>;

  return <div className="min-h-screen bg-slate-50">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
    {drawer && <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-950/60" onClick={() => setDrawer(false)} />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{sidebar}</div>
      <button className="absolute right-3 top-3 rounded-lg bg-white/10 p-2 text-white" onClick={() => setDrawer(false)} aria-label="Tutup menu"><X /></button>
    </div>}

    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Buka menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-slate-800 sm:text-base">Sistem Informasi Pengelolaan Surat Masuk dan Surat Keluar</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusPill color={online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                {online ? <><Cloud className="h-3 w-3" /> Online</> : <><CloudOff className="h-3 w-3" /> Offline</>}
              </StatusPill>
              <StatusPill color={pending ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}>
                <Database className="h-3 w-3" /> {pending ? `${pending} belum tersinkron` : 'Lokal aktif'}
              </StatusPill>
              {conflicts > 0 && <StatusPill color="bg-red-50 text-red-700"><AlertTriangle className="h-3 w-3" /> {conflicts} konflik</StatusPill>}
              {storage.percent > 80 && <StatusPill color="bg-red-50 text-red-700"><HardDrive className="h-3 w-3" /> Storage {storage.percent.toFixed(0)}%</StatusPill>}
              <StatusPill color={backupDue ? 'bg-amber-50 text-amber-700' : lastBackup ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                <Database className="h-3 w-3" /> Backup {backupDue ? 'tertunda' : lastBackup ? 'aman' : 'belum ada'}
              </StatusPill>
              {driveConnected && <StatusPill color="bg-blue-50 text-blue-700"><Cloud className="h-3 w-3" /> Drive terhubung</StatusPill>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={doSync} disabled={syncing || !online} title="Sinkronisasi Google Drive">
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            <span className="hidden sm:inline">Sinkron</span>
          </Button>
          <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">{initial(user?.display_name || 'U')}</div>
            <div className="hidden max-w-[140px] xl:block">
              <p className="truncate text-xs font-bold text-slate-800">{user?.display_name}</p>
              <p className="text-[10px] text-slate-500">{user?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { await logout(); navigate('/login'); }} title="Keluar"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 pb-24 lg:pb-8">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {mainNav.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn('flex min-w-16 flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-semibold', isActive ? 'text-blue-800' : 'text-slate-500')}>
            <Icon className="h-5 w-5" /><span className="truncate">{label.split(' ')[0]}</span>
          </NavLink>
        ))}
        <NavLink to="/pengaturan" className={({ isActive }) => cn('flex min-w-16 flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-semibold', isActive ? 'text-blue-800' : 'text-slate-500')}>
          <Settings className="h-5 w-5" /><span>Setting</span>
        </NavLink>
      </nav>
    </div>

    {storage.quota > 0 && storage.percent > 80 && <div className="fixed bottom-20 right-4 z-40 max-w-sm rounded-xl border border-red-200 bg-white p-4 shadow-lg lg:bottom-4">
      <div className="flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
        <div><p className="text-sm font-bold text-red-700">Penyimpanan hampir penuh</p>
          <p className="text-xs text-slate-600">Terpakai {formatBytes(storage.usage)} dari {formatBytes(storage.quota)}. Segera jalankan backup dan hapus dokumen lama.</p></div>
      </div>
    </div>}
  </div>;
}
