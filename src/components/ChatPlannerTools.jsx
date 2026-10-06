'use client';
import {useEffect,useRef,useState} from 'react';
import Auth from '@utils/auth/FrontendAuthHelper';
import {attachmentKey} from '@app/libs/plannerIntent.mjs';
import {chatWorkflows} from '@app/libs/plannerToolDefinitions.mjs';
import {useChatSession,saveRequestId,completeSaveRequest} from './useChatSession';
import {extractPlannerCodes,extractPlannerCategories} from '@app/libs/plannerImport.mjs';

const workspaceTasks=chatWorkflows.filter(task=>['dpa','compare','suggestions','double-major'].includes(task.id));
const inputClass='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
function SearchSelect({label,items,value,onChange,disabled}){
  const [search,setSearch]=useState('');
  const matches=items.filter(p=>String(p.id)===String(value)||`${p.name} ${p.id}`.toLowerCase().includes(search.toLowerCase()));
  return <label className="block space-y-1 text-sm"><span className="font-medium">{label}</span><input aria-label={`Search ${label}`} className={inputClass} value={search} disabled={disabled} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…"/><select aria-label={label} className={inputClass} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Select a record</option>{matches.map(p=><option key={p.id} value={p.id}>{p.name} (ID {p.id})</option>)}</select>{!matches.length&&<span className="text-xs">No matches. Try a shorter search.</span>}</label>;
}
function UnitList({units}){
  return <div className="max-h-64 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Code</th><th>Name</th><th>CP</th><th>Category</th></tr></thead><tbody>{units.map((u,i)=><tr key={`${u.ID||u.code}-${i}`} className="border-t"><td className="py-2 pr-2 font-medium">{u.UnitCode||u.code}</td><td className="pr-2">{u.Name||u.name}</td><td className="pr-2">{u.CreditPoints??u.credits??'Unknown'}</td><td>{u.unitType?.Name||u.category||'Not assigned'}</td></tr>)}</tbody></table></div>;
}
export default function ChatPlannerTools({workflow,onWorkflow,toolResult,onResult,document,planningContext,suggestionContext,conversationHistory,onSelectionContext,busy,onBusy,planningOnly=false,aiModel}){
  const [catalog,setCatalog]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [left,setLeft]=useChatSession('tool-left:'+workflow,''),[right,setRight]=useChatSession('tool-right:'+workflow,''),[name,setName]=useChatSession('tool-name:'+workflow,''),[templateId,setTemplate]=useChatSession('tool-templateId:'+workflow,'');
  const [draft,setDraft]=useChatSession('tool-draft:'+workflow,[]),[requirements,setRequirements]=useChatSession('tool-requirements:'+workflow,{}),[templateEdit,setTemplateEdit]=useChatSession('tool-templateEdit:'+workflow,null),[detail,setDetail]=useChatSession('tool-detail:'+workflow,null);
  const [unitSearch,setUnitSearch]=useChatSession('tool-unitSearch:'+workflow,''),[unitId,setUnitId]=useChatSession('tool-unitId:'+workflow,''),[typeId,setTypeId]=useChatSession('tool-typeId:'+workflow,''),[result,setResult]=useChatSession('tool-result:'+workflow,null),[importNotes,setImportNotes]=useChatSession('tool-importNotes:'+workflow,'');
  const [importWarning,setImportWarning]=useChatSession('tool-importWarning:'+workflow,false),[importAcknowledged,setImportAcknowledged]=useChatSession('tool-importAcknowledged:'+workflow,false);
  const autoSuggested=useRef(null);
  const [suggestionPlanner,setSuggestionPlanner]=useState('');
  const [majorSearch,setMajorSearch]=useState(''),[majorLimit,setMajorLimit]=useState(5);
  const [importBook,setImportBook]=useState(null),[importSheet,setImportSheet]=useState('');
  const running=useRef(false),mounted=useRef(true);
  const locked=busy||loading;
  useEffect(()=>{setSuggestionPlanner('');},[document]);
  useEffect(()=>{
    const selected={workflow};
    if(workflow==='compare'){selected.plannerA=left;selected.plannerB=right;}
    if(workflow==='double-major')selected.primaryPlanner=left;
    if(workflow==='management')selected.planner=left;
    if(workflow==='suggestions')selected.planner=suggestionPlanner||(suggestionContext?.plannerConfirmed?suggestionContext.planner:'');
    onSelectionContext?.(selected);
  },[workflow,left,right,suggestionPlanner,suggestionContext,onSelectionContext]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onBusy(loading);return()=>onBusy(false);},[loading,onBusy]);
  async function reload(){
    setLoading(true);setError('');
    try{
      const response=await Auth.authenticatedFetch(`/api/planner-assistant/tools?fresh=${Date.now()}`,{signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Could not load choices.');
      if(mounted.current)setCatalog(data);return data;
    }catch(e){if(mounted.current)setError(e.name==='TimeoutError'?'Loading timed out. Retry; your draft is retained.':e.message);}finally{if(mounted.current)setLoading(false);}
  }
  useEffect(()=>{if(workflow&&!['dpa','suggestions'].includes(workflow)&&!catalog)reload();},[workflow]);
  useEffect(()=>{
    if(!toolResult?.data)return;
    setResult(toolResult);
    if(toolResult.data.plan||toolResult.tool==='match_dpa_planners')setSuggestionPlanner('');
    if(toolResult.data.plan||['inspect_unit','match_dpa_planners'].includes(toolResult.tool))autoSuggested.current=attachmentKey(document);
    if(toolResult.data.suggested?.id)setLeft(String(toolResult.data.suggested.id));
    if(toolResult.data.plannerA?.id){setLeft(String(toolResult.data.plannerA.id));setRight(String(toolResult.data.plannerB.id));}
    if(['inspect_planner','update_planner'].includes(toolResult.tool)){setDetail(toolResult.data);setLeft(String(toolResult.data.id));setTemplate(String(toolResult.data.plannerTemplateId||''));setDraft(toolResult.data.units.map(u=>({...u,unitId:u.ID,unitTypeId:u.unitTypeId||''})));}
  },[toolResult]);
  useEffect(()=>{setResult(current=>current?.tool==='check_double_major'?null:current);},[document,planningContext,workflow]);
  useEffect(()=>{if(workflow==='suggestions'&&document&&!busy&&!loading&&autoSuggested.current!==attachmentKey(document)){autoSuggested.current=attachmentKey(document);run(suggestionContext?.planMode==='full'?'plan_remaining_studies':'suggest_next_semester');}},[workflow,document,busy,loading,suggestionContext?.planMode]);
  function invalidate(){setResult(null);setError('');}
  async function run(name,args={},write=false){
    if(['suggest_next_semester','plan_remaining_studies'].includes(name)&&!args.planner&&(suggestionPlanner||suggestionContext?.plannerConfirmed))args={...args,planner:suggestionPlanner||suggestionContext.planner};
    const targetMajor=suggestionContext?.targetMajor||result?.data?.targetMajor;
    if(['suggest_next_semester','plan_remaining_studies'].includes(name) && !args.targetMajor && !args.planner && targetMajor)args={...args,targetMajor};
    if(running.current||busy)return;running.current=true;setLoading(true);setError('');
    const fingerprint=JSON.stringify({name,args});
    try{
      if(write){
        args={...args,confirmed:true,requestId:saveRequestId(fingerprint)};
      }
      const response=await Auth.authenticatedFetch('/api/planner-assistant/tools',{method:'POST',signal:AbortSignal.timeout(45000),body:JSON.stringify({planningOnly,aiModel,call:{name,arguments:args},document,planningContext,suggestionContext,conversationHistory,question:name==='plan_remaining_studies'?'Plan all remaining semesters until I finish.':name==='suggest_next_semester'?'Suggest my next semester.':name==='replacement_units'?'Find replacements for '+args.code:'Explain this planning result.'})});
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'This task failed. Please retry.');
      if(!mounted.current)return;
      setResult(data);
      if(data.data?.plan)autoSuggested.current=attachmentKey(document);
      onResult(data);
      if(write){completeSaveRequest(fingerprint);const fresh=await reload();if(['save_template','update_template'].includes(data.tool))setTemplateEdit(fresh?.templates.find(t=>t.id===data.data.id)||null);}
    }catch(e){if(mounted.current)setError(['TimeoutError','AbortError'].includes(e.name)?'The request timed out. Your draft is retained. Retry uses the same save ID to avoid duplicates.':e.message);}
    finally{running.current=false;if(mounted.current)setLoading(false);}
  }
  function copyPlanner(id){
    setLeft(id);invalidate();const p=catalog?.planners.find(p=>String(p.id)===id);
    if(p){setName(`${p.name} — copy`);setTemplate(String(p.plannerTemplateId||''));setDraft(p.units.map(u=>({unitId:u.ID,unitTypeId:u.unitTypeId||'',UnitCode:u.UnitCode,Name:u.Name,CreditPoints:u.CreditPoints})));}
  }
  function chooseTemplate(id){
    invalidate();const t=catalog?.templates.find(t=>String(t.id)===id);setTemplateEdit(t||null);setName(t?.name||'');setRequirements(t?{...t.requirements}:{});
  }
  function addUnit(){
    const u=catalog.units.find(u=>String(u.ID)===unitId);
    if(!u||!typeId){setError('Choose a unit and category first.');return;}
    if(draft.some(d=>d.unitId===u.ID)){setError('This unit is already in the draft.');return;}
    setDraft(d=>[...d,{unitId:u.ID,unitTypeId:Number(typeId),UnitCode:u.UnitCode,Name:u.Name,CreditPoints:u.CreditPoints}]);invalidate();
  }
  function applyImport(codes,filename,text){
    const categories=extractPlannerCategories(text,catalog.types);
      const unmatched=[],ambiguous=[],matched=[];
      for(const code of codes){const found=catalog.units.filter(u=>u.UnitCode.trim().toUpperCase()===code);if(found.length===1)matched.push({unitId:found[0].ID,unitTypeId:categories[code]||'',UnitCode:found[0].UnitCode,Name:found[0].Name,CreditPoints:found[0].CreditPoints});else if(found.length>1)ambiguous.push(code);else unmatched.push(code);}
      setImportWarning(Boolean(unmatched.length||ambiguous.length));setImportAcknowledged(false);setDraft(matched);setName(filename.replace(/\.(pdf|xlsx)$/i,''));setImportNotes(`${matched.length} exact unit records found. Unmatched: ${unmatched.join(', ')||'none'}. Ambiguous versions: ${ambiguous.join(', ')||'none'}. Choose categories and review every row before saving. The import extracts a unit pool, not semester placement or colour/category rules.`);setResult(null);
  }
  async function importSelectedSheet(){
    try {
      const XLSX=await import('xlsx');const sheet=importBook.book.Sheets[importSheet];
      const range=XLSX.utils.decode_range(sheet['!ref']||'A1');
      if(range.e.r>3000||range.e.c>100)throw new Error('Planner worksheet is too large.');
      const text=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}).map(r=>r.join('\t')).join('\n');
      const codes=extractPlannerCodes(text);if(!codes.length)throw new Error('No unit codes found in this sheet. Choose another sheet.');
      applyImport(codes,importBook.filename,text);setImportBook(null);setError('');
    }catch(e){setError(e.message);}
  }
  async function importFile(e){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(!/\.(pdf|xlsx)$/i.test(file.name)||file.size>5*1024*1024){setError('Choose a planner PDF or XLSX up to 5 MB.');return;}
    if(running.current)return;setImportBook(null);running.current=true;setLoading(true);setError('');
    try{
      let codes,text='';
      if(/\.pdf$/i.test(file.name)){
        const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read file.'));reader.readAsDataURL(file);});
        const response=await Auth.authenticatedFetch('/api/planner-assistant/document',{method:'POST',signal:AbortSignal.timeout(60000),body:JSON.stringify({name:file.name,base64})});
        const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Could not extract the PDF.');text=data.document.text;codes=extractPlannerCodes(text);
      }else{
        const XLSX=await import('xlsx');const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:false});
        if(book.SheetNames.length>1){setImportBook({book,filename:file.name});setImportSheet(book.SheetNames[0]);return;}
        const sheet=book.Sheets[book.SheetNames[0]],range=XLSX.utils.decode_range(sheet['!ref']||'A1');
        if(range.e.r>3000||range.e.c>100)throw new Error('Planner worksheet is too large.');
        text=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}).map(r=>r.join('\t')).join('\n');codes=extractPlannerCodes(text);
      }
      if(!codes.length)throw new Error('No unit codes found. Try a searchable PDF or XLSX, or add units manually.');
      applyImport(codes,file.name,text);
    }catch(e){setError(e.message);}finally{running.current=false;setLoading(false);}
  }
  return <section aria-label="Planner tools" className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 space-y-5 sm:p-6">
    <div><h3 className="font-semibold">Planning workspace</h3><p className="mb-4 mt-1 text-sm text-neutral-600">Choose a task. Your selections and results stay here in the chat.</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{workspaceTasks.map(w=><button key={w.id} type="button" disabled={locked} aria-pressed={workflow===w.id} onClick={()=>{if(w.id!==workflow){onWorkflow(w.id);setError('');}}} className={`rounded-xl border px-4 py-3 text-left text-sm font-medium ${workflow===w.id?'border-red-700 bg-red-700 text-white':'border-neutral-200 bg-white hover:border-red-300 hover:bg-red-50'} disabled:opacity-40`}>{w.title}</button>)}</div></div>
    {!workflow&&<p className="text-sm">Choose a task above, or type what you want to do. Planner names and IDs can be entered in chat.</p>}
    {workflow&&<>
      <div className="flex justify-between gap-2"><h3 className="font-semibold">{chatWorkflows.find(w=>w.id===workflow)?.title}</h3>{!['dpa','suggestions'].includes(workflow)&&<button type="button" disabled={locked} className="text-xs underline" onClick={reload}>Reload choices</button>}</div>
      {workflow!=='dpa'&&loading&&<p role="status" className="text-sm">Working… your selections are retained.</p>}
      {workflow!=='dpa'&&error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      {!['dpa','suggestions'].includes(workflow)&&!catalog&&!loading&&<button type="button" onClick={reload} className="rounded border p-2">Load / retry choices</button>}
      {catalog&&workflow!=='suggestions'&&<fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
        {workflow==='compare'&&<>
          <div className="grid gap-3 md:grid-cols-2"><SearchSelect label="First planner" items={catalog.planners} value={left} onChange={v=>{setLeft(v);invalidate();}}/><SearchSelect label="Second planner" items={catalog.planners} value={right} onChange={v=>{setRight(v);invalidate();}}/></div>
          {workflow==='double-major'&&<p className="text-sm">Attach your DPA in this chat to check earned major coverage.</p>}
          <button type="button" disabled={!left||!right||left===right} onClick={()=>run(workflow==='compare'?'compare_planners':'check_double_major',{plannerA:left,plannerB:right})} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-40">{workflow==='compare'?'Compare planners':'Check double major'}</button>
          {left&&left===right&&<p className="text-sm text-red-700">Choose two different planners.</p>}
        </>}
        {workflow==='double-major'&&<>
          <p className="text-sm">Attach your DPA beside the chat input. We find the closest primary planner and a different second major, using completed electives against its major units. Results and future semesters appear in the chat.</p>
          <button type="button" disabled={!document} onClick={()=>run('check_double_major')} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-40">Check my DPA for double major</button>
          {result?.data?.choices&&<><SearchSelect label="Primary planner (optional override)" items={result.data.choices} value={left} onChange={setLeft}/><button type="button" disabled={!left} onClick={()=>run('check_double_major',{primaryPlanner:left})} className="rounded border px-3 py-2">Recalculate double-major pathway</button></>}
        </>}
        {workflow==='management'&&<>
          <SearchSelect label="Saved planner" items={catalog.planners} value={left} onChange={v=>{setLeft(v);setDetail(null);invalidate();}}/>
          <button type="button" disabled={!left} onClick={()=>run('inspect_planner',{planner:left})} className="rounded border px-3 py-2">Load planner details</button>
        </>}
        {workflow==='templates'&&<>
          <SearchSelect label="Template (or create new)" items={catalog.templates} value={templateEdit?String(templateEdit.id):''} onChange={chooseTemplate}/>
          <label className="block text-sm">Template name<input className={inputClass} maxLength={150} value={name} onChange={e=>{setName(e.target.value);invalidate();}}/></label>
          <div className="grid gap-2 sm:grid-cols-2">{catalog.types.map(t=><label key={t.ID} className="text-sm">{t.Name}<input className={inputClass} type="number" min="0" max="100" step="1" value={requirements[t.Name]??''} placeholder="Blank = not configured" onChange={e=>{setRequirements(r=>{const next={...r};if(e.target.value==='')delete next[t.Name];else next[t.Name]=Number(e.target.value);return next;});invalidate();}}/></label>)}</div>
          <p className="text-xs">Review the name and counts above. Updating a template changes requirements for every planner linked to it.</p>
          <button type="button" disabled={!(templateEdit?catalog.permissions?.update:catalog.permissions?.create)||!name.trim()||!Object.keys(requirements).length} onClick={()=>run(templateEdit?'update_template':'save_template',{name,requirements,...(templateEdit?{id:templateEdit.id,expectedVersion:templateEdit.updatedAt}:{})},true)} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-40">{templateEdit?'Save reviewed template changes':'Create reviewed template'}</button>
        </>}
        {['maker','upload'].includes(workflow)&&<>
          {workflow==='maker'&&<SearchSelect label="Copy an existing planner (optional)" items={catalog.planners} value={left} onChange={copyPlanner}/>}
          {workflow==='upload'&&<label className="block text-sm">Planner PDF / XLSX<input type="file" accept=".pdf,.xlsx" onChange={importFile} className="block mt-2"/><span className="text-xs">Extract and review a unit pool, up to 5 MB.</span></label>}
          {importBook&&workflow==='upload'&&<div className="space-y-2"><label>Choose worksheet<select className={inputClass} value={importSheet} onChange={e=>setImportSheet(e.target.value)}>{importBook.book.SheetNames.map(sheet=><option key={sheet}>{sheet}</option>)}</select></label><button type="button" onClick={importSelectedSheet} className="rounded border px-3 py-2">Import selected worksheet</button></div>}
          {importNotes&&workflow==='upload'&&<p className="text-sm">{importNotes}</p>}
          {importWarning&&workflow==='upload'&&<label className="block text-sm"><input type="checkbox" checked={importAcknowledged} onChange={e=>setImportAcknowledged(e.target.checked)}/> I reviewed the unmatched/ambiguous codes and intend to save only the units shown below.</label>}
          <label className="block text-sm">New planner name<input className={inputClass} maxLength={150} value={name} onChange={e=>{setName(e.target.value);invalidate();}}/></label>
        </>}
        {(['maker','upload'].includes(workflow)||workflow==='management'&&detail)&&<>
          <label className="block text-sm">Requirement template<select className={inputClass} value={templateId} onChange={e=>{setTemplate(e.target.value);invalidate();}}><option value="">No linked template</option>{catalog.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {workflow!=='management'&&<div className="space-y-2"><SearchSelect label="Add unit" items={catalog.units.map(u=>({id:u.ID,name:`${u.UnitCode} ${u.Name} (${u.Availability})`}))} value={unitId} onChange={setUnitId}/><select aria-label="Category for added unit" className={inputClass} value={typeId} onChange={e=>setTypeId(e.target.value)}><option value="">Choose category</option>{catalog.types.map(t=><option key={t.ID} value={t.ID}>{t.Name}</option>)}</select><button type="button" onClick={addUnit} className="rounded border p-2">Add selected unit</button></div>}
          <div className="max-h-72 overflow-auto space-y-2">{draft.map((u,i)=><div key={u.unitId} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"><span className="min-w-0 flex-1"><strong>{u.UnitCode}</strong> {u.Name} ({u.CreditPoints??'Unknown'} CP)</span><select aria-label={`Category for ${u.UnitCode}`} className="rounded border p-2" value={u.unitTypeId} onChange={e=>{setDraft(d=>d.map((r,j)=>j===i?{...r,unitTypeId:Number(e.target.value)||''}:r));invalidate();}}><option value="">Choose category</option>{catalog.types.map(t=><option key={t.ID} value={t.ID}>{t.Name}</option>)}</select>{workflow!=='management'&&<button type="button" className="underline" onClick={()=>{setDraft(d=>d.filter((_,j)=>j!==i));invalidate();}}>Remove</button>}</div>)}</div>
          {workflow!=='management'&&<div className="flex flex-wrap items-center gap-2"><select aria-label="Category for unassigned imported units" className={inputClass} value={typeId} onChange={e=>setTypeId(e.target.value)}><option value="">Choose category for unassigned rows</option>{catalog.types.map(t=><option key={t.ID} value={t.ID}>{t.Name}</option>)}</select><button type="button" disabled={!typeId} onClick={()=>{setDraft(d=>d.map(u=>u.unitTypeId?u:{...u,unitTypeId:Number(typeId)}));invalidate();}} className="rounded border px-3 py-2">Apply to unassigned rows</button></div>}
          <p className="text-sm">{draft.length} units. Review every category before saving.</p>
          <button type="button" disabled={(workflow==='upload'&&importWarning&&!importAcknowledged)||!(workflow==='management'?catalog.permissions?.update:catalog.permissions?.create)||!draft.length||draft.some(u=>!u.unitTypeId)||(workflow!=='management'&&!name.trim())} onClick={()=>run(workflow==='management'?'update_planner':'save_planner',workflow==='management'?{id:detail.id,units:draft.map(u=>({joinId:u.joinId,unitTypeId:u.unitTypeId})),plannerTemplateId:Number(templateId)||null,expectedVersion:JSON.stringify({templateId:detail.plannerTemplateId,units:detail.units.map(u=>[u.joinId,u.unitTypeId])})}:{name,units:draft.map(u=>({unitId:u.unitId,unitTypeId:u.unitTypeId})),plannerTemplateId:Number(templateId)||null},true)} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-40">{workflow==='management'?'Save reviewed planner settings':'Save reviewed new planner'}</button>
        </>}
      </fieldset>}
    </>}
    {workflow!=='suggestions'&&result?.workflow===workflow&&result.data&&<div className="border-t pt-3 space-y-3 text-sm" aria-live="polite">
      <p>Result appears in the conversation. Use the details below to explore it.</p>
      {result.tool==='compare_planners'&&result.data.diff&&<>{[['onlyInA','Only in first planner'],['onlyInB','Only in second planner'],['inBoth','Shared units'],['unitTypeChanged','Category changes']].map(([key,label])=><details key={key} open={key!=='inBoth'}><summary className="font-medium">{label} ({result.data.diff[key].length})</summary><UnitList units={result.data.diff[key]}/>{key==='unitTypeChanged'&&result.data.diff[key].map(u=><p key={u.ID}>{u.UnitCode}: {u.unitType?.Name||'None'} → {u.unitTypeB?.Name||'None'}</p>)}</details>)}</>}
      {result.tool==='suggest_next_semester'&&result.data.plan&&<><h3 className="font-semibold">Next-semester suggestions ({result.data.plan.selected.length}/4)</h3><UnitList units={result.data.plan.selected}/><details><summary>Unfinished units and why they were not selected</summary>{result.data.plan.candidates.filter(u=>!result.data.plan.selected.some(s=>s.code===u.code)).map(u=><p key={u.code} className="mt-3"><strong>{u.code} {u.name}</strong> ? {[...u.reasons,...u.unknown].join('; ')||'Eligible, but outside the four-unit/50 CP limit or category places.'}</p>)}</details></>}
      {result.tool==='inspect_planner'&&result.data.units&&<UnitList units={result.data.units}/>}
      {result.tool==='replacement_units'&&result.data.suggestions&&<ul>{result.data.suggestions.map(s=><li key={s.code} className="py-1">{s.code} {s.name} — {s.credits??'Unknown'} CP; title similarity {s.nameScore}%; recorded terms {s.terms.join(', ')||'unknown'}</li>)}{!result.data.suggestions.length&&<li>No title-similarity candidates found.</li>}</ul>}
      {result.tool==='check_double_major'&&result.data.options&&<><p className="font-semibold">Primary DPA match: {result.data.primary.name}</p>{!result.data.options.length&&<p>No distinct second-major options found.</p>}<label className="block">Search second-major options<input className={inputClass} value={majorSearch} onChange={e=>{setMajorSearch(e.target.value);setMajorLimit(5);}} placeholder="Major name..."/></label><p>{result.data.options.filter(o=>o.additional.name.toLowerCase().includes(majorSearch.toLowerCase())).length} matching options</p>{result.data.options.filter(o=>o.additional.name.toLowerCase().includes(majorSearch.toLowerCase())).slice(0,majorLimit).map(option=><details key={option.additional.id}><summary>{option.additional.name}: {option.additional.matched}/{option.additional.required} matched, {option.additional.remaining} remaining</summary><p>Completed major units</p><UnitList units={option.additional.units.filter(u=>u.completed)}/><p>Uncompleted pool candidates</p><UnitList units={option.additional.units.filter(u=>!u.completed)}/><p>Unique earned major credits: {option.uniqueCompletedCredits} CP</p></details>)}{result.data.options.filter(o=>o.additional.name.toLowerCase().includes(majorSearch.toLowerCase())).length>majorLimit&&<button type="button" onClick={()=>setMajorLimit(n=>n+5)} className="rounded border px-3 py-2">Show more options</button>}</>}
      {result.tool==='check_double_major'&&result.data.majors&&<>{result.data.majors.map(m=><details key={m.id} open><summary>{m.name}: {m.remaining} remaining — {m.source}</summary><p className="mt-2 font-medium">Completed major units ({m.matched})</p><UnitList units={m.units.filter(u=>u.completed)}/><p className="mt-2 font-medium">Uncompleted pool candidates</p><UnitList units={m.units.filter(u=>!u.completed)}/></details>)}<p>Shared units: {result.data.shared.map(u=>u.code).join(', ')||'none'}. Unique earned major credits: {result.data.uniqueCompletedCredits} CP.</p></>}
    </div>}
  </section>;
}
