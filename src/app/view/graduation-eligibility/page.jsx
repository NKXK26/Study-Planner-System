'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ConditionalRequireAuth} from '@components/helper';
import AccessDenied from '@components/AccessDenied';
import ChatDocumentUpload from '@components/ChatDocumentUpload';
import {useRole} from '@app/context/RoleContext';
import {useLightDarkMode} from '@app/context/LightDarkMode';
import Auth from '@utils/auth/FrontendAuthHelper';
import styles from './page.module.css';
const labels={'eligible':'Eligible against selected planner','not-eligible':'Not eligible','needs-review':'Needs review','choose-planner':'Confirm actual planner'};
function UnitTable({units}){return <div className={styles.scroll}><table><thead><tr><th>Unit</th><th>Name</th><th>Earned CP</th></tr></thead><tbody>{units.map(u=><tr key={u.code}><th scope="row">{u.code}</th><td>{u.name||'Not provided'}</td><td>{u.earned??u.credits??'Unknown'}</td></tr>)}</tbody></table></div>;}
export default function GraduationEligibility(){
 const {can,isSuperadmin}=useRole(),{theme}=useLightDarkMode();const hasAccess=isSuperadmin()||can('planner','read');
 const [document,setDocument]=useState(null),[result,setResult]=useState(null),[reading,setReading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[plannerId,setPlannerId]=useState(''),[search,setSearch]=useState('');
 const version=useRef(0),pending=useRef(null);
 useEffect(()=>()=>{version.current++;pending.current?.abort();},[]);
 async function check(next=document,id=plannerId){
  if(!next)return;
  pending.current?.abort();const current=++version.current,controller=new AbortController();pending.current=controller;
  setBusy(true);setError('');setResult(null);const timer=setTimeout(()=>controller.abort(),45000);
  try{const response=await Auth.authenticatedFetch('/api/graduation-eligibility',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({document:next,plannerId:id||null})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Could not check this DPA.');if(current===version.current)setResult(data.data);}
  catch(e){if(current===version.current)setError(e.name==='AbortError'?'Checking timed out. Your DPA is retained; try again.':e.message);}
  finally{clearTimeout(timer);if(current===version.current)setBusy(false);}
 }
 function changeDocument(next){version.current++;pending.current?.abort();setBusy(false);setDocument(next);setResult(null);setPlannerId('');setSearch('');setError('');if(next)check(next,'');}
 function choose(id){setPlannerId(String(id));check(document,String(id));}
 const locked=busy||reading,detail=result?.selected||result?.closest;
 const choices=(result?.assessments||[]).filter(a=>String(a.planner.id)===plannerId||a.planner.name.toLowerCase().replace(/[^a-z0-9]/g,'').includes(search.toLowerCase().replace(/[^a-z0-9]/g,'')));
 return <ConditionalRequireAuth>{!hasAccess?<AccessDenied requiredPermission="planner:read" resourceName="graduation eligibility"/>:<main className={styles.page} data-theme={theme}>
  <Link href="/view/dashboard">Back to dashboard</Link>
  <header><h1>Graduation Eligibility</h1><p>Check the student’s completed units against programme requirements. Completing 24 units alone is not enough.</p></header>
  <section className={styles.panel}><h2>Upload the student’s DPA</h2><ChatDocumentUpload document={document} onChange={changeDocument} busy={locked} setReading={setReading} onError={setError} helpText="PDF or XLSX, up to 5 MB. This check uses recorded requirements and does not use the LLM or save the DPA."/>
   <p className={styles.muted}>N and Failed entries do not count. EXM with earned credit counts. Repeated completed attempts count once.</p>
   {locked&&<p role="status">{reading?'Reading DPA…':'Checking planner requirements…'}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
   {document&&!locked&&<button type="button" className={styles.primary} onClick={()=>check()}>Recheck eligibility</button>}
  </section>
  {result&&<div aria-live="polite" className={styles.results}>
   <section className={styles.outcome} data-status={result.status}><h2>{labels[result.status]}</h2><p>{result.reason}</p><p className={styles.muted}>Eligibility here checks recorded unit requirements in the selected programme planner.</p></section>
   <div className={styles.stats}><article><strong>{result.transcript.completedCount}</strong><span>Completed / exempted entries</span></article><article><strong>{result.transcript.earnedCredits}</strong><span>Earned CP, counted once</span></article><article><strong>{result.fulfillingPlanners.length}</strong><span>Planners with requirements covered</span></article></div>
   <section className={styles.panel}><h2>Actual programme and intake</h2><p className={styles.muted}>A high unit match does not identify the student’s enrolled planner. Select their actual record for a confirmed comparison.</p>
    <div className={styles.selectors}><label>Search planners<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="For example 24 Sep CSDS" disabled={locked}/></label><label>Programme planner<select value={plannerId} onChange={e=>choose(e.target.value)} disabled={locked}><option value="">Compare all recorded planners</option>{choices.map(a=><option key={a.planner.id} value={a.planner.id}>{a.planner.name} · {a.matched} unit matches</option>)}</select></label></div>
    {!choices.length&&<p>No planners match that search.</p>}
    {result.status==='choose-planner'&&<div className={styles.buttons}>{result.fulfillingPlanners.map(p=><button key={p.id} type="button" disabled={locked} onClick={()=>choose(p.id)}>Check {p.name}</button>)}</div>}
   </section>
   {detail&&<section className={styles.panel}><h2>{result.selected?'Selected planner':'Closest unit match'}: {detail.planner.name}</h2>{!result.selected&&<p className={styles.muted}>This is an overlap suggestion. It has not been selected as the student’s actual programme.</p>}
    <div className={styles.scroll}><table><thead><tr><th>Requirement</th><th>Completed slots</th><th>Required slots</th><th>Still needed</th></tr></thead><tbody>{detail.categories.map(c=><tr key={c.name}><th scope="row">{c.name}</th><td>{c.completedCount}</td><td>{c.requiredCount??'Not configured'}</td><td>{c.remainingCount??'Needs review'}</td></tr>)}</tbody></table></div>
    {detail.reviewIssues.length>0&&<div className={styles.review}><h3>Records need review</h3><ul>{detail.reviewIssues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
    {detail.categories.map(c=><details key={c.name}><summary>{c.name}: {c.remainingCount===0?'requirements covered':c.remainingCount===null?'required count needs review':c.remainingCount+' more needed'}</summary>
      {c.remainingCount>0&&<><p>{c.options.length===c.remainingCount?'These units are still required:':'Choose '+c.remainingCount+' from the remaining options; every option is not required:'}</p><UnitTable units={c.options}/></>}
      {c.allocations.length>0&&<ul>{c.allocations.map(a=><li key={a.code}>{a.code}: {a.slots} elective slot{a.slots===1?'':'s'} ({a.reason})</li>)}</ul>}
      {c.completedUnits.length>0&&<><h3>Completed units in this category</h3><UnitTable units={c.completedUnits}/></>}
     </details>)}
    {detail.unmatched.length>0&&<details><summary>Completed entries outside this planner ({detail.unmatched.length})</summary><p>These entries do not automatically replace missing core or major units.</p><UnitTable units={detail.unmatched}/></details>}
   </section>}
   <details className={styles.panel}><summary>Compare all planners ({result.assessments.length})</summary><div className={styles.scroll}><table><thead><tr><th>Planner</th><th>Unit matches</th><th>Missing slots</th><th>Recorded coverage</th><th>Inspect</th></tr></thead><tbody>{result.assessments.map(a=><tr key={a.planner.id}><th scope="row">{a.planner.name}</th><td>{a.matched}</td><td>{a.countsVerified?a.remainingSlots:'Needs review'}</td><td>{a.status==='eligible'?'Requirements covered':a.status==='needs-review'?'Needs review':'Incomplete'}</td><td><button type="button" disabled={locked} onClick={()=>choose(a.planner.id)}>Check</button></td></tr>)}</tbody></table></div></details>
   <details className={styles.panel}><summary>DPA entries and excluded attempts</summary><UnitTable units={result.transcript.completed}/><h3>Excluded attempts ({result.transcript.excluded.length})</h3><ul>{result.transcript.excluded.map((u,i)=><li key={u.row??i}>{u.code}: {u.reason}</li>)}</ul><p>{result.transcript.duplicates} duplicate completed attempts removed.</p></details>
  </div>}
 </main>}</ConditionalRequireAuth>;
}
