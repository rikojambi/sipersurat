import * as React from 'react';
import { db, getSetting, requestPersistentStorage, storageEstimate } from '@/db/schema';
import { getCurrentUser, login as doLogin, logout as doLogout, setupAdmin as doSetupAdmin } from '@/lib/auth';
import { getDevice, touchDevice, getDeviceId, markInitialSyncDone } from '@/lib/device';
import { getDriveClient } from '@/lib/drive';
import { pendingChangeCount, syncNow, unresolvedConflicts } from '@/lib/syncManager';
import { backupSlotsWIB, clearBackupPassphrase, hasBackupPassphrase, isBackupDue, runBackupIfDue } from '@/lib/backup';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import type { Actor } from '@/db/repository';
import type { DeviceRegistry, User } from '@/types';

export interface Toast { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }

interface AppContextValue {
  user: User | null;
  device: DeviceRegistry | null;
  loading: boolean;
  online: boolean;
  pending: number;
  conflicts: number;
  storage: { usage: number; quota: number; percent: number };
  persistent: boolean;
  lastSync: string;
  lastBackup: string;
  backupDue: boolean;
  driveConnected: boolean;
  passphraseReady: boolean;
  toasts: Toast[];
  actor: Actor;
  refresh: () => Promise<void>;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  setupAdmin: (input: { username: string; displayName: string; password: string; schoolName?: string }) => Promise<void>;
  sync: () => Promise<void>;
  backup: () => Promise<void>;
  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  unlockPassphrase: (value: string) => void;
  lockPassphrase: () => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [device, setDevice] = React.useState<DeviceRegistry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [online, setOnline] = React.useState(navigator.onLine);
  const [pending, setPending] = React.useState(0);
  const [conflicts, setConflicts] = React.useState(0);
  const [storage, setStorage] = React.useState({ usage: 0, quota: 0, percent: 0 });
  const [persistent, setPersistent] = React.useState(false);
  const [lastSync, setLastSync] = React.useState('');
  const [lastBackup, setLastBackup] = React.useState('');
  const [driveConnected, setDriveConnected] = React.useState(false);
  const [passphraseReady, setPassphraseReady] = React.useState(hasBackupPassphrase());
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [syncBusy, setSyncBusy] = React.useState(false);

  const toast = React.useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const dismissToast = React.useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = React.useCallback(async () => {
    try {
      const [u, d, p, c, st, ps, ls, lb] = await Promise.all([
        getCurrentUser(), getDevice(), pendingChangeCount(), unresolvedConflicts(),
        storageEstimate(), requestPersistentStorage(), getSetting('last_sync_at'), getSetting('last_backup_at')
      ]);
      setUser(u);
      setDevice(d || null);
      setPending(p);
      setConflicts(c);
      setStorage(st);
      setPersistent(ps);
      setLastSync(ls);
      setLastBackup(lb);
      const drive = await getDriveClient();
      setDriveConnected(drive.isConnected);
      if (d && d.status !== 'REVOKED') await touchDevice();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [toast]);

  React.useEffect(() => {
    void refresh().finally(() => setLoading(false));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.clearInterval(timer); };
  }, [refresh]);

  const actor: Actor = React.useMemo(() => ({
    userId: user?.id || 'system',
    userName: user?.display_name || 'Sistem',
    deviceId: getDeviceId()
  }), [user]);

  const login = React.useCallback(async (u: string, p: string) => {
    await doLogin(u, p);
    await refresh();
  }, [refresh]);

  const logout = React.useCallback(async () => {
    await doLogout(actor);
    clearBackupPassphrase();
    setPassphraseReady(false);
    await refresh();
  }, [actor, refresh]);

  const setupAdmin = React.useCallback(async (input: { username: string; displayName: string; password: string; schoolName?: string }) => {
    await doSetupAdmin(input);
    await refresh();
  }, [refresh]);

  const sync = React.useCallback(async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const result = await syncNow(actor);
      toast(result.message, 'success');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      await refresh();
      throw e;
    } finally { setSyncBusy(false); }
  }, [actor, refresh, syncBusy, toast]);

  const backup = React.useCallback(async () => {
    try {
      const result = await runBackupIfDue(actor, device?.name || 'Perangkat');
      toast(result.message || 'Backup berhasil.', 'success');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      throw e;
    }
  }, [actor, device?.name, refresh, toast]);

  React.useEffect(() => {
    if (!user) return;
    const checkSchedule = () => { void (async () => {
      try { await runBackupIfDue(actor, device?.name || 'Perangkat'); await refresh(); }
      catch { /* status ditampilkan di halaman backup */ }
    })(); };
    const timer = window.setInterval(checkSchedule, 60_000);
    document.addEventListener('visibilitychange', checkSchedule);
    checkSchedule();
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', checkSchedule); };
  }, [user, actor, device?.name, refresh]);

  const value: AppContextValue = {
    user, device, loading, online, pending, conflicts, storage, persistent,
    lastSync, lastBackup, backupDue: isBackupDue(lastBackup).due, driveConnected,
    passphraseReady, toasts, actor, refresh, login, logout, setupAdmin, sync, backup,
    toast, dismissToast,
    unlockPassphrase: (v) => { setPassphraseReady(v.length > 0); },
    lockPassphrase: () => { clearBackupPassphrase(); setPassphraseReady(false); }
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
}

export function ToastViewport() {
  const { toasts, dismissToast } = useApp();
  const icons = { success: CircleCheck, error: CircleAlert, warning: CircleAlert, info: Info };
  const colors = { success: 'text-emerald-600', error: 'text-red-600', warning: 'text-amber-600', info: 'text-blue-600' };
  return <div className="fixed bottom-20 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 md:bottom-4">
    {toasts.map((t) => {
      const Icon = icons[t.type];
      return <div key={t.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg animate-fade-in">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${colors[t.type]}`} />
        <p className="flex-1 text-sm text-slate-700">{t.message}</p>
        <button onClick={() => dismissToast(t.id)} className="text-slate-400 hover:text-slate-700" aria-label="Tutup notifikasi"><X className="h-4 w-4" /></button>
      </div>;
    })}
  </div>;
}

export { backupSlotsWIB, db, markInitialSyncDone };
