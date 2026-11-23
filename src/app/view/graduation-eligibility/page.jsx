'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ConditionalRequireAuth} from '@components/helper';
import {useRole} from '@app/context/RoleContext';
import {useLightDarkMode} from '@app/context/LightDarkMode';
import AccessDenied from '@components/AccessDenied';
import ChatDocumentUpload from '@components/ChatDocumentUpload';
import GraduationEligibilityPanel from '@components/GraduationEligibilityPanel';
import DoubleMajorPanel from '@components/DoubleMajorPanel';
import StudentCatalogueGuard from '@components/StudentCatalogueGuard';
import {isStudentClientEdition} from '@app/libs/studentPortalAccess.mjs';
import {transcriptIdentity} from '@app/libs/studentCatalogueCoverage.mjs';
import {parseTranscriptRows} from '@app/libs/bcsPlannerRules.mjs';
import styles from './page.module.css';
export default function GraduationAndMajors(){
 const {can,isSuperadmin}=useRole(),{theme}=useLightDarkMode();
 const [document,setDocument]=useState(null),[reading,setReading]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState('graduation'),[version,setVersion]=useState(0),[opened,setOpened]=useState({graduation:true});
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('tab')==='double-major'){setTab('double-major');setOpened({'double-major':true});}},[]);
 function choose(next){setTab(next);setOpened(current=>({...current,[next]:true}));window.history.replaceState(null,'',next==='graduation'?'/view/graduation-eligibility':'/view/graduation-eligibility?tab=double-major');}
 function upload(next){setDocument(next);setVersion(v=>v+1);setOpened({[tab]:true});setError('');}
 function panels(planner,published){
  return <>
   <div id="panel-graduation" role="tabpanel" aria-labelledby="tab-graduation" hidden={tab!=='graduation'}>{document&&opened.graduation?<GraduationEligibilityPanel key={'graduation-'+version+'-'+planner?.id} initialDocument={document} exactPlanner={planner}/>:!document&&<p>Upload a DPA to compare completed units with the recorded planner requirements.</p>}</div>
   <div id="panel-double-major" role="tabpanel" aria-labelledby="tab-double-major" hidden={tab!=='double-major'}>{document&&opened['double-major']?<DoubleMajorPanel key={'major-'+version+'-'+planner?.id} initialDocument={document} exactPlanner={planner} published={published}/>:!document&&<p>Upload a DPA to explore a second major.</p>}</div>
  </>;
 }
 function initialIdentity(){
  const rows=document?.rows || [];
  const index=rows.findIndex(r=>r.some(cell=>String(cell).trim().toLowerCase()==='course'));
  if(index<0)return {};
  const records=rows.slice(index+1).map(row=>Object.fromEntries(rows[index].map((header,i)=>[String(header).trim(),row[i]])));
  return transcriptIdentity(records,parseTranscriptRows(records).intakeTerm);
 }
 return <ConditionalRequireAuth>{!(isSuperadmin()||can('planner','read'))?<AccessDenied requiredPermission="planner:read" resourceName="graduation and double major checks"/>:<main className={styles.page} data-theme={theme}>
  <Link href="/view/dashboard">Back to dashboard</Link>
  <header><h1>Graduation & Double Major</h1><p>Upload one DPA to check graduation requirements and explore a second major.</p></header>
  <section className={styles.panel}><h2>Student DPA</h2><ChatDocumentUpload document={document} onChange={upload} busy={reading} setReading={setReading} onError={setError} helpText="Upload the DPA XLSX export (up to 5 MB). It is parsed in this browser and compared with published planner data; the file itself is not uploaded."/>{error&&<p role="alert" className={styles.error}>{error}</p>}</section>
  <div role="tablist" aria-label="Academic checks" className={styles.buttons}>{[['graduation','Graduation eligibility'],['double-major','Double major pathway']].map(([id,label])=><button key={id} id={'tab-'+id} role="tab" aria-selected={tab===id} aria-controls={'panel-'+id} className={tab===id?styles.primary:undefined} onClick={()=>choose(id)}>{label}</button>)}</div>
  {document&&isStudentClientEdition()?<StudentCatalogueGuard key={version} initial={initialIdentity()}>
   {(planner,identity,published)=>panels(planner,published)}
  </StudentCatalogueGuard>:panels()}
 </main>}</ConditionalRequireAuth>;
}
