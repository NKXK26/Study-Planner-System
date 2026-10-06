'use client';
import { useRef } from 'react';
import Auth from '@utils/auth/FrontendAuthHelper';
import { parseTranscript } from '@app/libs/doubleMajorChecker.mjs';
import { validateDocument } from '@app/libs/chatDpa.mjs';

export default function ChatDocumentUpload({ document, onChange, busy, setReading, onError, helpText }) {
  const field = useRef(null);
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(pdf|xlsx)$/i.test(file.name) || file.size > 5 * 1024 * 1024) { onError('Choose a PDF or XLSX up to 5 MB.'); return; }
    setReading(true); onError('');
    try {
      let next;
      if (/\.pdf$/i.test(file.name)) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read this file. Try selecting it again.'));
          reader.readAsDataURL(file);
        });
        const response = await Auth.authenticatedFetch('/api/planner-assistant/document', { method: 'POST', signal: AbortSignal.timeout(60000), body: JSON.stringify({ name: file.name, base64 }) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not read the PDF.');
        next = data.document;
      } else {
        const XLSX = await import('xlsx');
        const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false });
        const candidates = [];
        for (const name of book.SheetNames) {
          const sheet = book.Sheets[name];
          const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
          if (range.e.r >= 3000 || range.e.c >= 100) continue;
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
          try { parseTranscript(rows); candidates.push(rows); } catch { /* Ignore non-transcript sheets. */ }
        }
        if (candidates.length !== 1) throw new Error(candidates.length ? 'Multiple transcript worksheets found. Upload a workbook containing only the DPA worksheet you want to analyse.' : 'No DPA table found. Expected Course, Status and Earned columns (up to 3,000 rows).');
        next = { name: file.name, rows: candidates[0], text: candidates[0].map(row => row.join('\t')).join('\n') };
      }
      onChange(validateDocument(next));
    } catch (e) { onError(e.name === 'TimeoutError' ? 'Reading the file timed out. Please try again.' : e.message); }
    finally { setReading(false); }
  }
  return <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <input ref={field} type="file" accept=".pdf,.xlsx" onChange={upload} disabled={busy} className="hidden" aria-label="Attach DPA PDF or XLSX" />
    <button type="button" disabled={busy} onClick={() => field.current?.click()} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-medium text-neutral-900 hover:border-red-400 hover:bg-red-50 disabled:opacity-40">Attach DPA PDF / XLSX</button>
    {document && <span className="rounded-lg bg-neutral-100 px-3 py-2 break-words">{document.name}<button type="button" disabled={busy} onClick={() => onChange(null)} className="ml-3 text-red-700 underline">Remove</button></span>}
    <p className="mt-1 opacity-60">{helpText || 'Up to 5 MB. Extracted text is sent to your configured AI service. Clear chat to discard it.'}</p>
  </div>;
}
