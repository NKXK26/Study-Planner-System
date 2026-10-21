'use client';
import { useEffect, useMemo, useState } from 'react';
import Auth from '@utils/auth/FrontendAuthHelper';
import { reviewDpa } from '@app/libs/academicPlanning.mjs';

export default function ChatAcademicPlanning({ document, busy, onResult, onBusy, onContext, mode, initialContext, command }) {
  const [options,setOptions]=useState(null), [error,setError]=useState(''), [loading,setLoading]=useState(false);
  const [intakeId,setIntake]=useState(initialContext?.intakeId||''), [plannerId,setPlanner]=useState(initialContext?.plannerId||''), [term,setTerm]=useState(initialContext?.term||'');
  const [year,setYear]=useState(initialContext?.year||new Date().getFullYear()), [maxUnits,setMaxUnits]=useState(initialContext?.maxUnits||4), [maxCredits,setMaxCredits]=useState(initialContext?.maxCredits||50);
  const [corrections,setCorrections]=useState(initialContext?.corrections||[]), [dpaConfirmed,setDpaConfirmed]=useState(initialContext?.dpaConfirmed===true), [programmeConfirmed,setProgrammeConfirmed]=useState(initialContext?.programmeConfirmed===true);
  const [result,setResult]=useState(null);
  const review=useMemo(()=>{try{return reviewDpa(document);}catch(e){return {error:e.message};}},[document]);
  const correctedReview=useMemo(()=>{try{return reviewDpa(document,corrections);}catch(e){return {error:e.message};}},[document,corrections]);
  const rows=review.original ? [...review.original.completed,...review.original.excluded].sort((a,b)=>a.row-b.row) : [];
  const locked=busy||loading;
  const displayStatus = unit => ({complete:'Complete',completed:'Complete',passed:'Complete',exm:'Exempted',exempt:'Exempted',exempted:'Exempted',failed:'Failed',current:'Current',future:'Future'}[unit.status] || (review.original?.completed.includes(unit)?'Complete':'Current'));
  function invalidate(){setResult(null);}
  async function load(){
    setLoading(true);setError('');
    try { const response=await Auth.authenticatedFetch('/api/planner-assistant/planning',{signal:AbortSignal.timeout(15000)}); const data=await response.json(); if(!response.ok||!data.success)throw new Error(data.message||'Could not load choices.');setOptions(data); }
    catch(e){setError(e.message);}finally{setLoading(false);}
  }
  useEffect(()=>{if(mode==='suggestions'&&!options)load();},[mode]);
  useEffect(()=>{if(!command)return;const s=command.settings;if(s.maxUnits)setMaxUnits(s.maxUnits);if(s.maxCredits)setMaxCredits(s.maxCredits);if(s.year)setYear(s.year);if(s.term)setTerm(s.term);setResult(null);},[command]);
  useEffect(()=>{onBusy(loading);return ()=>onBusy(false);},[loading,onBusy]);
  useEffect(()=>{
    onContext({corrections,dpaConfirmed,programmeConfirmed,intakeId:Number(intakeId),plannerId:Number(plannerId),term,year:Number(year),maxUnits:Number(maxUnits),maxCredits:Number(maxCredits),hasGeneratedPlan:Boolean(result)});
  },[corrections,dpaConfirmed,programmeConfirmed,intakeId,plannerId,term,year,maxUnits,maxCredits,result,onContext]);
  function edit(unit,key,value){
    setDpaConfirmed(false);invalidate();
    setCorrections(current=>{
      const prior=current.find(e=>e.row===unit.row)||{row:unit.row,status:displayStatus(unit),grade:unit.grade,earned:Number.isFinite(unit.earned)?unit.earned:0,reason:''};
      return [...current.filter(e=>e.row!==unit.row),{...prior,[key]:value}];
    });
  }
  async function generate(){
    if(locked)return;setLoading(true);setError('');setResult(null);
    try {
      const response=await Auth.authenticatedFetch('/api/planner-assistant/planning',{method:'POST',signal:AbortSignal.timeout(30000),body:JSON.stringify({document,corrections,dpaConfirmed,programmeConfirmed,intakeId:Number(intakeId),plannerId:Number(plannerId),term,year:Number(year),maxUnits:Number(maxUnits),maxCredits:Number(maxCredits)})});
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Could not generate plan.');
      setResult(data);onResult(`Semester draft for ${data.programme}, ${data.year} ${data.term}: ${data.plan.selected.map(u=>u.code).join(', ')||'No units could be selected with the available evidence'} (${data.plan.credits} CP). Review the reasons and unresolved checks in the planning card below.`);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  const fieldClass='block w-full rounded border border-gray-300 bg-white text-gray-900 p-2 mt-1';
  return <details className="rounded-2xl border border-neutral-200 bg-white text-neutral-900 p-4 sm:p-6" open>
    <summary className="font-semibold cursor-pointer">{mode==='suggestions'?'Review DPA and plan a semester':'Review completed DPA entries'}</summary>
    <fieldset disabled={locked} className="mt-3 space-y-3 disabled:opacity-60">
      <p className="text-xs">{mode==='suggestions'?'Review results, confirm your programme and workload, then generate a draft.':'Check completed/exempted and excluded entries, then confirm the review.'}</p>
      {review.error ? <p role="alert">The DPA table could not be read reliably: {review.error} Attach its XLSX export to review and plan here.</p> : <>
        <p className="text-sm">{correctedReview.transcript ? `${correctedReview.transcript.completed.length} completed/exempted entries; ${correctedReview.transcript.excluded.length} excluded attempts (including corrections).` : 'Complete the correction details to update totals.'} N or Failed status is excluded even with EXM. Only recorded earned credit counts.</p>
        <details><summary className="cursor-pointer underline">Review / correct extracted DPA rows</summary>
          <div className="max-h-72 overflow-auto space-y-3 mt-2">{rows.map(unit=>{
            const correction=corrections.find(e=>e.row===unit.row);
            return <div key={unit.row} className="border border-neutral-200 rounded-xl p-4 text-sm space-y-2">
              <p><strong>{unit.code}</strong> {unit.name} — original row {unit.row}</p>
              <p>Original: {unit.grade||'No grade'}, {unit.earned} earned CP. {unit.reason||'Completed / exempted'}</p>
              <label>Status<select className={fieldClass} value={correction?.status || (displayStatus(unit))} onChange={e=>edit(unit,'status',e.target.value)}>{['Complete','Exempted','Failed','Current','Future'].map(v=><option key={v}>{v}</option>)}</select></label>
              <label>Grade<input className={fieldClass} maxLength={12} value={correction?.grade ?? unit.grade} onChange={e=>edit(unit,'grade',e.target.value)} /></label>
              <label>Earned CP<input className={fieldClass} type="number" min="0" max="100" step="0.5" value={correction?.earned ?? (Number.isFinite(unit.earned)?unit.earned:0)} onChange={e=>edit(unit,'earned',Number(e.target.value))}/></label>
              {correction && <><label>Reason for correction (required)<input className={fieldClass} maxLength={300} value={correction.reason} onChange={e=>edit(unit,'reason',e.target.value)}/></label><button type="button" className="underline" onClick={()=>{setCorrections(c=>c.filter(e=>e.row!==unit.row));setDpaConfirmed(false);invalidate();}}>Undo correction</button></>}
            </div>;
          })}</div>
        </details>
        {correctedReview.error && <p role="alert" className="text-red-700">{correctedReview.error}</p>}
        <label className="block text-sm"><input type="checkbox" disabled={Boolean(correctedReview.error)} checked={dpaConfirmed} onChange={e=>{setDpaConfirmed(e.target.checked);invalidate();}}/> I reviewed the completed/exempted and excluded entries and any corrections.</label>
      </>}
      {mode==='suggestions' && <>{!options ? <button type="button" onClick={load} className="underline">{loading?'Loading choices…':'Retry programme choices'}</button> : <>
        <label className="block text-sm">Course / major / intake<select className={fieldClass} value={intakeId} onChange={e=>{setIntake(e.target.value);setProgrammeConfirmed(false);invalidate();}}><option value="">Select your actual programme</option>{options.intakes.map(i=><option key={i.id} value={i.id}>{i.label}{i.status?.toLowerCase()!=='published'?' (not published)':''}</option>)}</select></label>
        <label className="block text-sm">Applicable study planner<select className={fieldClass} value={plannerId} onChange={e=>{setPlanner(e.target.value);setProgrammeConfirmed(false);invalidate();}}><option value="">Select your planner</option>{options.planners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <p className="text-xs">Planner pools are not formally linked to course intakes in this database. Confirm the appropriate planner with your advisor if unsure.</p>
        <label className="block text-sm"><input type="checkbox" checked={programmeConfirmed} onChange={e=>{setProgrammeConfirmed(e.target.checked);invalidate();}}/> This is my programme, intake and applicable planner.</label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label>Target year<input className={fieldClass} type="number" min="2000" max="2100" value={year} onChange={e=>{setYear(e.target.value);invalidate();}}/></label>
          <label>Semester<select className={fieldClass} value={term} onChange={e=>{setTerm(e.target.value);invalidate();}}><option value="">Choose semester</option>{options.terms.map(t=><option key={t}>{t}</option>)}</select></label>
          <label>Maximum units<input className={fieldClass} type="number" min="1" max="8" value={maxUnits} onChange={e=>{setMaxUnits(e.target.value);invalidate();}}/></label>
          <label>Requested credit cap<input className={fieldClass} type="number" min="1" max="100" step="0.5" value={maxCredits} onChange={e=>{setMaxCredits(e.target.value);invalidate();}}/></label>
        </div>
        <button type="button" onClick={generate} disabled={!dpaConfirmed||!programmeConfirmed||!intakeId||!plannerId||!term||Boolean(review.error)} className="rounded bg-red-700 text-white px-3 py-2 disabled:opacity-40">{loading?'Checking recorded rules…':'Generate semester draft'}</button>
      </>}
      </>}
    </fieldset>
    {error && <p role="alert" className="text-red-700 mt-2">{error}</p>}
    {mode==='suggestions' && result && <div className="space-y-3 mt-4 text-sm">
      <h3 className="font-semibold">Provisional semester draft · {result.plan.credits} CP</h3>
      {result.plan.selected.length ? <ul className="space-y-2">{result.plan.selected.map(u=><li key={u.code}><strong>{u.code}</strong> {u.name} ({u.credits} CP)<p className="text-xs">Recorded offering and category space found; requisite checks passed. [{u.sourceId}]</p>{u.rules.map(r=><p key={r} className="text-xs">{r}</p>)}</li>)}</ul> : <p>No units can be selected with the current evidence and workload limits. Review the checks below.</p>}
      <details><summary>All remaining candidates and reasons</summary>{result.plan.candidates.map(u=><p key={u.code} className="mt-2"><strong>{u.code}: {u.status}</strong> — {[...u.reasons,...u.unknown].join('; ')||'Passes recorded checks; selection is subject to workload and category limits.'}</p>)}</details>
      <ul className="list-disc pl-5 text-neutral-700">{result.plan.warnings.map(w=><li key={w}>{w}</li>)}</ul>
    </div>}
  </details>;
}
