'use client';
import styles from '@components/PlannerChat.module.css';

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
  const aiControls=<section aria-label="AI availability" className="space-y-3 text-sm text-neutral-700">
      <div role="status" aria-live="polite" className="text-xs font-medium text-neutral-700">{labels[health.status]}</div>
      <label htmlFor="chat-ai-model" className="block text-xs font-semibold text-neutral-950">Model
        <select id="chat-ai-model" value={selectedModel} disabled={checking||chatBusy} onChange={event=>{const next=event.target.value;setSelectedModel(next);setPlannerMode(false);setHealth(current=>({...current,status:'checking'}));check(true,next);}} className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs font-normal">
          <option value="">{health.models?.length?'Default: '+health.models.join(' / '):'Server default'}</option>
          {(health.installedModels||[]).map(model=><option key={model} value={model}>{model}</option>)}
          {selectedModel&&!(health.installedModels||[]).includes(selectedModel)&&<option value={selectedModel}>{selectedModel} (unavailable)</option>}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={checking||chatBusy} onClick={()=>check(true)}>{checking?'Checking...':'Check AI'}</button>
        <button type="button" className={button} aria-expanded={guide} aria-controls="ai-setup-guide" onClick={()=>setGuide(value=>!value)}>{guide?'Hide setup':'Setup'}</button>
      </div>
      {planningOnly&&<p className="text-xs text-neutral-600">Planner mode</p>}
      <details className="text-xs text-neutral-600"><summary>More settings</summary>
        <p className="mt-2">Switching applies to this tab. Your chat and DPA stay attached.</p>
        {!selectedModel&&health.configuredModels&&health.configuredModels.router!==health.configuredModels.response&&<p className="mt-2">Intent model: {health.configuredModels.router}. Response model: {health.configuredModels.response}.</p>}
        <p className="mt-2">AI interprets requests. Academic results use recorded data and planning rules.</p>
        {available&&<button type="button" className={button+' mt-2'} disabled={chatBusy} onClick={()=>setPlannerMode(value=>!value)}>{plannerMode?'Enable AI':'Use planner mode'}</button>}
      </details>
      {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
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
          <li>Choose <strong>Check AI</strong>. This tests a small response from each configured model without sending your DPA or chat. The first check may take longer while models load.</li>
        </ol>}
        {health.models?.length>0&&<p className="mt-2 text-xs">Configured models: {health.models.join(', ')}.</p>}
        {health.status==='inference-failed'&&<p className="mt-2 text-red-700">Models are installed, but a response failed or took too long. Check Ollama, available memory and the model configuration, then retry.</p>}
        <p className="mt-2 text-xs">A successful check confirms the models responded at that time; it does not guarantee academic accuracy. No download starts automatically.</p>
      </div>}
    </section>;
  return <section aria-label="Chatbot screen" className={styles.page+" relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100 p-2 sm:p-4"}>
    <div className="mx-auto min-h-0 w-full max-w-[1600px] flex-1"><DashboardChat embedded planningOnly={planningOnly} aiControls={aiControls} aiStatus={labels[health.status]} aiModel={selectedModel||undefined} onChatBusyChange={setChatBusy} /></div>
  </section>;
}
