import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { CheckCircle2, Eye, ListChecks, Printer } from 'lucide-react';
import { db } from '@/db/schema';
import { createRecord, notify, updateRecord } from '@/db/repository';
import { useApp } from '@/context/AppContext';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Select, SelectItem, SelectContent, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { buildTablePdf, printBlob } from '@/lib/pdf';
import { formatDate, todayISO } from '@/lib/utils';
import type { Disposition, DispositionRecipient, IncomingLetter, User } from '@/types';

const schema = z.object({
  letter_id: z.string().min(1, 'Surat masuk wajib dipilih'),
  date: z.string().min(1),
  instruction_type: z.enum(['DIKETAHUI', 'DITINDAKLANJUTI', 'DIPELAJARI', 'DIKOORDINASIKAN', 'DILAKSANAKAN', 'DIARSIPKAN']),
  instructions: z.string().min(3, 'Instruksi wajib diisi'),
  due_date: z.string(),
  notes: z.string()
});

export function DispositionsPage() {
  const { user, actor, toast } = useApp();
  const dispositions = useLiveQuery(() => db.dispositions.filter((r) => !r.deleted_at).reverse().sortBy('created_at'), [], []);
  const letters = useLiveQuery(() => db.incoming_letters.filter((l) => !l.deleted_at).toArray(), [], []) as IncomingLetter[];
  const users = useLiveQuery(() => db.users.filter((u) => !u.deleted_at && u.is_active === 1).toArray(), [], []) as User[];
  const recipients = useLiveQuery(() => db.disposition_recipients.toArray(), [], []) as DispositionRecipient[];
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<z.infer<typeof schema>>({ letter_id: '', date: todayISO(), instruction_type: 'DITINDAKLANJUTI', instructions: '', due_date: '', notes: '' });
  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([]);
  const [detail, setDetail] = React.useState<Disposition | null>(null);
  const [followUp, setFollowUp] = React.useState('');
  const [filter, setFilter] = React.useState({ status: '', type: '' });
  const canManage = user?.role === 'ADMIN' || user?.role === 'TU';

  const filtered = (dispositions as Disposition[]).filter((d) => {
    const toMe = recipients.some((r) => r.disposition_id === d.id && r.user_id === user?.id);
    if (user?.role === 'GURU' && !toMe) return false;
    if (filter.status && d.status !== filter.status) return false;
    if (filter.type && d.instruction_type !== filter.type) return false;
    return true;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const values = schema.parse(form);
      if (!selectedUsers.length) throw new Error('Pilih minimal satu penerima disposisi.');
      const year = new Date(values.date).getFullYear();
      const count = (dispositions as Disposition[]).filter((d) => d.number.includes(`/${year}`)).length + 1;
      const disp = await createRecord<Disposition>('dispositions', {
        ...values, number: `DISP/${String(count).padStart(3, '0')}/${year}`, giver_id: actor.userId, status: 'MENUNGGU'
      }, actor);
      for (const uid of selectedUsers) {
        await createRecord<DispositionRecipient>('disposition_recipients', {
          disposition_id: disp.id, user_id: uid, status: 'MENUNGGU', follow_up: '', follow_up_at: null
        }, actor, { audit: false });
        await notify(uid, 'Disposisi baru', `${disp.number}: ${disp.instructions}`, '/disposisi', 'DISPOSISI', actor);
      }
      await updateRecord('incoming_letters', values.letter_id, { status: 'DIDISPOSISI' }, actor);
      toast('Disposisi dibuat dan notifikasi dikirim.', 'success');
      setOpen(false);
      setSelectedUsers([]);
    } catch (err) { toast(err instanceof z.ZodError ? err.issues[0]?.message || 'Data tidak valid' : err instanceof Error ? err.message : String(err), 'error'); }
  };

  const updateStatus = async (d: Disposition, status: Disposition['status']) => {
    await updateRecord('dispositions', d.id, { status }, actor);
    toast(`Status disposisi menjadi ${status}.`, 'success');
  };

  const submitFollowUp = async () => {
    if (!detail || !followUp.trim()) return;
    const rec = recipients.find((r) => r.disposition_id === detail.id && r.user_id === user?.id);
    if (rec) {
      await updateRecord('disposition_recipients', rec.id, { follow_up: followUp, follow_up_at: new Date().toISOString(), status: 'SELESAI' }, actor);
      await notify(detail.giver_id, 'Tindak lanjut disposisi', `${detail.number}: ${followUp.slice(0, 100)}`, '/disposisi', 'DISPOSISI', actor);
      toast('Tindak lanjut disposisi disimpan.', 'success');
    } else toast('Anda bukan penerima disposisi ini.', 'error');
    setFollowUp('');
  };

  const printDisposition = (d: Disposition) => {
    const letter = letters.find((l) => l.id === d.letter_id);
    const blob = buildTablePdf('Lembar Disposisi', `Nomor ${d.number} · ${formatDate(d.date)}`, [
      { key: 'number', label: 'No. Disposisi', width: 30 }, { key: 'instruction_type', label: 'Instruksi' },
      { key: 'instructions', label: 'Catatan / Instruksi' }, { key: 'due_date', label: 'Batas Waktu', width: 25 },
      { key: 'status', label: 'Status', width: 20 }
    ], [{ ...d, instructions: `${d.instructions} — Surat: ${letter?.subject || '-'} (${letter?.sender_number || '-'})` }]);
    printBlob(blob);
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-extrabold text-slate-900">Disposisi</h2><p className="text-sm text-slate-500">Penyaluran surat masuk dengan instruksi dan tindak lanjut.</p></div>
      {canManage && <Button onClick={() => setOpen(true)}><ListChecks className="h-4 w-4" /> Buat Disposisi</Button>}
    </div>

    <Card><CardContent className="grid gap-2 sm:grid-cols-2">
      <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}><SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger><SelectContent>{['MENUNGGU', 'DIPROSES', 'SELESAI', 'DITUNDA'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      <Select value={filter.type} onValueChange={(v) => setFilter({ ...filter, type: v })}><SelectTrigger><SelectValue placeholder="Semua instruksi" /></SelectTrigger><SelectContent>{['DIKETAHUI', 'DITINDAKLANJUTI', 'DIPELAJARI', 'DIKOORDINASIKAN', 'DILAKSANAKAN', 'DIARSIPKAN'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Daftar Disposisi ({filtered.length})</CardTitle></CardHeader><CardContent>
      <DataTable rows={filtered} searchKeys={['number', 'instructions']} columns={[
        { key: 'number', label: 'No. Disposisi', render: (r) => <span className="font-semibold text-blue-800">{r.number}</span> },
        { key: 'date', label: 'Tanggal', render: (r) => formatDate(r.date) },
        { key: 'letter', label: 'Surat', render: (r) => letters.find((l) => l.id === r.letter_id)?.subject || '-' },
        { key: 'instruction_type', label: 'Instruksi' },
        { key: 'due_date', label: 'Batas', render: (r) => formatDate(r.due_date) },
        { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'SELESAI' ? 'success' : 'warning'}>{r.status}</Badge> },
        { key: 'actions', label: 'Aksi', render: (r) => <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => { setDetail(r); setFollowUp(''); }} title="Detail"><Eye className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => printDisposition(r)} title="Cetak"><Printer className="h-4 w-4" /></Button>
          {canManage && r.status === 'MENUNGGU' && <Button size="sm" variant="outline" onClick={() => void updateStatus(r, 'DIPROSES')}>Proses</Button>}
          {canManage && r.status === 'DIPROSES' && <Button size="sm" variant="outline" onClick={() => void updateStatus(r, 'SELESAI')}><CheckCircle2 className="h-3 w-3" /> Selesai</Button>}
          {canManage && !['SELESAI', 'DITUNDA'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => void updateStatus(r, 'DITUNDA')}>Tunda</Button>}
        </div> }
      ]} />
    </CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Buat Disposisi</DialogTitle><DialogDescription>Pilih surat masuk dan penerima instruksi.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Surat masuk"><Select value={form.letter_id} onValueChange={(v) => setForm({ ...form, letter_id: v })}><SelectTrigger><SelectValue placeholder="Pilih surat" /></SelectTrigger><SelectContent>{letters.map((l) => <SelectItem key={l.id} value={l.id}>{l.agenda_number} — {l.subject}</SelectItem>)}</SelectContent></Select></Field></div>
          <Field label="Tanggal disposisi"><Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Batas waktu"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Jenis instruksi"><Select value={form.instruction_type} onValueChange={(v) => setForm({ ...form, instruction_type: v as z.infer<typeof schema>['instruction_type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['DIKETAHUI', 'DITINDAKLANJUTI', 'DIPELAJARI', 'DIKOORDINASIKAN', 'DILAKSANAKAN', 'DIARSIPKAN'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></Field>
          <div className="sm:col-span-2"><Field label="Instruksi"><Textarea required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Penerima disposisi" hint="Klik untuk memilih beberapa penerima"><div className="grid max-h-40 grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {users.map((u) => <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={(e) => setSelectedUsers((prev) => e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id))} />
              {u.display_name} <span className="text-[10px] text-slate-400">({u.role})</span>
            </label>)}
          </div></Field></div>
          <div className="sm:col-span-2"><Field label="Catatan"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit">Simpan Disposisi</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Detail Disposisi</DialogTitle><DialogDescription>{detail?.number}</DialogDescription></DialogHeader>
        {detail && <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            {[['Instruksi', detail.instruction_type], ['Tanggal', formatDate(detail.date)], ['Batas waktu', formatDate(detail.due_date)], ['Status', detail.status], ['Catatan', detail.notes]].map(([k, v]) =>
              <div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] uppercase text-slate-400">{k}</p><p className="font-semibold">{v || '-'}</p></div>)}
          </div>
          <p className="rounded-lg border border-slate-200 p-3"><b>Pesan:</b> {detail.instructions}</p>
          <div><p className="mb-1 text-xs font-bold">Penerima & tindak lanjut</p>
            {recipients.filter((r) => r.disposition_id === detail.id).map((r) => <div key={r.id} className="mb-1 rounded-lg bg-slate-50 p-2 text-xs">
              <b>{users.find((u) => u.id === r.user_id)?.display_name || r.user_id}</b> · {r.status}
              <p className="text-slate-600">{r.follow_up || 'Belum ada tindak lanjut'}</p>
            </div>)}
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <Field label="Isi tindak lanjut (untuk penerima)"><Textarea value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
            <Button size="sm" onClick={() => void submitFollowUp()} disabled={!followUp.trim()}>Kirim Tindak Lanjut</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
