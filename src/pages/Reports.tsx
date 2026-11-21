import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileBarChart, Printer } from 'lucide-react';
import { db } from '@/db/schema';
import { Button, Card, CardContent, CardHeader, CardTitle, DataTable, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from '@/components/ui';
import { buildTablePdf, exportExcel, printBlob } from '@/lib/pdf';
import { formatDate } from '@/lib/utils';

const REPORT_TYPES = [
  { id: 'MASUK', label: 'Laporan Surat Masuk' },
  { id: 'KELUAR', label: 'Laporan Surat Keluar' },
  { id: 'DISPOSISI', label: 'Laporan Disposisi' },
  { id: 'JENIS', label: 'Laporan per Jenis Surat' },
  { id: 'BULANAN', label: 'Laporan Bulanan' },
  { id: 'TAHUNAN', label: 'Laporan Tahunan' },
  { id: 'PENGGUNA', label: 'Laporan Aktivitas Pengguna' },
  { id: 'SYNC', label: 'Laporan Status Sinkronisasi' },
  { id: 'BACKUP', label: 'Laporan Backup' }
] as const;

type ReportId = typeof REPORT_TYPES[number]['id'];
type Row = Record<string, string | number>;

export function ReportsPage() {
  const incoming = useLiveQuery(() => db.incoming_letters.filter((r) => !r.deleted_at).toArray(), [], []);
  const outgoing = useLiveQuery(() => db.outgoing_letters.filter((r) => !r.deleted_at).toArray(), [], []);
  const dispositions = useLiveQuery(() => db.dispositions.filter((r) => !r.deleted_at).toArray(), [], []);
  const audits = useLiveQuery(() => db.audit_logs.reverse().toArray(), [], []);
  const syncHistory = useLiveQuery(() => db.sync_history.reverse().toArray(), [], []);
  const backups = useLiveQuery(() => db.backup_history.reverse().toArray(), [], []);
  const types = useLiveQuery(() => db.letter_types.toArray(), [], []);
  const [type, setType] = React.useState<ReportId>('MASUK');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const inPeriod = (d: string) => (!from || d >= from) && (!to || d <= to);

  const { rows, columns } = React.useMemo((): { rows: Row[]; columns: Array<{ key: string; label: string; width?: number }> } => {
    const baseIn = (incoming || []).filter((r) => inPeriod(r.received_date));
    const baseOut = (outgoing || []).filter((r) => inPeriod(r.letter_date));
    switch (type) {
      case 'MASUK':
        return { rows: baseIn.map((r) => ({ 'No. Agenda': r.agenda_number, 'Tgl Diterima': formatDate(r.received_date), 'No. Surat': r.sender_number, Pengirim: r.institution, Perihal: r.subject, Sifat: r.nature, Status: r.status })), columns: [{ key: 'No. Agenda', label: 'No. Agenda' }, { key: 'Tgl Diterima', label: 'Tgl Diterima' }, { key: 'No. Surat', label: 'No. Surat' }, { key: 'Pengirim', label: 'Pengirim' }, { key: 'Perihal', label: 'Perihal' }, { key: 'Status', label: 'Status' }] };
      case 'KELUAR':
        return { rows: baseOut.map((r) => ({ 'No. Surat': r.official_number || '-', 'Tgl Surat': formatDate(r.letter_date), Tujuan: r.destination, Perihal: r.subject, Jenis: types.find((t) => t.id === r.type_id)?.name || '-', Penandatangan: r.signer, Status: r.status })), columns: [{ key: 'No. Surat', label: 'No. Surat' }, { key: 'Tgl Surat', label: 'Tgl Surat' }, { key: 'Tujuan', label: 'Tujuan' }, { key: 'Perihal', label: 'Perihal' }, { key: 'Status', label: 'Status' }] };
      case 'DISPOSISI':
        return { rows: (dispositions || []).filter((r) => inPeriod(r.date)).map((r) => ({ 'No. Disposisi': r.number, Tanggal: formatDate(r.date), Instruksi: r.instruction_type, Petunjuk: r.instructions, 'Batas Waktu': formatDate(r.due_date), Status: r.status })), columns: [{ key: 'No. Disposisi', label: 'No. Disposisi' }, { key: 'Tanggal', label: 'Tanggal' }, { key: 'Instruksi', label: 'Instruksi' }, { key: 'Petunjuk', label: 'Petunjuk' }, { key: 'Status', label: 'Status' }] };
      case 'JENIS': {
        const map = new Map<string, number>();
        for (const l of baseOut) map.set(types.find((t) => t.id === l.type_id)?.name || 'Lainnya', (map.get(types.find((t) => t.id === l.type_id)?.name || 'Lainnya') || 0) + 1);
        return { rows: [...map].map(([jenis, jumlah]) => ({ Jenis: jenis, Jumlah: jumlah })), columns: [{ key: 'Jenis', label: 'Jenis Surat' }, { key: 'Jumlah', label: 'Jumlah' }] };
      }
      case 'BULANAN': {
        const map = new Map<string, { masuk: number; keluar: number }>();
        for (const l of baseIn) { const k = formatDate(l.received_date).slice(3); const v = map.get(k) || { masuk: 0, keluar: 0 }; v.masuk++; map.set(k, v); }
        for (const l of baseOut) { const k = formatDate(l.letter_date).slice(3); const v = map.get(k) || { masuk: 0, keluar: 0 }; v.keluar++; map.set(k, v); }
        return { rows: [...map].map(([bulan, v]) => ({ Bulan: bulan, 'Surat Masuk': v.masuk, 'Surat Keluar': v.keluar })), columns: [{ key: 'Bulan', label: 'Bulan' }, { key: 'Surat Masuk', label: 'Surat Masuk' }, { key: 'Surat Keluar', label: 'Surat Keluar' }] };
      }
      case 'TAHUNAN': {
        const years = new Set([...baseIn.map((r) => r.received_date.slice(0, 4)), ...baseOut.map((r) => r.letter_date.slice(0, 4))]);
        return { rows: [...years].map((year) => ({ Tahun: year, 'Surat Masuk': baseIn.filter((r) => r.received_date.startsWith(year)).length, 'Surat Keluar': baseOut.filter((r) => r.letter_date.startsWith(year)).length })), columns: [{ key: 'Tahun', label: 'Tahun' }, { key: 'Surat Masuk', label: 'Surat Masuk' }, { key: 'Surat Keluar', label: 'Surat Keluar' }] };
      }
      case 'PENGGUNA':
        return { rows: (audits || []).filter((a) => inPeriod(a.at)).slice(0, 300).map((a) => ({ Waktu: formatDate(a.at, true), Pengguna: a.actor_name, Aksi: a.action, Detail: a.details, Perangkat: a.device_id.slice(0, 8) })), columns: [{ key: 'Waktu', label: 'Waktu' }, { key: 'Pengguna', label: 'Pengguna' }, { key: 'Aksi', label: 'Aksi' }, { key: 'Detail', label: 'Detail' }] };
      case 'SYNC':
        return { rows: (syncHistory || []).map((s) => ({ Waktu: formatDate(s.started_at, true), Arah: s.direction, Status: s.status, Paket: s.packages, Rekam: s.records, Keterangan: s.message, Perangkat: s.device_id.slice(0, 8) })), columns: [{ key: 'Waktu', label: 'Waktu' }, { key: 'Arah', label: 'Arah' }, { key: 'Status', label: 'Status' }, { key: 'Paket', label: 'Paket' }, { key: 'Rekam', label: 'Rekam' }, { key: 'Keterangan', label: 'Keterangan' }] };
      case 'BACKUP':
        return { rows: (backups || []).map((b) => ({ Waktu: formatDate(b.created_at, true), Perangkat: b.device_name, Jenis: b.type, Status: b.status, Ukuran: `${(b.size / 1024 / 1024).toFixed(2)} MB`, Rekam: b.record_count, Dokumen: b.document_count })), columns: [{ key: 'Waktu', label: 'Waktu' }, { key: 'Perangkat', label: 'Perangkat' }, { key: 'Jenis', label: 'Jenis' }, { key: 'Status', label: 'Status' }, { key: 'Ukuran', label: 'Ukuran' }, { key: 'Rekam', label: 'Rekam' }] };
    }
  }, [type, from, to, incoming, outgoing, dispositions, audits, syncHistory, backups, types]);

  const title = REPORT_TYPES.find((r) => r.id === type)?.label || 'Laporan';
  const periodText = `${from ? formatDate(from) : 'awal'} s/d ${to ? formatDate(to) : 'sekarang'}`;
  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Laporan</h2><p className="text-sm text-slate-500">Cetak, PDF, dan Excel untuk seluruh modul.</p></div>
    <Card><CardContent className="flex flex-wrap gap-2">
      <Select value={type} onValueChange={(v) => setType(v as ReportId)}><SelectTrigger className="w-64"><SelectValue /></SelectTrigger><SelectContent>{REPORT_TYPES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}</SelectContent></Select>
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Dari tanggal" />
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Sampai tanggal" />
      <Button variant="outline" onClick={() => { printBlob(buildTablePdf(title, `Periode ${periodText} · SMKN 6 Muaro Jambi`, columns, rows)); }}><Printer className="h-4 w-4" /> Cetak / PDF</Button>
      <Button variant="outline" onClick={() => exportExcel(`laporan-${type.toLowerCase()}`, [{ name: 'Laporan', rows }])}><Download className="h-4 w-4" /> Excel</Button>
    </CardContent></Card>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="flex items-center gap-2"><FileBarChart className="h-5 w-5 text-blue-700" /> {title}</CardTitle><span className="text-xs text-slate-500">Periode {periodText} · {rows.length} baris</span></CardHeader>
      <CardContent>
        <DataTable rows={rows.map((r, i) => ({ id: String(i), ...r }))} searchKeys={Object.keys(columns)} columns={columns.map((c) => ({ key: c.key, label: c.label, render: (r: { id: string } & Row) => String(r[c.key] ?? '-') }))} empty="Tidak ada data pada periode ini." />
      </CardContent>
    </Card>
  </div>;
}
