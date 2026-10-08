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
import styles from './page.module.css';
export default function GraduationAndMajors(){
 const {can,isSuperadmin}=useRole(),{theme}=useLightDarkMode();
 const [document,setDocument]=useState(null),[reading,setReading]=useState(false),[error,setError]=useState(''),[tab,setTab]=useState('graduation'),[version,setVersion]=useState(0),[opened,setOpened]=useState({graduation:true});
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('tab')==='double-major'){setTab('double-major');setOpened({'double-major':true});}},[]);
 function choose(next){setTab(next);setOpened(current=>({...current,[next]:true}));window.history.replaceState(null,'',next==='graduation'?'/view/graduation-eligibility':'/view/graduation-eligibility?tab=double-major');}
 function upload(next){setDocument(next);setVersion(v=>v+1);setOpened({[tab]:true});setError('');}
 return <ConditionalRequireAuth>{!(isSuperadmin()||can('planner','read'))?<AccessDenied requiredPermission="planner:read" resourceName="graduation and double major checks"/>:<main className={styles.page} data-theme={theme}>
  <Link href="/view/dashboard">Back to dashboard</Link>
  <header><h1>Graduation & Double Major</h1><p>Upload one DPA to check graduation requirements and explore a second major.</p></header>
  <section className={styles.panel}><h2>Student DPA</h2><ChatDocumentUpload document={document} onChange={upload} busy={reading} setReading={setReading} onError={setError} helpText="PDF or XLSX, up to 5 MB. Used for both checks; the DPA is not saved or sent to an LLM."/>{error&&<p role="alert" className={styles.error}>{error}</p>}</section>
  <div role="tablist" aria-label="Academic checks" className={styles.buttons}>{[['graduation','Graduation eligibility'],['double-major','Double major pathway']].map(([id,label])=><button key={id} id={'tab-'+id} role="tab" aria-selected={tab===id} aria-controls={'panel-'+id} className={tab===id?styles.primary:undefined} onClick={()=>choose(id)}>{label}</button>)}</div>
  <div id="panel-graduation" role="tabpanel" aria-labelledby="tab-graduation" hidden={tab!=='graduation'}>{document&&opened.graduation?<GraduationEligibilityPanel key={'graduation-'+version} initialDocument={document}/>:!document&&<p>Upload a DPA to compare completed units with the recorded planner requirements.</p>}</div>
  <div id="panel-double-major" role="tabpanel" aria-labelledby="tab-double-major" hidden={tab!=='double-major'}>{document&&opened['double-major']?<DoubleMajorPanel key={'major-'+version} initialDocument={document}/>:!document&&<p>Upload a DPA to find the closest distinct majors and their remaining units.</p>}</div>
 </main>}</ConditionalRequireAuth>;
}
