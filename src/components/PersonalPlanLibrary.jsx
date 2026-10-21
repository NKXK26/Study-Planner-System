'use client';
import {useEffect,useRef,useState} from 'react';
import {readPersonalDrafts,writePersonalDrafts} from '@app/libs/personalPlanDrafts.mjs';
import ChatPlannerDownload from './ChatPlannerDownload';
const identity=()=>{try{return JSON.parse(localStorage.getItem('userProfile')||'null')?.email||'dev';}catch{return 'dev';}};
export default function PersonalPlanLibrary({snapshot,open,onOpen,command,onRecheck,busy,onMessage}) {
  const [drafts,setDrafts]=useState([]),[name,setName]=useState(''),[error,setError]=useState('');
  const processed=useRef(null);
  useEffect(()=>{try{setDrafts(readPersonalDrafts(localStorage,identity()));}catch{setError('Saved drafts are unavailable in this browser.');}},[]);
  function save(){
    if(!snapshot){setError('Generate a suggestion or pathway first, then save it.');return;}
    try{
      const next=[{id:crypto.randomUUID(),name:(name.trim()||snapshot.planner.name+' draft').slice(0,100),savedAt:new Date().toISOString(),snapshot},...readPersonalDrafts(localStorage,identity())];
      writePersonalDrafts(localStorage,identity(),next);setDrafts(next);setError('');setName('');onMessage?.('Your draft is saved in this browser. Upload an updated DPA and use Recheck with current DPA to see what changed.');
    }catch(e){setError(e.message||'Could not save. Your current draft is still available.');}
  }
  useEffect(()=>{if(command?.id&&processed.current!==command.id){processed.current=command.id;save();}},[command]);
  function remove(id){try{const next=readPersonalDrafts(localStorage,identity()).filter(d=>d.id!==id);writePersonalDrafts(localStorage,identity(),next);setDrafts(next);setError('');}catch{setError('Could not remove the saved draft.');}}
  return <section className="border-b border-neutral-200 bg-white px-4 py-2 text-sm sm:px-7" aria-label="Personal saved plans">
    <button type="button" onClick={()=>onOpen(!open)} className="font-semibold text-red-700 underline" aria-expanded={open}>Saved plans ({drafts.length})</button>
    {open&&<div className="mt-2 max-h-60 space-y-3 overflow-auto">
      <p className="text-xs text-neutral-600">Saved on this browser for your account. The uploaded DPA itself is not saved here.</p>
      <div className="flex gap-2"><input className="min-w-0 flex-1 rounded border px-2 py-1" aria-label="Draft name" value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="Draft name (optional)"/><button type="button" disabled={busy||!snapshot} onClick={save} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-40">Save current draft</button></div>
      {drafts.map(d=><div key={d.id} className="rounded border border-neutral-200 p-3"><p className="font-semibold">{d.name}</p><p className="text-xs">{d.snapshot.planner.name} · {d.snapshot.term} {d.snapshot.year} · {d.snapshot.planMode==='double-major'?'Double-major pathway':d.snapshot.planMode==='full'?'Pathway':'Semester draft'}</p><ChatPlannerDownload snapshot={d.snapshot}/><button type="button" disabled={busy} onClick={()=>onRecheck(d)} className="mr-3 text-red-700 underline disabled:opacity-40">Recheck with current DPA</button><button type="button" onClick={()=>remove(d.id)} className="text-neutral-600 underline">Delete</button></div>)}
      {!drafts.length&&<p>No saved drafts yet.</p>}
    </div>}
    {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
  </section>;
}
