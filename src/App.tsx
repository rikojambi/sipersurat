import * as React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { AppProvider, ToastViewport, useApp } from '@/context/AppContext';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui';
import { DeviceRegistrationPage, LoginPage, SetupPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/Dashboard';
import { IncomingLettersPage } from '@/pages/IncomingLetters';
import { OutgoingLettersPage } from '@/pages/OutgoingLetters';
import { DispositionsPage } from '@/pages/Dispositions';
import { AgendaPage, ArchivePage } from '@/pages/AgendaArchive';
import { ReportsPage } from '@/pages/Reports';
import { MasterDataPage, SchoolSettingsPage, DevicesPage, TemplatesPage, UsersPage } from '@/pages/settings/SettingsCore';
import { AuditPage, BackupPage, ConflictsPage, NumberingPage, SyncPage } from '@/pages/settings/SettingsOps';

function Loading() {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600">
    <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
    <p className="text-sm font-semibold">Membuka database lokal SIPERSURAT...</p>
  </div>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, device, loading } = useApp();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (device?.status === 'REVOKED' || device?.status === 'INACTIVE') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-600" />
        <h2 className="text-lg font-bold text-slate-900">Akses perangkat dicabut</h2>
        <p className="mt-2 text-sm text-slate-600">Perangkat ini tidak lagi diizinkan mengakses data. Hubungi administrator sekolah.</p>
        <Button className="mt-4" onClick={() => { localStorage.removeItem('sipersurat_session_user'); window.location.href = '/login'; }}>Keluar</Button>
      </div>
    </div>;
  }
  if (device?.status === 'PENDING' && user.role !== 'ADMIN') return <Navigate to="/registrasi-perangkat" replace />;
  return <>{children}</>;
}

export default function App() {
  return <AppProvider>
    {/* Toast tampil di semua halaman, termasuk login/setup/registrasi yang berada di luar Layout. */}
    <ToastViewport />
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/registrasi-perangkat" element={<DeviceRegistrationPage />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<DashboardPage />} />
          <Route path="surat-masuk" element={<IncomingLettersPage />} />
          <Route path="surat-keluar" element={<OutgoingLettersPage />} />
          <Route path="disposisi" element={<DispositionsPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="arsip" element={<ArchivePage />} />
          <Route path="laporan" element={<ReportsPage />} />
          <Route path="pengaturan" element={<SchoolSettingsPage />} />
          <Route path="pengaturan/pengguna" element={<UsersPage />} />
          <Route path="pengaturan/perangkat" element={<DevicesPage />} />
          <Route path="pengaturan/master" element={<MasterDataPage />} />
          <Route path="pengaturan/template" element={<TemplatesPage />} />
          <Route path="pengaturan/penomoran" element={<NumberingPage />} />
          <Route path="pengaturan/sinkronisasi" element={<SyncPage />} />
          <Route path="pengaturan/backup" element={<BackupPage />} />
          <Route path="pengaturan/konflik" element={<ConflictsPage />} />
          <Route path="pengaturan/audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AppProvider>;
}
