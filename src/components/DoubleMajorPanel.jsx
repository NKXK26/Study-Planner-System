'use client';
import {useMemo,useRef,useState,useEffect} from 'react';
import Link from 'next/link';
import {ConditionalRequireAuth} from '@components/helper';
import {useRole} from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import Auth from '@utils/auth/FrontendAuthHelper';
import ChatDocumentUpload from '@components/ChatDocumentUpload';
import {documentEvidence} from '@app/libs/chatDpa.mjs';

function Units({units,earned=false}){
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-100"><tr><th className="p-3">Unit</th><th className="p-3">Name</th><th className="p-3">{earned?'Earned CP':'CP'}</th><th className="p-3">{earned?'Grade':'Counts toward'}</th></tr></thead><tbody>{units.map(u=><tr key={u.code} className="border-b border-neutral-200"><th scope="row" className="p-3 whitespace-nowrap">{u.code}</th><td className="p-3">{u.name||'Not provided'}</td><td className="p-3">{earned?u.earned:u.credits??'Unknown'}</td><td className="p-3">{earned?(u.grade==='EXM'?'EXM (exempted)':u.grade||'Not provided'):(u.countsToward||[]).join(' / ')}</td></tr>)}</tbody></table></div>;
}
export default function DoubleMajorPanel({initialDocument=null}){
  const {can,isSuperadmin}=useRole();const hasAccess=isSuperadmin()||can('planner','read');
  const [document,setDocument]=useState(initialDocument),[result,setResult]=useState(null),[error,setError]=useState(''),[reading,setReading]=useState(false),[busy,setBusy]=useState(false);
  const [term,setTerm]=useState(()=>new Date().getMonth()<6?'Semester 2':'Semester 1');
  const [year,setYear]=useState(()=>new Date().getFullYear()+(new Date().getMonth()<6?0:1));
  const [primary,setPrimary]=useState(''),[secondary,setSecondary]=useState('');
  const pending=useRef(null);const requestVersion=useRef(0);
  useEffect(()=>{if(initialDocument)generate(initialDocument);return ()=>{requestVersion.current++;pending.current?.abort();};},[initialDocument]);
  const evidence=useMemo(()=>document?documentEvidence(document):null,[document]);
  async function generate(nextDocument=document,overrides={}){
    if(!nextDocument)return;
    pending.current?.abort();const version=++requestVersion.current;const controller=new AbortController();pending.current=controller;
    setBusy(true);setError('');setResult(null);
    const timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await Auth.authenticatedFetch('/api/double-major-pathway',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({document:nextDocument,term,year:Number(year),...overrides})});
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Could not generate this draft.');
      if(version!==requestVersion.current)return;
      setResult(data.data);setPrimary(String(data.data.primary.id));setSecondary(String(data.data.secondary.id));
    }catch(e){if(version===requestVersion.current)setError(e.name==='AbortError'?'The request timed out. Your DPA is retained; please retry.':e.message);}
    finally{clearTimeout(timer);if(version===requestVersion.current)setBusy(false);}
  }
  function changeDocument(next){
    requestVersion.current++;pending.current?.abort();setBusy(false);setDocument(next);setResult(null);setPrimary('');setSecondary('');setError('');
    if(next)generate(next);
  }
  const locked=busy||reading;
  return <ConditionalRequireAuth>{!hasAccess?<AccessDenied requiredPermission="planner:read" resourceName="double major checker"/>:<section className="mx-auto max-w-6xl space-y-6 p-4 text-neutral-950 sm:p-6">

    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-xl font-semibold">Double major pathway</h2>
      <p className="text-sm text-neutral-600">N means failed and is excluded. EXM with positive earned credit counts as completed. Only explicit DPA table records count; a unit mentioned in text is not assumed complete.</p>
      <details><summary className="cursor-pointer font-medium">Change the starting semester (optional)</summary><div className="mt-3 flex flex-wrap gap-3"><label>Semester<select className="ml-2 rounded-lg border p-2" disabled={locked} value={term} onChange={e=>{setTerm(e.target.value);setResult(null);}}><option>Semester 1</option><option>Semester 2</option></select></label><label>Year<input type="number" min="2000" max="2100" className="ml-2 w-28 rounded-lg border p-2" disabled={locked} value={year} onChange={e=>{setYear(e.target.value);setResult(null);}}/></label></div><p className="mt-2 text-sm text-neutral-600">The initial semester is a calendar assumption. Offerings are recurring records, not confirmation for a particular year.</p></details>
      <button disabled={locked||!evidence?.transcript} onClick={()=>generate()} className="rounded-lg bg-red-700 px-5 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-50">{busy?'Building your pathway…':reading?'Reading DPA…':'Find closest majors and draft semesters'}</button>
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      {document&&!evidence?.transcript&&<p role="alert" className="text-red-700">The completed-unit table could not be verified. Upload a readable XLSX with Course, Status and Earned columns.</p>}
    </section>
    {evidence?.transcript&&<section className="rounded-2xl border border-neutral-200 bg-white p-5"><h2 className="text-xl font-semibold">Completed units from your DPA</h2><p className="my-3">{evidence.transcript.completed.length} unique completed / exempted units · {evidence.transcript.completed.reduce((n,u)=>n+u.earned,0)} earned CP</p><details><summary className="cursor-pointer">View completed units</summary><Units units={evidence.transcript.completed} earned/></details><details className="mt-3"><summary className="cursor-pointer">Excluded rows ({evidence.transcript.excluded.length}) and duplicates ({evidence.transcript.duplicates})</summary><ul className="mt-2 space-y-2">{evidence.transcript.excluded.map(u=><li key={u.row}>{u.code}: {u.reason}</li>)}</ul><p className="mt-2 text-sm">Repeated earned attempts count once. Generic elective codes do not replace specific major units automatically.</p></details></section>}
    {result&&<div className="space-y-6" aria-live="polite">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="text-2xl font-semibold">Your suggested major pair</h2><p className="mt-2 text-sm text-neutral-700">Primary planner follows the highest completed-unit match. The second major is ranked by completed electives and other earned units matching its major pool; core pools are not compared. Different intakes of the same major are grouped.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{result.coverage.majors.map((m,i)=><article key={m.id} className="rounded-xl border border-neutral-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-red-700">{i?'Second major':'Primary planner'}</p><h3 className="mt-2 text-lg font-bold">{m.name}</h3><p className="mt-2">{m.matched} completed major units · {m.required} required · <strong>{m.remaining} remaining</strong></p><p className="mt-1 text-sm text-neutral-600">{m.source}</p><details className="mt-3"><summary className="cursor-pointer">View major unit coverage</summary><ul className="mt-2 space-y-2">{m.units.map(u=><li key={u.code}><strong>{u.completed?'Earned':'Remaining choice'}</strong>: {u.code} {u.name} ({u.credits??'Unknown'} CP)</li>)}</ul></details></article>)}</div>
      <p className="mt-4 text-sm">Shared major units: {result.coverage.shared.map(u=>u.code).join(', ')||'none'}. Shared units are scheduled once; their applicability to both majors needs confirmation.</p>
      <details className="mt-4"><summary className="cursor-pointer font-medium">Choose another major pair or intake</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{[['Primary major',primary,setPrimary],['Second major',secondary,setSecondary]].map(([label,value,change])=><label key={label}>{label}<select className="mt-1 block w-full rounded-lg border bg-white p-2" disabled={locked} value={value} onChange={e=>change(e.target.value)}>{result.choices.map(r=><option key={r.id} value={r.id}>{r.name} — {r.majorMatched} major / {r.matched} total matches</option>)}</select></label>)}</div><button disabled={locked||primary===secondary} onClick={()=>generate(document,{primaryId:primary,secondaryId:secondary})} className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-red-800 disabled:opacity-50">Recalculate this pair</button></details></section>
      <section className="space-y-4"><h2 className="text-2xl font-semibold">Future-semester draft</h2><p className="rounded-xl border border-neutral-200 bg-white p-4">{result.completeDraft?'This draft covers the stored unit counts, assuming you pass every suggested unit.':'A complete pathway could not be scheduled from the available records. Review the outstanding units below.'} This is provisional and does not confirm double-major or graduation eligibility.</p><p className="text-sm text-neutral-600">Up to four units / 50 CP per semester. Schedules remaining major requirements; future credit assumes successful completion.</p>
      {result.semesters.length?result.semesters.map((semester,i)=><article key={i} className="rounded-2xl border border-neutral-200 bg-white p-5"><h3 className="text-lg font-semibold">{semester.term} {semester.year}</h3><p className="mb-3 mt-1 text-sm text-neutral-600">{semester.selected.length}/4 units · {semester.credits} CP</p>{semester.selected.length?<Units units={semester.selected}/>:<p>No units pass the recorded checks for this semester. The following semester is checked for different offerings.</p>}</article>):<p>The stored counts are already covered; no additional units were drafted.</p>}
      {!result.completeDraft&&<section className="rounded-2xl border border-red-200 bg-white p-5"><h3 className="text-lg font-semibold">Still unresolved after this draft</h3><p className="mt-2">{result.remaining.majors.map(m=>m.name+': '+m.remaining+' major units remaining').join(' · ')}</p>{result.remaining.categories.filter(c=>c.remaining).map(c=><p key={c.name}>{c.name}: {c.remaining} units remaining</p>)}<ul className="mt-3 space-y-3">{result.outstanding.map(u=><li key={u.code}><strong>{u.code} {u.name}</strong>: {[...u.reasons,...u.unknown].join('; ')||'Not scheduled within this draft’s semester or category limits.'}</li>)}</ul></section>}
      <details className="rounded-xl border border-neutral-200 bg-white p-5"><summary className="cursor-pointer font-semibold">Checks and assumptions</summary><ul className="mt-3 list-disc space-y-3 pl-5">{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details></section>
    </div>}
  </section>}</ConditionalRequireAuth>;
}
