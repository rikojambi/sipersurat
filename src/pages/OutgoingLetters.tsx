import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { Download, Eye, FilePlus2, Pencil, Printer, Send, Trash2 } from 'lucide-react';
import { db } from '@/db/schema';
import { createRecord, updateRecord } from '@/db/repository';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { downloadAttachment, previewAttachment, saveAttachment } from '@/lib/attachments';
import { buildLetterPdf, printBlob } from '@/lib/pdf';
import { downloadBlob } from '@/lib/utils';
import { cancelOfficialNumber, checkNumberingGate, publishOfficialNumber } from '@/lib/numbering';
import { formatDate, todayISO } from '@/lib/utils';
import type { LetterType, OutgoingLetter } from '@/types';

const schema = z.object({
  letter_date: z.string().min(1, 'Tanggal wajib diisi'),
  type_id: z.string().min(1, 'Jenis surat wajib dipilih'),
  classification_id: z.string().min(1, 'Klasifikasi wajib dipilih'),
  destination: z.string().min(2, 'Tujuan wajib diisi'),
  institution: z.string().min(2, 'Instansi penerima wajib diisi'),
  subject: z.string().min(3, 'Perihal wajib diisi'),
  body: z.string().min(5, 'Isi surat wajib diisi'),
  signer: z.string().min(2, 'Penandatangan wajib diisi'),
  signer_position: z.string()
});
type FormValues = z.infer<typeof schema>;

const statusVariant = (s: string): 'default' | 'success' | 'warning' | 'muted' | 'danger' => {
  if (['SELESAI', 'TERDAFTAR', 'DITANDATANGANI', 'DIKIRIM'].includes(s)) return 'success';
  if (['DIAJUKAN', 'PEMERIKSAAN', 'REVISI'].includes(s)) return 'warning';
  if (s === 'DIBATALKAN') return 'danger';
  if (s === 'DRAFT') return 'muted';
  return 'default';
};

const emptyForm = (): FormValues => ({ letter_date: todayISO(), type_id: '', classification_id: '', destination: '', institution: '', subject: '', body: '', signer: '', signer_position: 'Kepala Sekolah' });

export function OutgoingLettersPage() {
  const { user, actor, toast } = useApp();
  const letters = useLiveQuery(() => db.outgoing_letters.filter((r) => !r.deleted_at).reverse().sortBy('created_at'), [], []);
  const types = useLiveQuery(() => db.letter_types.filter((t) => !t.deleted_at && t.is_active === 1).toArray(), [], []) as LetterType[];
  const classifications = useLiveQuery(() => db.letter_classifications.filter((c) => !c.deleted_at).toArray(), [], []);
  const school = useLiveQuery(() => db.school_settings.get('00000000-0000-4000-8000-000000000001'), []);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OutgoingLetter | null>(null);
  const [form, setForm] = React.useState<FormValues>(emptyForm());
  const [file, setFile] = React.useState<File | null>(null);
  const [detail, setDetail] = React.useState<OutgoingLetter | null>(null);
  const [preview, setPreview] = React.useState<{ url: string; name: string; mime: string } | null>(null);
  const [filter, setFilter] = React.useState({ status: '', type: '', from: '', to: '' });
  const [gate, setGate] = React.useState({ allowed: false, reason: '' });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { void checkNumberingGate().then(setGate); }, [letters]);

  const isTU = user?.role === 'TU' || user?.role === 'ADMIN';
  const filtered = React.useMemo(() => (letters as OutgoingLetter[]).filter((l) => {
    if (user?.role === 'GURU' && l.requested_by !== user.id) return false;
    if (filter.status && l.status !== filter.status) return false;
    if (filter.type && l.type_id !== filter.type) return false;
    if (filter.from && l.letter_date < filter.from) return false;
    if (filter.to && l.letter_date > filter.to) return false;
    return true;
  }), [letters, filter, user]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setFile(null); setOpen(true); };
  const openEdit = (l: OutgoingLetter) => {
    setEditing(l);
    setForm({ letter_date: l.letter_date, type_id: l.type_id, classification_id: l.classification_id, destination: l.destination, institution: l.institution, subject: l.subject, body: l.body, signer: l.signer, signer_position: l.signer_position });
    setFile(null); setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const values = schema.parse(form);
      setBusy(true);
      let attachmentIds = editing?.attachment_ids || [];
      if (file) {
        const att = await saveAttachment(file, 'SURAT_KELUAR', editing?.id || 'new', actor);
        attachmentIds = [...attachmentIds, att.id];
      }
      if (editing) {
        if (editing.official_number) throw new Error('Nomor resmi sudah diterbitkan; surat tidak dapat diubah.');
        await updateRecord<OutgoingLetter>('outgoing_letters', editing.id, { ...values, attachment_ids: attachmentIds }, actor);
        toast('Draft surat keluar diperbarui.', 'success');
      } else {
        const created = await createRecord<OutgoingLetter>('outgoing_letters', {
          ...values, attachment_ids: attachmentIds, status: 'DRAFT', requested_by: actor.userId,
          official_number: null, published_at: null, published_by: null, registration_device_id: null,
          canceled_at: null, cancellation_reason: '', final_file_id: '', reviewed_by: ''
        }, actor);
        if (file) {
          const att = await db.attachments.where('owner_id').equals('new').first();
          if (att) await db.attachments.update(att.id, { owner_id: created.id });
        }
        toast('Draft surat keluar dibuat.', 'success');
      }
      setOpen(false);
    } catch (err) { toast(err instanceof z.ZodError ? err.issues[0]?.message || 'Data tidak valid' : err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };

  const transition = async (l: OutgoingLetter, status: OutgoingLetter['status']) => {
    try {
      await updateRecord<OutgoingLetter>('outgoing_letters', l.id, { status, reviewed_by: isTU ? actor.userId : l.reviewed_by }, actor, { details: `Perubahan status ke ${status}` });
      toast(`Status surat menjadi ${status}.`, 'success');
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
  };

  const publish = async (l: OutgoingLetter) => {
    setBusy(true);
    try {
      const result = await publishOfficialNumber(l.id, actor);
      toast(`Nomor resmi diterbitkan: ${result.number}`, 'success');
      await checkNumberingGate().then(setGate);
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { setBusy(false); }
  };

  const cancel = async (l: OutgoingLetter) => {
    const reason = prompt('Alasan pembatalan nomor surat:');
    if (!reason) return;
    try {
      if (l.official_number) await cancelOfficialNumber(l.id, reason, actor);
      else await updateRecord<OutgoingLetter>('outgoing_letters', l.id, { status: 'DIBATALKAN', cancellation_reason: reason }, actor, { operation: 'CANCEL' });
      toast('Surat dibatalkan. Nomor resmi tidak dipakai ulang.', 'warning');
    } catch (err) { toast(err instanceof Error ? err.message : String(err), 'error'); }
  };

  const print = async (l: OutgoingLetter, downloadOnly = false) => {
    if (!school) return toast('Identitas sekolah belum diatur.', 'error');
    const type = types.find((t) => t.id === l.type_id);
    const blob = buildLetterPdf(l, school, type);
    if (downloadOnly) downloadBlob(blob, `${(l.official_number || 'draft').replaceAll('/', '-')}.pdf`);
    else printBlob(blob);
    if (l.status === 'DRAFT') await updateRecord('outgoing_letters', l.id, { final_file_id: l.final_file_id || 'generated' }, actor, { audit: false });
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-extrabold text-slate-900">Surat Keluar</h2><p className="text-sm text-slate-500">Pengajuan → pemeriksaan → registrasi nomor resmi → penerbitan → arsip.</p></div>
      <Button onClick={openNew}><FilePlus2 className="h-4 w-4" /> Buat Surat</Button>
    </div>

    {!gate.allowed && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><b>Penerbitan nomor resmi terkunci:</b> {gate.reason}</div>}

    <Card>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} title="Dari tanggal" />
        <Input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} title="Sampai tanggal" />
        <Select value={filter.type} onValueChange={(v) => setFilter({ ...filter, type: v })}><SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger><SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
        <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}><SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger><SelectContent>{['DRAFT', 'DIAJUKAN', 'PEMERIKSAAN', 'REVISI', 'DISETUJUI', 'TERDAFTAR', 'DITANDATANGANI', 'DIKIRIM', 'SELESAI', 'DIBATALKAN'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Daftar Surat Keluar ({filtered.length})</CardTitle></CardHeader>
      <CardContent>
        <DataTable rows={filtered} searchKeys={['official_number', 'subject', 'institution', 'destination']} columns={[
          { key: 'official_number', label: 'Nomor resmi', render: (r) => r.official_number ? <span className="whitespace-nowrap font-semibold text-blue-800">{r.official_number}</span> : <Badge variant="muted">{r.status === 'DIAJUKAN' ? 'Menunggu registrasi' : 'Draft'}</Badge> },
          { key: 'letter_date', label: 'Tanggal', render: (r) => formatDate(r.letter_date) },
          { key: 'type', label: 'Jenis', render: (r) => types.find((t) => t.id === r.type_id)?.name || '-' },
          { key: 'institution', label: 'Tujuan' },
          { key: 'subject', label: 'Perihal' },
          { key: 'status', label: 'Status', render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
          { key: 'actions', label: 'Aksi', render: (r) => <div className="flex flex-wrap gap-1">
            <Button size="icon" variant="ghost" onClick={() => setDetail(r)} title="Detail"><Eye className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => void print(r)} title="Cetak"><Printer className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => void print(r, true)} title="Download PDF"><Download className="h-4 w-4" /></Button>
            {isTU && !r.official_number && r.status !== 'DIBATALKAN' && <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
            {user?.role === 'GURU' && r.status === 'DRAFT' && <Button size="sm" variant="outline" onClick={() => void transition(r, 'DIAJUKAN')}>Ajukan</Button>}
            {isTU && r.status === 'DIAJUKAN' && <Button size="sm" variant="outline" onClick={() => void transition(r, 'PEMERIKSAAN')}>Periksa</Button>}
            {isTU && r.status === 'PEMERIKSAAN' && <Button size="sm" variant="outline" onClick={() => void transition(r, 'DISETUJUI')}>Setujui</Button>}
            {isTU && gate.allowed && ['DIAJUKAN', 'PEMERIKSAAN', 'DISETUJUI'].includes(r.status) && <Button size="sm" onClick={() => void publish(r)} disabled={busy}>Daftarkan</Button>}
            {r.status === 'TERDAFTAR' && <Button size="sm" variant="outline" onClick={() => void transition(r, 'DITANDATANGANI')}>Tandatangani</Button>}
            {r.status === 'DITANDATANGANI' && <Button size="sm" variant="outline" onClick={() => void transition(r, 'DIKIRIM')}><Send className="h-3 w-3" /> Kirim</Button>}
            {r.status === 'DIKIRIM' && <Button size="sm" variant="outline" onClick={() => void transition(r, 'SELESAI')}>Selesai</Button>}
            {isTU && r.status !== 'SELESAI' && r.status !== 'DIBATALKAN' && <Button size="icon" variant="ghost" onClick={() => void cancel(r)} title="Batalkan"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </div> }
        ]} />
      </CardContent>
    </Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? 'Edit Draft Surat Keluar' : 'Buat Surat Keluar Baru'}</DialogTitle><DialogDescription>Draft belum memiliki nomor resmi. Nomor diterbitkan oleh perangkat registrasi.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Tanggal surat"><Input type="date" required value={form.letter_date} onChange={(e) => setForm({ ...form, letter_date: e.target.value })} /></Field>
          <Field label="Jenis surat"><Select value={form.type_id} onValueChange={(v) => setForm({ ...form, type_id: v })}><SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger><SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Klasifikasi"><Select value={form.classification_id} onValueChange={(v) => setForm({ ...form, classification_id: v })}><SelectTrigger><SelectValue placeholder="Pilih klasifikasi" /></SelectTrigger><SelectContent>{classifications.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Instansi penerima"><Input required value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} /></Field>
          <Field label="Tujuan"><Input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></Field>
          <Field label="Penandatangan"><Input required value={form.signer} onChange={(e) => setForm({ ...form, signer: e.target.value })} /></Field>
          <Field label="Jabatan"><Input value={form.signer_position} onChange={(e) => setForm({ ...form, signer_position: e.target.value })} /></Field>
          <Field label="Lampiran (PDF/JPG/PNG)"><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          <div className="sm:col-span-2"><Field label="Perihal"><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Isi surat"><Textarea className="min-h-40" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Tulis isi surat. Gunakan {PARAGRAPH_1} dan {PARAGRAPH_2} jika memakai template." /></Field></div>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Draft'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Detail Surat Keluar</DialogTitle><DialogDescription>{detail?.official_number || 'Draft / menunggu registrasi'}</DialogDescription></DialogHeader>
        {detail && <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['Status', detail.status], ['Tanggal', formatDate(detail.letter_date)], ['Jenis', types.find((t) => t.id === detail.type_id)?.name || '-'],
            ['Instansi', detail.institution], ['Tujuan', detail.destination], ['Perihal', detail.subject],
            ['Penandatangan', detail.signer], ['Jabatan', detail.signer_position],
            ['Diterbitkan', formatDate(detail.published_at, true)], ['Perangkat registrasi', detail.registration_device_id || '-']
          ].map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] uppercase text-slate-400">{k}</p><p className="font-semibold text-slate-800">{v || '-'}</p></div>)}
          <div className="sm:col-span-2"><p className="text-[10px] uppercase text-slate-400">Isi</p><p className="whitespace-pre-wrap">{detail.body}</p></div>
          {detail.attachment_ids.map((id) => <div key={id} className="sm:col-span-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => { const att = await db.attachments.get(id); if (att) setPreview({ url: await previewAttachment(id), name: att.name, mime: att.mime }); }}><Eye className="h-4 w-4" /> Preview</Button>
            <Button size="sm" variant="outline" onClick={() => void downloadAttachment(id)}><Download className="h-4 w-4" /> Download</Button>
          </div>)}
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Preview Lampiran</DialogTitle></DialogHeader>{preview && <iframe src={preview.url} title={preview.name} className="h-[60vh] w-full rounded border-0 bg-white" />}</DialogContent></Dialog>
  </div>;
}
