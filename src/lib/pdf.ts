import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '@/lib/utils';
import type { LetterType, OutgoingLetter, SchoolSettings } from '@/types';

export function pdfBlob(doc: jsPDF): Blob {
  return new Blob([doc.output('arraybuffer') as ArrayBuffer], { type: 'application/pdf' });
}

export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.src = url;
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60_000);
  };
  document.body.appendChild(iframe);
}

function wrap(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 6): number {
  const lines = doc.splitTextToSize(text || '', width) as string[];
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

export function buildLetterPdf(letter: OutgoingLetter, school: SchoolSettings, type: LetterType | undefined): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((school.name || 'SMKN 6 MUARO JAMBI').toUpperCase(), 105, 22, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`NPSN ${school.npsn || '-'} · ${school.address || ''} · ${school.city || ''}`, 105, 28, { align: 'center' });
  doc.text(`Telp. ${school.phone || '-'} · ${school.email || '-'} · ${school.website || '-'}`, 105, 33, { align: 'center' });
  doc.setLineWidth(0.8);
  doc.line(20, 36, 190, 36);
  doc.setLineWidth(0.2);
  doc.line(20, 38, 190, 38);

  let y = 50;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nomor`, 20, y); doc.text(`: ${letter.official_number || '(belum diterbitkan)'}`, 45, y);
  y += 6;
  doc.text(`Lampiran`, 20, y); doc.text(': -', 45, y);
  y += 6;
  doc.text(`Perihal`, 20, y); doc.text(`: ${letter.subject || '-'}`, 45, y);
  y += 12;
  doc.text(`Kepada`, 20, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  y = wrap(doc, letter.institution || letter.destination || '-', 25, y, 160);
  doc.setFont('helvetica', 'normal');
  if (letter.destination && letter.destination !== letter.institution) y = wrap(doc, letter.destination, 25, y, 160);
  y += 8;
  y = wrap(doc, `Yang terhormat,`, 20, y, 160);
  y += 4;
  const body = (letter.body || '')
    .replace(/\{PARAGRAPH_1\}/g, letter.subject || '')
    .replace(/\{PARAGRAPH_2\}/g, '')
    .replace(/<[^>]+>/g, '');
  y = wrap(doc, body, 20, y, 170, 6);
  y += 6;
  doc.text('Demikian surat ini kami sampaikan, atas perhatian dan kerja samanya kami ucapkan terima kasih.', 20, y, { maxWidth: 170 });
  y += 24;
  doc.text(`${school.city || 'Muaro Jambi'}, ${formatDate(letter.letter_date)}`, 120, y);
  y += 6;
  doc.text(`${type?.name || 'Surat'}`, 120, y);
  doc.text(`Yang bertanda tangan,`, 120, y + 6);
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.text(`${letter.signer || school.headmaster || 'Kepala Sekolah'}`, 120, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`NIP. ${school.headmaster_nip || '-'}`, 120, y + 5);
  doc.setFontSize(8);
  doc.text('Dokumen dicetak dari SIPERSURAT — SMKN 6 Muaro Jambi', 105, 285, { align: 'center' });
  return pdfBlob(doc);
}

export interface TableColumn<T> { key: string; label: string; width?: number; render?: (row: T) => string }

export function buildTablePdf<T>(title: string, subtitle: string, columns: TableColumn<T>[], rows: T[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: columns.length > 7 ? 'landscape' : 'portrait' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title.toUpperCase(), 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 14, 22);
  autoTable(doc, {
    startY: 27,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '-'))),
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { cellWidth: c.width || 'auto' }])),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 }
  });
  doc.setFontSize(8);
  doc.text(`Dicetak ${formatDate(new Date().toISOString(), true)} WIB · SIPERSURAT`, 14, doc.internal.pageSize.getHeight() - 8);
  return pdfBlob(doc);
}

export function exportExcel<T>(fileName: string, sheets: Array<{ name: string; rows: T[] }>): void {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{ info: 'Tidak ada data' }]);
    XLSX.utils.book_append_sheet(book, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(book, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
