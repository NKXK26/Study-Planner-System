'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { parseTranscript, majorUnits, checkDoubleMajor } from '@app/libs/doubleMajorChecker.mjs';

export default function DoubleMajorChecker() {
  const { can, isSuperadmin } = useRole();
  const hasAccess = isSuperadmin() || can('planner', 'read');
  const [planners, setPlanners] = useState([]);
  const [book, setBook] = useState(null);
  const [sheet, setSheet] = useState('');
  const [fileName, setFileName] = useState('');
  const [selection, setSelection] = useState(['', '']);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hasAccess) return;
    SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner').then(r => r.json()).then(data => {
      if (!data.success) throw new Error(data.message || 'Could not load planners.');
      setPlanners(data.data.filter(p => majorUnits(p).length));
    }).catch(e => setError(e.message));
  }, [hasAccess]);
  async function upload(event) {
    const file = event.target.files?.[0];
    setResult(null); setBook(null); setError(''); setFileName('');
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) { setError('Choose an .xlsx file up to 5 MB.'); return; }
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false });
      const sheets = Object.fromEntries(workbook.SheetNames.map(name => {
        const range = XLSX.utils.decode_range(workbook.Sheets[name]['!ref'] || 'A1');
        if (range.e.r > 10000 || range.e.c > 100) throw new Error('Worksheet exceeds 10,000 rows or 100 columns.');
        return [name, XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true })];
      }));
      setBook(sheets); setSheet(workbook.SheetNames[0]); setFileName(file.name);
    } catch (e) { setError(`Could not read workbook: ${e.message}`); }
    finally { setBusy(false); }
  }
  function check() {
    setError(''); setResult(null);
    try {
      const transcript = parseTranscript(book[sheet]);
      const selected = selection.map(id => planners.find(p => String(p.id) === id)).filter(Boolean);
      setResult({ ...checkDoubleMajor(transcript, selected), transcript });
    } catch (e) { setError(e.message); }
  }
  return <ConditionalRequireAuth>{!hasAccess ? <AccessDenied requiredPermission="planner:read" resourceName="double major checker" /> : <main className="max-w-6xl mx-auto p-6 space-y-6">
    <Link href="/view/dashboard" className="text-blue-700">Back to dashboard</Link>
    <h1 className="text-3xl font-bold">Double Major Checker</h1>
    <p>Upload your transcript and choose two major planners for your intake. Compare completed units against the database requirements. Your spreadsheet is processed in your browser and is not saved.</p>
    <section className="bg-white text-gray-900 border rounded-xl p-6 space-y-4">
      <label className="block font-semibold">Student transcript (.xlsx, up to 5 MB)<input className="block mt-2" type="file" accept=".xlsx" onChange={upload} disabled={busy} /></label>
      <p className="text-sm">Required columns: Course, Status, Earned. Grade and Course Title are also supported. Future units and failed attempts are excluded; earned exemptions count by exact unit code.</p>
      {book && <label className="block">Worksheet<select className="border rounded p-2 ml-3" value={sheet} onChange={e => { setSheet(e.target.value); setResult(null); }}>{Object.keys(book).map(s => <option key={s}>{s}</option>)}</select></label>}
      <div className="grid md:grid-cols-2 gap-4">{selection.map((id, i) => <label key={i}>Major {i + 1} / intake planner<select className="block border rounded p-2 w-full" value={id} onChange={e => { setSelection(s => s.map((v,j) => j === i ? e.target.value : v)); setResult(null); }}><option value="">Select a planner</option>{planners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}</div>
      <button className="bg-red-700 text-white rounded px-5 py-2 disabled:opacity-50" disabled={busy || !book || selection.some(s => !s)} onClick={check}>{busy ? 'Reading workbook…' : 'Check double major'}</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </section>
    {result && <section aria-live="polite" className="space-y-4">
      <h2 className="text-2xl font-semibold">{result.covered ? 'Both major unit requirements covered' : 'Major requirements still need attention'}</h2>
      <p>{fileName} · {sheet}: {result.transcript.completed.length} unique earned units; {result.transcript.excluded.length} excluded rows; {result.transcript.duplicates} duplicate earned rows.</p>
      <p>Shared major units: {result.shared.map(u => u.code).join(', ') || 'None'}. Completed major credit across both majors, counted once: {result.uniqueCompletedCredits} CP.</p>
      <p className="bg-amber-50 text-amber-900 p-3 rounded">This checks stored major unit coverage. Shared units are shown in both majors but credits are counted once. The database does not define double-major overlap approval; course core, elective, total-credit and exemption approval rules still require coordinator review.</p>
      <div className="grid md:grid-cols-2 gap-4">{result.majors.map(m => <article key={m.id} className="border rounded-xl p-4 bg-white text-gray-900">
        <h3 className="font-bold text-lg">{m.name}</h3><p>{m.matched} matched / {m.required} required · {m.remaining} remaining</p><p className="text-sm text-gray-600">{m.source}</p>
        {!m.configured && <p className="text-red-700">Major requirement count is missing or inconsistent with the unit pool. Coverage is provisional; ask the planner administrator to review it.</p>}
        <ul className="mt-3 space-y-2">{m.units.map(u => <li key={u.code}><strong>{u.completed ? '✓ Earned' : 'Missing / insufficient credit'}</strong> — {u.code} {u.name} ({u.credits ?? 'Unknown'} CP)</li>)}</ul>
      </article>)}</div>
      <details className="border rounded p-4"><summary>Earned units outside the selected planners ({result.unmatched.length})</summary><p>These do not automatically replace missing major units.</p><ul>{result.unmatched.map(u => <li key={u.code}>{u.code} — {u.name} ({u.earned} CP)</li>)}</ul></details>
      <details className="border rounded p-4"><summary>Excluded transcript rows ({result.transcript.excluded.length})</summary><ul>{result.transcript.excluded.map(u => <li key={u.row}>Row {u.row}: {u.code} — {u.reason}</li>)}</ul></details>
    </section>}
  </main>}</ConditionalRequireAuth>;
}
