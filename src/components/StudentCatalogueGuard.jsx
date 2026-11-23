'use client';
import {useEffect,useMemo,useState} from 'react';
import Auth from '@utils/auth/FrontendAuthHelper';
import {normalizeIdentity,plannerCoverage} from '@app/libs/studentCatalogueCoverage.mjs';

export default function StudentCatalogueGuard({initial,children}) {
  const [fields,setFields]=useState(()=>normalizeIdentity(initial));
  const [confirmed,setConfirmed]=useState(null);
  const [catalogue,setCatalogue]=useState(null);
  const [failed,setFailed]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    async function load() {
      try {
        const response=await Auth.authenticatedFetch('/api/official-planners',{cache:'no-store'});
        const payload=await response.json();
        if (!response.ok || !payload.success || !['central','cache'].includes(payload.source) || !Array.isArray(payload.data)) throw Error();
        if (active) setCatalogue(payload);
      } catch { if (active) setFailed(true); }
    }
    load();
    return ()=>{active=false;};
  },[attempt]);
  const coverage=useMemo(()=>plannerCoverage(catalogue?.data || [],confirmed),[catalogue,confirmed]);
  const options=(field)=>[...new Set((catalogue?.data || []).filter(p=>p.status==='Published').map(p=>normalizeIdentity(p)[field]).filter(Boolean))].sort();
  const edit=(field,value)=>{setConfirmed(null);setFields(current=>({...current,[field]:value}));};
  const reload=()=>{setCatalogue(null);setFailed(false);setAttempt(n=>n+1);};
  const normalized=normalizeIdentity(fields);
  const ready=Object.values(normalized).every(Boolean);
  return <>
    <section className="card-bg p-6 rounded-theme shadow-theme mb-6" aria-label="Student-confirmed enrolment">
      <h2 className="text-lg font-semibold">Confirm your enrolment</h2>
      <p>Check your course, intake and major against your enrolment record. Your first transcript term may differ from your intake.</p>
      <form className="my-3 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();if(ready)setConfirmed({...normalized,confirmed:true});}}>
        {[['courseCode','Course code'],['major','Major'],['intakeYear','Intake year'],['intakeMonth','Intake month (1–12)']].map(([field,title])=>
          <label key={field}>{title}
            <input className="block rounded border p-2" required type={field.startsWith('intake')?'number':'text'}
              min={field==='intakeMonth'?1:field==='intakeYear'?1000:undefined} max={field==='intakeMonth'?12:field==='intakeYear'?9999:undefined}
              maxLength={120} list={'enrolment-'+field} value={fields[field]??''} onChange={e=>edit(field,e.target.value)}/>
            <datalist id={'enrolment-'+field}>{options(field).map(v=><option key={v} value={v}/>)}</datalist>
          </label>)}
        <button className="rounded border px-3 py-2" disabled={!ready || !!confirmed}>Confirm enrolment</button>
      </form>
      {confirmed && <p>Student-confirmed enrolment: {confirmed.courseCode} · {confirmed.intakeMonth}/{confirmed.intakeYear} · {confirmed.major}</p>}
      {failed ? <p role="alert">The published catalogue is temporarily unreachable and no recent copy is available. Your transcript is retained. <button type="button" className="underline" onClick={reload}>Retry catalogue</button></p>
        : !catalogue ? <p role="status">Checking published catalogue coverage…</p> : <>
          {catalogue.warning && <p role="status">{catalogue.warning}</p>}
          {coverage.state==='review' && <div role="alert"><strong>HOD academic review required</strong><p>{coverage.message}</p><button type="button" className="underline" onClick={reload}>Recheck published coverage</button></div>}
          {coverage.state==='exact' && <p>Published planner: {coverage.planner.name}. Confirm academic advice with your course adviser before enrolment.</p>}
        </>}
    </section>
    {catalogue && coverage.state==='exact' && children(coverage.planner,confirmed,catalogue.data)}
  </>;
}
