'use client';
import { useState } from 'react';
import Auth from '@utils/auth/FrontendAuthHelper';
import { compareText } from '@app/libs/unitReplacement.mjs';

export default function ReplacementWorkspace() {
  const [view,setView]=useState('student');
  const [code,setCode]=useState('');
  const [name,setName]=useState('');
  const [data,setData]=useState(null);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [oldSyllabus,setOldSyllabus]=useState('');
  const [newSyllabus,setNewSyllabus]=useState('');
  const [notes,setNotes]=useState('');
  const candidate=data?.suggestions.find(u=>u.code===selected);
  const comparison=compareText(oldSyllabus,newSyllabus);
  function clear(){setData(null);setSelected('');setOldSyllabus('');setNewSyllabus('');setNotes('');setError('');}
  async function search(e){
    e.preventDefault();clear();setBusy(true);
    try{
      const response=await Auth.authenticatedFetch('/api/unit-replacements',{method:'POST',body:JSON.stringify({code,name})});
      const result=await response.json();if(!response.ok || !result.success)throw new Error(result.message);
      setData(result);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function download(){
    const draft={status:'Draft — not an approval',checkedAt:data.checkedAt,source:data.source,candidate,syllabusEvidence:{source:'Manually supplied; not verified',original:oldSyllabus,candidate:newSyllabus,textOverlap:oldSyllabus.trim()&&newSyllabus.trim()?comparison.score:null},reviewNotes:notes,pendingChecks:['Learning outcomes and assessment equivalence','Prerequisites and course credit rules','Intake applicability and semester availability','HOD approval']};
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='unit-replacement-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="mb-8 rounded-2xl border border-gray-200 bg-white text-gray-900 overflow-hidden">
    <div className="bg-slate-900 text-white p-6 md:p-8">
      <p className="text-xs uppercase tracking-widest text-slate-300 mb-2">Unit replacement guidance</p>
      <h2 className="text-2xl font-bold">Your unit has changed. Find your next step.</h2>
      <p className="text-slate-300 mt-2 max-w-3xl">Look up an older or unavailable unit, explore published alternatives, and prepare the evidence for academic review.</p>
      <div className="flex gap-2 mt-5" role="group" aria-label="Information view">{[['student','Student guide'],['hod','HOD review view']].map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view===id?'bg-white text-slate-900':'border border-slate-600 text-white'}`}>{label}</button>)}</div>
    </div>
    <div className="p-6 space-y-6">
      <ol className="grid md:grid-cols-3 gap-3 text-sm">{['1. Identify the original unit','2. Compare replacement candidates','3. Review evidence with your HOD'].map(s=><li key={s} className="bg-slate-50 rounded-lg p-3 font-medium">{s}</li>)}</ol>
      <form onSubmit={search} className="grid md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
        <label className="text-sm font-medium">Original unit code<input required maxLength={40} disabled={busy} value={code} onChange={e=>{setCode(e.target.value);clear();}} placeholder="e.g. COS20031" className="block w-full border rounded-lg p-3 mt-1" /></label>
        <label className="text-sm font-medium">Original name, if code is no longer listed<input maxLength={200} disabled={busy} value={name} onChange={e=>{setName(e.target.value);clear();}} placeholder="Enter the unit title" className="block w-full border rounded-lg p-3 mt-1" /></label>
        <button disabled={busy || !code.trim()} className="bg-red-700 text-white rounded-lg px-5 py-3 disabled:opacity-50">{busy?'Searching…':'Find candidates'}</button>
      </form>
      {error&&<p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
      <p className="text-sm text-gray-600">Publication status is not an expiry date. A similar title is a search lead, not confirmation of equivalent syllabus or approval.</p>
      {data&&<div aria-live="polite" className="space-y-5">
        <div className="border-l-4 border-blue-600 bg-blue-50 p-4"><h3 className="font-bold">{data.source.code} · {data.source.name}</h3><p className="text-sm mt-1">Database status: {data.source.availability} · {data.source.creditPoints??'Unknown'} CP</p><p className="text-sm mt-2">{data.source.availability.toLowerCase()==='published'?'This unit is still published. Confirm why a replacement is needed before changing your plan.':'Confirm retirement and the applicable intake with your HOD; an unpublished or missing record does not establish expiry.'}</p>{data.source.records>1&&<p className="text-sm mt-2">Multiple database records exist for this code. Confirm the applicable version.</p>}</div>
        <div className="flex justify-between gap-3"><h3 className="text-lg font-bold">Replacement candidates ({data.suggestions.length})</h3><span className="text-sm text-gray-500">Ranked by title overlap</span></div>
        {!data.suggestions.length&&<p className="p-5 bg-slate-50 rounded-lg">No title-based candidates found. Ask your HOD to identify a unit using learning outcomes and syllabus evidence.</p>}
        <div className="grid lg:grid-cols-2 gap-4">{data.suggestions.map(u=><article key={u.code} className={`border rounded-xl p-5 ${selected===u.code?'border-blue-600 bg-blue-50/40':'border-gray-200'}`}>
          <div className="flex justify-between gap-3"><span className="font-mono font-bold">{u.code}</span><span className="text-xs bg-amber-50 text-amber-900 px-2 py-1 rounded">Needs academic review</span></div>
          <h4 className="font-semibold mt-2">{u.name}</h4>
          <dl className="grid grid-cols-2 gap-3 text-sm my-4"><div><dt className="text-gray-500">Credits</dt><dd>{u.credits??'Unknown'} CP · {u.creditMatch===null?'Original credits unknown':u.creditMatch?'Same credits':'Credit difference'}</dd></div><div><dt className="text-gray-500">Recorded semesters</dt><dd>{u.terms.join(', ')||'Not recorded'}</dd></div></dl>
          <p className="text-sm">Shared title terms: {u.sharedWords.join(', ')}</p>
          {view==='hod'&&<p className="text-sm text-gray-600 mt-2">Title overlap: {u.nameScore}/100. Syllabus and learning outcomes: not verified. Published in the unit database; future offering is unconfirmed.</p>}
          <button onClick={()=>{setSelected(u.code);setNewSyllabus('');setNotes('');}} className="mt-4 border border-blue-700 text-blue-800 rounded-lg px-4 py-2 text-sm font-semibold">{selected===u.code?'Selected for comparison':'Compare this candidate'}</button>
        </article>)}</div>
        {candidate&&<div className="border rounded-xl p-5 space-y-4">
          <h3 className="text-lg font-bold">{data.source.code} → {candidate.code}</h3>
          {view==='student'?<div className="bg-slate-50 rounded-lg p-4 text-sm"><p className="font-semibold">Before changing your study plan</p><ul className="list-disc pl-5 mt-2 space-y-1"><li>Bring your intake details and transcript to your HOD.</li><li>Request confirmation of learning outcomes, credits and prerequisites.</li><li>Confirm the replacement is offered in your planned semester.</li></ul><p className="mt-3">This selection is a comparison only. It has not changed your enrolled or completed units.</p></div>:<>
            <p className="text-sm text-gray-600">Paste official syllabus or learning-outcome excerpts to compare wording. Include source URL, version and year in the review notes. Text overlap does not establish academic equivalence.</p>
            <div className="grid md:grid-cols-2 gap-4"><label className="text-sm font-medium">Original syllabus / outcomes<textarea maxLength={20000} value={oldSyllabus} onChange={e=>setOldSyllabus(e.target.value)} className="block w-full border rounded-lg p-3 mt-2" rows={6}/></label><label className="text-sm font-medium">Candidate syllabus / outcomes<textarea maxLength={20000} value={newSyllabus} onChange={e=>setNewSyllabus(e.target.value)} className="block w-full border rounded-lg p-3 mt-2" rows={6}/></label></div>
            {oldSyllabus.trim()&&newSyllabus.trim()&&<p className="text-sm bg-blue-50 p-3 rounded-lg">Supplied text overlap: {comparison.score}/100. Shared terms: {comparison.shared.slice(0,25).join(', ')||'None'}. Evidence is manually supplied and unverified.</p>}
            <label className="block text-sm font-medium">Review notes and evidence sources<textarea maxLength={10000} rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Assess learning outcomes, assessments, prerequisites, credits, applicable intake and offering. Record evidence sources and unresolved questions." className="block w-full border rounded-lg p-3 mt-2"/></label>
          </>}
          <button onClick={download} className="bg-slate-900 text-white rounded-lg px-4 py-2">Download review draft (.json)</button><p className="text-xs text-gray-500">Draft only. No approval is recorded or sent. Notes stay in this browser session until downloaded or cleared.</p>
        </div>}
      </div>}
    </div>
  </section>;
}
