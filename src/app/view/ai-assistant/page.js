'use client';

import { useEffect, useRef, useState } from 'react';
import DashboardChat from '@components/DashboardChat';
import Auth from '@utils/auth/FrontendAuthHelper';

const labels={checking:'Checking AI service…',ready:'AI ready',installed:'Models installed · response not tested',offline:'Ollama unavailable','no-model':'Required model missing','inference-failed':'AI response check failed',unavailable:'Status check unavailable'};
const button='rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:border-red-400 hover:bg-red-50 disabled:opacity-50';

export default function AIAssistantPage() {
  const [health,setHealth]=useState({status:'checking',models:[],missingModels:[]});
  const [checking,setChecking]=useState(false);
  const [plannerMode,setPlannerMode]=useState(false);
  const [guide,setGuide]=useState(false);
  const [error,setError]=useState('');
  const [selectedModel,setSelectedModel]=useState('');
  const [chatBusy,setChatBusy]=useState(false);
  const mounted=useRef(false),request=useRef(null);
  useEffect(()=>{
    mounted.current=true;check(false);
    return()=>{mounted.current=false;request.current?.abort();};
  },[]);
  async function check(verify=true,model=selectedModel){
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setChecking(true);setError('');
    const timer=setTimeout(()=>controller.abort(),verify?185000:5000);
    try{
      const query=new URLSearchParams();if(verify)query.set('verify','1');if(model)query.set('model',model);
      const response=await Auth.authenticatedFetch('/api/planner-assistant'+(query.size?'?'+query.toString():''),{cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!response.ok||!labels[data.status])throw new Error(data.message||'Could not check AI status.');
      if(mounted.current&&request.current===controller)setHealth(data);
    }catch(e){
      if(mounted.current&&request.current===controller){setHealth(current=>({...current,status:'unavailable'}));setError(e.name==='AbortError'?'The check timed out. You can continue in planner mode.':e.message);}
    }finally{
      clearTimeout(timer);
      if(mounted.current&&request.current===controller)setChecking(false);
    }
  }
  const available=['ready','installed'].includes(health.status);
  const planningOnly=plannerMode||!available;
  const models=health.missingModels?.length?health.missingModels:health.models||[];
  const activeModels=selectedModel?[selectedModel]:health.models||[];
  const aiControls=<section aria-label="AI availability" className="w-full rounded-xl border border-red-200 bg-red-50/50 px-3 py-3 text-sm text-neutral-700">
      <label htmlFor="chat-ai-model" className="mb-3 block font-semibold text-neutral-950">Model for new requests
        <select id="chat-ai-model" value={selectedModel} disabled={checking||chatBusy} onChange={event=>{const next=event.target.value;setSelectedModel(next);setPlannerMode(false);setHealth(current=>({...current,status:'checking'}));check(true,next);}} className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs font-normal">
          <option value="">Server default</option>
          {(health.installedModels||[]).map(model=><option key={model} value={model}>{model}</option>)}
          {selectedModel&&!(health.installedModels||[]).includes(selectedModel)&&<option value={selectedModel}>{selectedModel} (unavailable)</option>}
        </select>
      </label>
      <p className="mb-2 break-words text-xs"><strong>{planningOnly?'Selected':'Using'}:</strong> {activeModels.length?activeModels.join(' / '):'Checking server configuration…'}{planningOnly?' (AI paused)':''}</p>
      {!selectedModel&&health.configuredModels&&health.configuredModels.router!==health.configuredModels.response&&<p className="mb-2 break-words text-xs">Request understanding: {health.configuredModels.router}. Reply introduction: {health.configuredModels.response}.</p>}
      <p className="mb-3 text-xs text-neutral-600">Switching keeps your chat and DPA. Applies to this tab only; the host’s default stays unchanged.</p>
      {checking&&<p role="status" className="mb-2 text-xs text-red-700">Loading/checking AI. A cold model may take up to 90 seconds to respond.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="status" aria-live="polite"><span className="font-semibold text-neutral-950">{labels[health.status]}</span><span className="ml-2 text-red-700">{planningOnly?'Planner mode':'AI assisted mode'}</span></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={checking||chatBusy} onClick={()=>check(true)}>{checking?'Checking…':'Check again'}</button>
          <button type="button" className={button} aria-expanded={guide} aria-controls="ai-setup-guide" onClick={()=>setGuide(value=>!value)}>Setup guide</button>
          {available&&<button type="button" className={button} onClick={()=>setPlannerMode(value=>!value)}>{plannerMode?'Use AI assistance':'Continue in planner mode'}</button>}
          {!available&&<button type="button" className={button} onClick={()=>{setPlannerMode(true);setGuide(false);}}>Continue in planner mode</button>}
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-600">{planningOnly?'DPA summaries, planner comparisons and rule checks remain available. Use Choose a task for guided help; flexible prompts may need rephrasing.':'AI helps interpret your question. Planning results still come from your records and rule checks.'}</p>
      {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
      {guide&&<div id="ai-setup-guide" className="mt-3 max-h-[35vh] overflow-y-auto border-t border-neutral-200 pt-3">
        <p className="font-medium text-neutral-950">Setup belongs on the computer running this app’s server.</p>
        <p className="mt-1">If you opened someone else’s website, ask the host to set up AI. Installing Ollama on your own computer will not connect it to that website.</p>
        {health.localService===false?<p className="mt-2">This app uses a separately configured AI service. Ask the host to start it and install the required models there.</p>:<ol className="mt-2 list-decimal space-y-2 pl-5">
          <li><a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="font-medium text-red-700 underline">Download Ollama</a>, install it, and open it on the host computer.</li>
          <li>Open a terminal on that computer and download the configured models. Downloads may be several GB; speed depends on the computer.
            {models.map(model=><code key={model} className="mt-1 block select-all overflow-x-auto rounded bg-neutral-100 p-2 text-neutral-950">ollama pull {model}</code>)}
            {!models.length&&<p className="mt-1">Check the AI service again to see the configured model names.</p>}
          </li>
          <li>If Ollama is not running, open it or run <code className="rounded bg-neutral-100 px-1">ollama serve</code>.</li>
          <li>Choose <strong>Check again</strong>. This tests a small response from each configured model without sending your DPA or chat. The first check may take longer while models load.</li>
        </ol>}
        {health.models?.length>0&&<p className="mt-2 text-xs">Configured models: {health.models.join(', ')}.</p>}
        {health.status==='inference-failed'&&<p className="mt-2 text-red-700">Models are installed, but a response failed or took too long. Check Ollama, available memory and the model configuration, then retry.</p>}
        <p className="mt-2 text-xs">A successful check confirms the models responded at that time; it does not guarantee academic accuracy. No download starts automatically.</p>
      </div>}
    </section>;
  return <section aria-label="Chatbot screen" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100 p-2 sm:p-4">
    <div className="mx-auto min-h-0 w-full max-w-[1600px] flex-1"><DashboardChat embedded planningOnly={planningOnly} aiControls={aiControls} aiStatus={labels[health.status]} aiModel={selectedModel||undefined} onChatBusyChange={setChatBusy} /></div>
  </section>;
}
