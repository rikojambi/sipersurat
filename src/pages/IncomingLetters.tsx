import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { Archive, Download, Eye, FilePlus2, Pencil, Printer, Trash2 } from 'lucide-react';
import { db } from '@/db/schema';
import { createRecord, softDelete, updateRecord } from '@/db/repository';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { FilePreview } from '@/components/PdfPreview';
import { downloadAttachment, previewAttachment, saveAttachment } from '@/lib/attachments';
import { nextAgendaNumber } from '@/lib/numbering';
import { buildTablePdf, printBlob } from '@/lib/pdf';
import { formatDate, todayISO } from '@/lib/utils';
import type { IncomingLetter } from '@/types';

const schema = z.object({
  sender_number: z.string().max(100),
  letter_date: z.string().min(1, 'Tanggal surat wajib diisi'),
  received_date: z.string().min(1, 'Tanggal diterima wajib diisi'),
  sender: z.string().min(2, 'Asal surat wajib diisi'),
  institution: z.string().min(2, 'Instansi pengirim wajib diisi'),
  subject: z.string().min(3, 'Perihal wajib diisi'),
  type_id: z.string().min(1, 'Jenis surat wajib dipilih'),
  classification_id: z.string().min(1, 'Klasifikasi wajib dipilih'),
  nature: z.enum(['BIASA', 'PENTING', 'RAHASIA', 'SANGAT_RAHASIA']),
  destination: z.string().min(1, 'Tujuan wajib diisi'),
  unit_id: z.string(),
  summary: z.string()
});

type FormValues = z.infer<typeof schema>;

const emptyForm = (): FormValues => ({
  sender_number: '', letter_date: todayISO(), received_date: todayISO(), sender: '',
  institution: '', subject: '', type_id: '', classification_id: '', nature: 'BIASA',
  destination: '', unit_id: '', summary: ''
});

export function IncomingLettersPage() {
  const { user, actor, toast } = useApp();
  const letters = useLiveQuery(() => db.incoming_letters.filter((r) => !r.deleted_at).reverse().sortBy('created_at'), [], []);
  const types = useLiveQuery(() => db.letter_types.filter((t) => !t.deleted_at && t.is_active === 1).toArray(), [], []);
  const classifications = useLiveQuery(() => db.letter_classifications.filter((c) => !c.deleted_at).toArray(), [], []);
  const units = useLiveQuery(() => db.units.filter((u) => !u.deleted_at).toArray(), [], []);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<IncomingLetter | null>(null);
  const [form, setForm] = React.useState<FormValues>(emptyForm());
  const [file, setFile] = React.useState<File | null>(null);
  const [detail, setDetail] = React.useState<IncomingLetter | null>(null);
  const [preview, setPreview] = React.useState<{ url: string; name: string; mime: string } | null>(null);
  const [filter, setFilter] = React.useState({ from: '', to: '', institution: '', type: '', status: '' });
  const [busy, setBusy] = React.useState(false);

  const canEdit = user?.role === 'ADMIN' || user?.role === 'TU';

  const filtered = React.useMemo(() => (letters as IncomingLetter[]).filter((l) => {
    if (user?.role === 'GURU' && l.unit_id !== user.unit_id && !l.destination.includes(user.display_name)) return false;
    if (filter.from && l.received_date < filter.from) return false;
    if (filter.to && l.received_date > filter.to) return false;
    if (filter.institution && !`${l.institution} ${l.sender} ${l.subject}`.toLowerCase().includes(filter.institution.toLowerCase())) return false;
    if (filter.type && l.type_id !== filter.type) return false;
    if (filter.status && l.status !== filter.status) return false;
    return true;
  }), [letters, filter, user]);

  const openNew = async () => {
    setEditing(null);
    setForm(emptyForm());
    setFile(null);
    setOpen(true);
  };
  const openEdit = (l: IncomingLetter) => {
    setEditing(l);
    setForm({ sender_number: l.sender_number, letter_date: l.letter_date, received_date: l.received_date, sender: l.sender, institution: l.institution, subject: l.subject, type_id: l.type_id, classification_id: l.classification_id, nature: l.nature, destination: l.destination, unit_id: l.unit_id, summary: l.summary });
    setFile(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const values = schema.parse(form);
      setBusy(true);
      let attachmentIds = editing?.attachment_ids || [];
      if (file) {
        const att = await saveAttachment(file, 'SURAT_MASUK', editing?.id || 'new', actor);
        attachmentIds = [...attachmentIds, att.id];
      }
      if (editing) {
        await updateRecord<IncomingLetter>('incoming_letters', editing.id, { ...values, attachment_ids: attachmentIds }, actor);
        toast('Surat masuk diperbarui.', 'success');
      } else {
        const agenda = await nextAgendaNumber();
        const created = await createRecord<IncomingLetter>('incoming_letters', {
          ...values, agenda_number: agenda.number, agenda_seq: agenda.seq,
          attachment_ids: attachmentIds, received_by: actor.userId, status: 'DITERIMA'
        }, actor);
        if (file) {
          const att = await db.attachments.where('owner_id').equals('new').first();
          if (att) await db.attachments.update(att.id, { owner_id: created.id });
        }
        toast(`Surat masuk diregistrasi dengan nomor agenda ${agenda.number}.`, 'success');
      }
      setOpen(false);
    } catch (err) { toast(err instanceof z.ZodError ? err.issues[0]?.message || 'Data tidak valid' : err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };

  const showPreview = async (id: string) => {
    try {
      const att = await getAttachmentInfo(id);
      const url = await previewAttachment(id);
      setPreview({ url, name: att?.name || 'Dokumen', mime: att?.mime || 'application/pdf' });
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
  };

  const printRow = (l: IncomingLetter) => {
    const blob = buildTablePdf('Buku Agenda Surat Masuk', `Nomor agenda ${l.agenda_number} · ${formatDate(l.received_date)}`, [
      { key: 'agenda_number', label: 'No. Agenda', width: 28 }, { key: 'sender_number', label: 'No. Surat' },
      { key: 'institution', label: 'Pengirim' }, { key: 'subject', label: 'Perihal' },
      { key: 'received_date', label: 'Diterima', width: 25, render: (r) => formatDate(r.received_date) }
    ], [l]);
    printBlob(blob);
  };

  const archive = async (l: IncomingLetter) => {
    try {
      await createRecord('document_archives', {
        letter_id: l.id, letter_kind: 'SURAT_MASUK', archive_number: `ARS-M/${l.agenda_number}`,
        archived_at: new Date().toISOString(), location: 'Arsip digital SIPERSURAT', retention_years: 5, notes: ''
      }, actor);
      await updateRecord('incoming_letters', l.id, { status: 'DIARSIPKAN' }, actor);
      toast('Surat masuk diarsipkan.', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-extrabold text-slate-900">Surat Masuk</h2><p className="text-sm text-slate-500">Registrasi dan pengelolaan buku agenda surat masuk.</p></div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => {
          const blob = buildTablePdf('Buku Agenda Surat Masuk', `Filter: ${filter.institution || 'semua'} · ${filter.from || '-'} s/d ${filter.to || '-'}`, [
            { key: 'agenda_number', label: 'No. Agenda', width: 28 }, { key: 'received_date', label: 'Tgl Diterima', width: 25, render: (r) => formatDate(r.received_date) },
            { key: 'sender_number', label: 'No. Surat' }, { key: 'institution', label: 'Pengirim' }, { key: 'subject', label: 'Perihal' },
            { key: 'status', label: 'Status', width: 22 }
          ], filtered);
          printBlob(blob);
        }}><Printer className="h-4 w-4" /> Cetak Agenda</Button>
        {canEdit && <Button onClick={openNew}><FilePlus2 className="h-4 w-4" /> Tambah Surat</Button>}
      </div>
    </div>

    <Card>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} title="Dari tanggal" />
        <Input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} title="Sampai tanggal" />
        <Input placeholder="Cari pengirim/perihal" value={filter.institution} onChange={(e) => setFilter({ ...filter, institution: e.target.value })} />
        <Select value={filter.type} onValueChange={(v) => setFilter({ ...filter, type: v })}>
          <SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger>
          <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}>
          <SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger>
          <SelectContent>{['DITERIMA', 'DIDISPOSISI', 'DITINDAKLANJUTI', 'SELESAI', 'DIARSIPKAN'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Daftar Surat Masuk ({filtered.length})</CardTitle></CardHeader>
      <CardContent>
        <DataTable rows={filtered} searchKeys={['agenda_number', 'sender_number', 'subject', 'institution', 'sender']} columns={[
          { key: 'agenda_number', label: 'No. Agenda', render: (r) => <span className="whitespace-nowrap font-semibold text-blue-800">{r.agenda_number}</span> },
          { key: 'received_date', label: 'Diterima', render: (r) => formatDate(r.received_date) },
          { key: 'sender_number', label: 'No. Surat' },
          { key: 'institution', label: 'Pengirim', render: (r) => <><span className="block font-medium">{r.institution}</span><span className="text-xs text-slate-400">{r.sender}</span></> },
          { key: 'subject', label: 'Perihal' },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'DIARSIPKAN' ? 'muted' : 'default'}>{r.status}</Badge> },
          { key: 'actions', label: 'Aksi', render: (r) => <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => setDetail(r)} title="Detail"><Eye className="h-4 w-4" /></Button>
            {r.attachment_ids[0] && <Button size="icon" variant="ghost" onClick={() => void showPreview(r.attachment_ids[0]!)} title="Preview dokumen"><Eye className="h-4 w-4" /></Button>}
            <Button size="icon" variant="ghost" onClick={() => printRow(r)} title="Cetak ringkasan"><Printer className="h-4 w-4" /></Button>
            {canEdit && <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
            {canEdit && <Button size="icon" variant="ghost" onClick={() => void archive(r)} title="Arsipkan"><Archive className="h-4 w-4" /></Button>}
            {canEdit && <Button size="icon" variant="ghost" onClick={async () => { if (confirm('Hapus surat ini? Data tetap dapat dipulihkan dari backup.')) { await softDelete('incoming_letters', r.id, actor); toast('Surat masuk dihapus (soft delete).', 'info'); } }} title="Hapus"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </div> }
        ]} />
      </CardContent>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? 'Edit Surat Masuk' : 'Tambah Surat Masuk'}</DialogTitle><DialogDescription>Nomor agenda dibuat otomatis berdasarkan tahun dan dicatat pada perangkat ini.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nomor surat pengirim"><Input value={form.sender_number} onChange={(e) => setForm({ ...form, sender_number: e.target.value })} /></Field>
          <Field label="Tanggal surat"><Input type="date" required value={form.letter_date} onChange={(e) => setForm({ ...form, letter_date: e.target.value })} /></Field>
          <Field label="Tanggal diterima"><Input type="date" required value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} /></Field>
          <Field label="Asal surat"><Input required value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} /></Field>
          <Field label="Instansi pengirim"><Input required value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></Field>
          <Field label="Perihal"><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Jenis surat"><Select value={form.type_id} onValueChange={(v) => setForm({ ...form, type_id: v })}><SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger><SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Klasifikasi"><Select value={form.classification_id} onValueChange={(v) => setForm({ ...form, classification_id: v })}><SelectTrigger><SelectValue placeholder="Pilih klasifikasi" /></SelectTrigger><SelectContent>{classifications.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Sifat surat"><Select value={form.nature} onValueChange={(v) => setForm({ ...form, nature: v as FormValues['nature'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['BIASA', 'PENTING', 'RAHASIA', 'SANGAT_RAHASIA'].map((s) => <SelectItem key={s} value={s}>{s.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Unit tujuan"><Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}><SelectTrigger><SelectValue placeholder="Pilih unit" /></SelectTrigger><SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Tujuan surat"><Input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></Field>
          <Field label="Scan surat (PDF/JPG/PNG, maks 15 MB)" hint={editing?.attachment_ids.length ? `${editing.attachment_ids.length} dokumen sudah terlampir` : ''}><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          <div className="sm:col-span-2"><Field label="Ringkasan isi"><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field></div>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Surat'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Detail Surat Masuk</DialogTitle><DialogDescription>{detail?.agenda_number}</DialogDescription></DialogHeader>
        {detail && <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['Nomor surat', detail.sender_number], ['Tanggal surat', formatDate(detail.letter_date)], ['Diterima', formatDate(detail.received_date)],
            ['Asal', detail.sender], ['Instansi', detail.institution], ['Perihal', detail.subject],
            ['Sifat', detail.nature], ['Tujuan', detail.destination], ['Status', detail.status], ['Petugas', detail.received_by]
          ].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] uppercase text-slate-400">{k}</p><p className="font-semibold text-slate-800">{v || '-'}</p></div>)}
          <div className="sm:col-span-2"><p className="text-[10px] uppercase text-slate-400">Ringkasan</p><p>{detail.summary || '-'}</p></div>
          {detail.attachment_ids.map((id) => <div key={id} className="sm:col-span-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void showPreview(id)}><Eye className="h-4 w-4" /> Preview</Button>
            <Button size="sm" variant="outline" onClick={() => void downloadAttachment(id)}><Download className="h-4 w-4" /> Download</Button>
          </div>)}
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
      <DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Preview Dokumen</DialogTitle></DialogHeader>{preview && <FilePreview url={preview.url} fileName={preview.name} mime={preview.mime} />}</DialogContent>
    </Dialog>
  </div>;
}

async function getAttachmentInfo(id: string) {
  const att = await db.attachments.get(id);
  return att;
}
