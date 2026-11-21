import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { db } from '@/db/schema';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { buildTablePdf, exportExcel, printBlob } from '@/lib/pdf';
import { formatDate } from '@/lib/utils';
import type { DocumentArchive, IncomingLetter, OutgoingLetter } from '@/types';

const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function AgendaPage() {
  const incoming = useLiveQuery(() => db.incoming_letters.filter((r) => !r.deleted_at).toArray(), [], []) as IncomingLetter[];
  const outgoing = useLiveQuery(() => db.outgoing_letters.filter((r) => !r.deleted_at).toArray(), [], []) as OutgoingLetter[];
  const types = useLiveQuery(() => db.letter_types.toArray(), [], []);
  const [month, setMonth] = React.useState(String(new Date().getMonth() + 1));
  const [year, setYear] = React.useState(String(new Date().getFullYear()));

  const inRows = incoming.filter((l) => { const d = new Date(l.received_date); return String(d.getMonth() + 1) === month && String(d.getFullYear()) === year; });
  const outRows = outgoing.filter((l) => { const d = new Date(l.letter_date); return String(d.getMonth() + 1) === month && String(d.getFullYear()) === year && !!l.official_number; });
  const period = `${months[Number(month) - 1]} ${year}`;

  const printAgenda = (kind: 'MASUK' | 'KELUAR') => {
    const rows = kind === 'MASUK' ? inRows : outRows;
    const columns = kind === 'MASUK'
      ? [
          { key: 'agenda_number', label: 'No. Agenda', width: 25 },
          { key: 'received_date', label: 'Tgl Diterima', width: 25, render: (r: IncomingLetter) => formatDate(r.received_date) },
          { key: 'sender_number', label: 'No. Surat' },
          { key: 'letter_date', label: 'Tgl Surat', width: 25, render: (r: IncomingLetter) => formatDate(r.letter_date) },
          { key: 'institution', label: 'Pengirim' },
          { key: 'subject', label: 'Perihal' },
          { key: 'nature', label: 'Sifat', width: 18 }
        ]
      : [
          { key: 'official_number', label: 'No. Surat', width: 38 },
          { key: 'letter_date', label: 'Tgl Surat', width: 25, render: (r: OutgoingLetter) => formatDate(r.letter_date) },
          { key: 'destination', label: 'Tujuan' },
          { key: 'subject', label: 'Perihal' },
          { key: 'type', label: 'Jenis', width: 25, render: (r: OutgoingLetter) => types.find((t) => t.id === r.type_id)?.name || '-' },
          { key: 'signer', label: 'Penandatangan', width: 30 }
        ];
    printBlob(buildTablePdf(`Buku Agenda Surat ${kind}`, `Periode ${period} · SMKN 6 Muaro Jambi`, columns as never[], rows as never[]));
  };

  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Buku Agenda</h2><p className="text-sm text-slate-500">Rekapitulasi surat masuk dan surat keluar per periode.</p></div>
    <Card><CardContent className="flex flex-wrap gap-2">
      <Select value={month} onValueChange={setMonth}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{months.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select>
      <Select value={year} onValueChange={setYear}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
      <Input readOnly value={period} className="w-48" />
    </CardContent></Card>

    <Tabs defaultValue="masuk">
      <TabsList><TabsTrigger value="masuk">Surat Masuk ({inRows.length})</TabsTrigger><TabsTrigger value="keluar">Surat Keluar ({outRows.length})</TabsTrigger></TabsList>
      <TabsContent value="masuk">
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Agenda Surat Masuk — {period}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => printAgenda('MASUK')}><Printer className="h-4 w-4" /> Cetak</Button>
            <Button size="sm" variant="outline" onClick={() => exportExcel(`agenda-surat-masuk-${month}-${year}`, [{ name: 'Agenda Masuk', rows: inRows.map((r) => ({ 'No. Agenda': r.agenda_number, 'Tgl Diterima': formatDate(r.received_date), 'No. Surat': r.sender_number, 'Tgl Surat': formatDate(r.letter_date), Pengirim: r.institution, Perihal: r.subject, Sifat: r.nature, Status: r.status })) }])}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </div>
        </CardHeader><CardContent>
          <DataTable rows={inRows} searchKeys={['agenda_number', 'sender_number', 'subject', 'institution']} columns={[
            { key: 'agenda_number', label: 'No. Agenda', render: (r) => <span className="font-semibold text-blue-800">{r.agenda_number}</span> },
            { key: 'received_date', label: 'Tgl Diterima', render: (r) => formatDate(r.received_date) },
            { key: 'sender_number', label: 'No. Surat' },
            { key: 'letter_date', label: 'Tgl Surat', render: (r) => formatDate(r.letter_date) },
            { key: 'institution', label: 'Pengirim' },
            { key: 'subject', label: 'Perihal' },
            { key: 'nature', label: 'Sifat' },
            { key: 'status', label: 'Status', render: (r) => <Badge variant="muted">{r.status}</Badge> }
          ]} />
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="keluar">
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Agenda Surat Keluar — {period}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => printAgenda('KELUAR')}><Printer className="h-4 w-4" /> Cetak</Button>
            <Button size="sm" variant="outline" onClick={() => exportExcel(`agenda-surat-keluar-${month}-${year}`, [{ name: 'Agenda Keluar', rows: outRows.map((r) => ({ 'No. Surat': r.official_number, 'Tgl Surat': formatDate(r.letter_date), Tujuan: r.destination, Perihal: r.subject, Jenis: types.find((t) => t.id === r.type_id)?.name || '-', Penandatangan: r.signer })) }])}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </div>
        </CardHeader><CardContent>
          <DataTable rows={outRows} searchKeys={['official_number', 'subject', 'destination', 'institution']} columns={[
            { key: 'official_number', label: 'No. Surat', render: (r) => <span className="font-semibold text-blue-800">{r.official_number}</span> },
            { key: 'letter_date', label: 'Tgl Surat', render: (r) => formatDate(r.letter_date) },
            { key: 'destination', label: 'Tujuan' },
            { key: 'subject', label: 'Perihal' },
            { key: 'type', label: 'Jenis', render: (r) => types.find((t) => t.id === r.type_id)?.name || '-' },
            { key: 'signer', label: 'Penandatangan' },
            { key: 'status', label: 'Status', render: (r) => <Badge variant="success">{r.status}</Badge> }
          ]} />
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  </div>;
}

export function ArchivePage() {
  const archives = useLiveQuery(() => db.document_archives.filter((a) => !a.deleted_at).reverse().sortBy('archived_at'), [], []) as DocumentArchive[];
  const letters = useLiveQuery(() => db.incoming_letters.toArray(), [], []);
  const outgoing = useLiveQuery(() => db.outgoing_letters.toArray(), [], []);
  const [kind, setKind] = React.useState('');
  const filtered = archives.filter((a) => !kind || a.letter_kind === kind);
  return <div className="space-y-4">
    <div><h2 className="text-xl font-extrabold text-slate-900">Arsip Digital</h2><p className="text-sm text-slate-500">Dokumen surat masuk dan surat keluar yang telah diarsipkan.</p></div>
    <Card><CardContent><Select value={kind} onValueChange={setKind}><SelectTrigger className="w-56"><SelectValue placeholder="Semua jenis arsip" /></SelectTrigger><SelectContent><SelectItem value="SURAT_MASUK">Surat Masuk</SelectItem><SelectItem value="SURAT_KELUAR">Surat Keluar</SelectItem></SelectContent></Select></CardContent></Card>
    <Card><CardHeader><CardTitle>Arsip ({filtered.length})</CardTitle></CardHeader><CardContent>
      <DataTable rows={filtered} searchKeys={['archive_number', 'location', 'notes']} columns={[
        { key: 'archive_number', label: 'No. Arsip', render: (r) => <span className="font-semibold text-blue-800">{r.archive_number}</span> },
        { key: 'letter_kind', label: 'Jenis', render: (r) => <Badge>{r.letter_kind}</Badge> },
        { key: 'letter', label: 'Surat', render: (r) => { const l = r.letter_kind === 'SURAT_MASUK' ? letters.find((x) => x.id === r.letter_id) : outgoing.find((x) => x.id === r.letter_id); return (l as { subject?: string } | undefined)?.subject || '-'; } },
        { key: 'archived_at', label: 'Tgl Arsip', render: (r) => formatDate(r.archived_at) },
        { key: 'location', label: 'Lokasi' },
        { key: 'retention_years', label: 'Retensi', render: (r) => `${r.retention_years} tahun` }
      ]} />
    </CardContent></Card>
    <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600"><FileText className="h-4 w-4 shrink-0 text-blue-700" /><p>Arsip digital tetap berada pada perangkat dan disertakan dalam paket backup. Untuk memindahkan ke Google Drive ARCHIVE, gunakan menu Backup & Restore setelah koneksi tersedia.</p></div>
  </div>;
}
