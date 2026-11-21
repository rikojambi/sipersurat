import * as React from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { downloadBlob } from '@/lib/utils';

/** Preview PDF menggunakan PDF.js; fallback ke elemen iframe untuk gambar. */
export function FilePreview({ url, fileName, mime }: { url: string; fileName: string; mime: string }) {
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(0);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!mime.includes('pdf')) return;
    let cancelled = false;
    let pdfDoc: any = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        pdfDoc = await pdfjs.getDocument(url).promise as typeof pdfDoc;
        if (cancelled) return;
        setPages(pdfDoc!.numPages);
        const p = await pdfDoc!.getPage(page);
        const viewport = p.getViewport({ scale: 1.4 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      } catch {
        // Fallback: iframe bawaan browser
        if (!cancelled) setPages(-1);
      }
    })();
    return () => { cancelled = true; void pdfDoc?.destroy?.(); };
  }, [url, page, mime]);

  const download = async () => {
    const blob = await fetch(url).then((r) => r.blob());
    downloadBlob(blob, fileName);
  };

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <p className="truncate text-xs font-semibold text-slate-700">{fileName}</p>
      <div className="flex items-center gap-1">
        {pages > 1 && <>
          <Button size="icon" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs">{page}/{pages}</span>
          <Button size="icon" variant="ghost" onClick={() => setPage((p) => Math.min(pages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
        </>}
        <Button size="icon" variant="ghost" onClick={download} title="Download"><Download className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2 text-center">
      {mime.includes('pdf') && pages >= 0 ? <canvas ref={canvasRef} className="mx-auto" /> :
        <iframe src={url} title={fileName} className="h-[55vh] w-full rounded border-0 bg-white" />}
    </div>
  </div>;
}
