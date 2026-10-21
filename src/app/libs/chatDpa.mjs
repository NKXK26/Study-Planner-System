import { parseTranscript } from './doubleMajorChecker.mjs';

export const MAX_DOCUMENT_TEXT = 60000;

// Only explicit tabular status and earned-credit fields count as completion.
// Free prose remains available for explanation, never inferred earned credit.
export function transcriptFromText(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows = lines.map(line => line.split(/\t|\s{2,}|\s*\|\s*/).map(cell => cell.trim()));
  try { return parseTranscript(rows); } catch { return null; }
}

export function validateDocument(document) {
  if (document == null) return null;
  if (typeof document.name !== 'string' || document.name.length > 200 || typeof document.text !== 'string' || !document.text.trim() || document.text.length > MAX_DOCUMENT_TEXT) {
    throw new Error('The attached document is invalid or too long. Upload it again (maximum 60,000 extracted characters).');
  }
  if (document.rows !== undefined && (!Array.isArray(document.rows) || document.rows.length > 3000 || document.rows.some(row => !Array.isArray(row) || row.length > 100 || row.some(cell => !['string', 'number'].includes(typeof cell) || String(cell).length > 2000)))) {
    throw new Error('The DPA worksheet is too large or invalid.');
  }
  return { name: document.name, text: document.text, rows: document.rows };
}

export function documentEvidence(document) {
  let transcript = null;
  try { transcript = document.rows ? parseTranscript(document.rows) : transcriptFromText(document.text); } catch { /* Explain text without claiming completion. */ }
  if (transcript) {
    // DPA elective placeholders such as AE1 are valid earned entries too.
    // They remain exact-code entries, never automatic substitutes for major units.
    transcript.completed = transcript.completed.filter(u => /^[A-Z]{2,5}\d{1,6}$/.test(u.code));
    transcript.excluded = transcript.excluded.filter(u => /^[A-Z]{2,5}\d{1,6}$/.test(u.code));
    if (!transcript.completed.length && !transcript.excluded.length) transcript = null;
  }
  const codes = [...new Set(document.text.toUpperCase().match(/\b[A-Z]{2,5}\d{3,6}\b/g) || [])];
  const summary = [`Attached DPA: ${document.name}.`,
    'Grade rules: N means failed and never counts as completed, even when Status says Complete. EXM means exempted and counts as completed with its recorded earned credit. Under the configured programme rule, each completed approved elective (AE1, AE2, etc.) counts as one elective slot with at least 12.5 earned CP, and completed ICT20016 (3-month ICT placement) with 25 earned CP counts as two elective slots. Earned credits count once. These elective allocations do not replace specific core or major units.',
    transcript ? `Verified table fields show ${transcript.completed.length} completed units with positive earned credit (${transcript.completed.reduce((n, u) => n + u.earned, 0)} CP). ${transcript.excluded.length} rows excluded; ${transcript.duplicates} duplicate completed attempts removed.` : 'I can explain the extracted DPA text, but cannot reliably identify completed units and earned credits from its table layout. Attach a DPA XLSX with Course, Status and Earned columns for an exact comparison.',
    codes.length ? `Unit codes found (these are not all necessarily completed): ${codes.slice(0, 80).join(', ')}.` : 'No standard unit codes were detected.',
  ].join('\n\n');
  return { transcript, codes, summary };
}
