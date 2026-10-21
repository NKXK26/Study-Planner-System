'use client';
import {currentDocumentHistory,followUpContext,replacementDocumentContext} from '@app/libs/chatTurnContext.mjs';
import {chatFollowUps} from '@app/libs/chatFollowUps.mjs';
import {attachmentKey} from '@app/libs/plannerIntent.mjs';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Auth from '@utils/auth/FrontendAuthHelper';
import ChatDocumentUpload from './ChatDocumentUpload';
import ChatPlannerTools from './ChatPlannerTools';
import ChatMessage from './ChatMessage';
import ChatPlannerDownload from './ChatPlannerDownload';
import styles from './PlannerChat.module.css';
import {useChatSession,clearChatSession,subscribeChatRecovery} from './useChatSession';
import {nextSuggestionContext,plannerPdfSnapshot,suggestionExportReference} from '@app/libs/plannerConversation.mjs';
import {appendToolReply} from '@app/libs/plannerIntent.mjs';

const welcome = { role: 'assistant', content: 'Ask a study-planning question, or attach your DPA or a new study planner PDF.' };

export default function DashboardChat(props) {
  if (!props.embedded) return <Link href="/view/ai-assistant" className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-800 sm:bottom-6 sm:right-6"><ChatBubbleLeftRightIcon className="h-5 w-5" />Ask AI</Link>;
  return <MainPlannerChat {...props} />;
}

function MainPlannerChat({ theme, embedded = true, planningOnly = false, aiControls, aiStatus, aiModel, onChatBusyChange }) {
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useChatSession('messages',[welcome]);
  const [input, setInput] = useChatSession('input','');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [document, setDocument, restored] = useChatSession('document',null);
  const [plannerDocument,setPlannerDocument]=useChatSession('plannerDocument',null);
  const [reading, setReading] = useState(false);
  const [planningBusy, setPlanningBusy] = useState(false);
  const [primaryPlannerId, setPrimaryPlannerId] = useState(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [, setPlanningContext] = useChatSession('planningContext',null);
  const planningContext=null;
  useEffect(()=>{setPlanningContext(null);},[setPlanningContext]);
  const [chatVersion, setChatVersion] = useState(0);
  const [workflow, setWorkflow] = useChatSession('workflow',null);
  const [workspaceContext,setWorkspaceContext]=useChatSession('workspaceContext',null);
  const [workspaceOpen,setWorkspaceOpen]=useState(false);
  const [aiPanelOpen,setAiPanelOpen]=useState(false);
  useEffect(()=>{if(workspaceOpen)setAiPanelOpen(false);},[workspaceOpen]);
  const [suggestionContext,setSuggestionContext]=useChatSession('suggestionContext',null);
  useEffect(()=>{if(workflow)setWorkspaceOpen(true);},[workflow]);
  const [toolResult, setToolResult] = useState(null);
  const [toolsBusy, setToolsBusy] = useState(false);
  useEffect(()=>{onChatBusyChange?.(busy||toolsBusy||planningBusy||reading);},[busy,toolsBusy,planningBusy,reading,onChatBusyChange]);
  const [recoveryWarning,setRecoveryWarning]=useState('');
  const [unread,setUnread]=useState(false);
  const follow=useRef(true);
  useEffect(()=>subscribeChatRecovery(setRecoveryWarning),[]);
  const pending = useRef(false);
  const controller = useRef(null);
  const log = useRef(null);
  const field = useRef(null);
  const launcher = useRef(null);
  const exportBusy=busy||reading||planningBusy||toolsBusy;
  function preparePdf(message){const reference=suggestionExportReference(message);if(reference)send(null,'Recheck suggestions for '+reference.planner+' and prepare a planner PDF.',primaryPlannerId,{name:'suggest_next_semester',arguments:reference});}

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  useEffect(() => {
    if (log.current && follow.current) log.current.scrollTop = log.current.scrollHeight;
    else if(log.current)setUnread(true);
  }, [messages, busy, open]);

  const resumedAttachment=useRef(null);
  useEffect(()=>{
    const pendingQuestion=suggestionContext?.pendingQuestion;
    if((!document&&!plannerDocument)||!pendingQuestion||busy||reading||toolsBusy)return;
    const attached=plannerDocument?.token||document;
    if(resumedAttachment.current===attached)return;
    resumedAttachment.current=attached;
    const resumedContext={...suggestionContext,pendingQuestion:null};
    setSuggestionContext(resumedContext);
    send(null,pendingQuestion,primaryPlannerId,null,resumedContext);
  },[document,plannerDocument,suggestionContext?.pendingQuestion,busy,reading,toolsBusy]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  async function send(event, override, selectedPlannerId = primaryPlannerId, requestedTool = null, contextOverride = null) {
    event?.preventDefault();
    let question = override || input.trim() || (plannerDocument?'Plan all remaining semesters until I finish.':document ? 'Explain my DPA and suggest my next steps.' : '');
    if (!question || pending.current || reading || planningBusy || toolsBusy) return;
    if(/\bpdf\b/i.test(question)&&/download|export|generate|make|give/i.test(question)){
      const attachmentIndex=messages.findLastIndex(m=>/^(?:DPA|Study planner) attached:|^(?:DPA|Study planner) removed\./.test(m.content));
      const snapshot=messages.slice(attachmentIndex+1).findLast(m=>m.plannerPdf)?.plannerPdf;
      if(snapshot){setInput('');setMessages(current=>[...current,{role:'user',content:question},{role:'assistant',content:'Your suggested semester is ready to download below. This PDF uses the units from the latest suggestion reply.',plannerPdf:snapshot}]);return;}
      requestedTool={name:'suggest_next_semester',arguments:{}};
      question='Suggest next semester units for my planner and prepare a PDF download.';
    }

    const requestContext=contextOverride??suggestionContext;
    if(contextOverride)setSuggestionContext(contextOverride);
    follow.current=true;setUnread(false);
    pending.current = true;
    setBusy(true);
    setError('');
    setInput('');
    const previous = messages;
    setMessages([...previous, { role: 'user', content: question }]);
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 60000);
    try {
      const response = await Auth.authenticatedFetch('/api/planner-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.current.signal,
        body: JSON.stringify({ enableTools: true, planningOnly, aiModel, toolCall:requestedTool||undefined, workflow, workspaceContext, suggestionContext:requestContext, question, document, plannerDocument, planningContext, primaryPlannerId: selectedPlannerId, conversationHistory: currentDocumentHistory(previous) }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || typeof data.answer !== 'string') throw new Error(data.message || 'Could not answer. Please try again.');
      setMessages(current => [...current, { role: 'assistant', content: data.answer, source: data.source, sources: data.sources || [], plannerChoices: data.plannerChoices || [], plannerPdf:plannerPdfSnapshot(data.toolResult),verificationNotes:data.toolResult?.verificationNotes||[],unitChoices:data.toolResult?.data?.unitChoices||[],unitChoiceTool:data.toolResult?.data?.unitChoiceTool,followUps:chatFollowUps({document,toolResult:data.toolResult,question,suggestionContext:nextSuggestionContext(requestContext,data.toolResult)}) }]);
      if (data.toolResult) { setToolResult(data.toolResult); if(!data.toolResult.chatOnly)setWorkflow(data.toolResult.workflow); setSuggestionContext(nextSuggestionContext(requestContext,data.toolResult)); if(data.toolResult.data?.plan)setWorkspaceOpen(false); }
    } catch (err) {
      setMessages(previous);
      setInput(question);
      setError(err.name === 'AbortError' ? 'The request timed out. Please try again.' : err.message);
    } finally {
      clearTimeout(timeout);
      pending.current = false;
      setBusy(false);
    }
  }


  return <div className={embedded ? 'h-full min-h-0' : 'fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6'}>
    {(open || document) && <section id={embedded ? 'full-planner-chat' : 'dashboard-chat'} aria-label="Study Planner Assistant" onKeyDown={event => { if (event.key === 'Escape' && !embedded) close(); }} className={`${open ? 'flex' : 'hidden'} ${embedded ? 'h-full w-full' : 'mb-3 h-[620px] max-h-[calc(100dvh-110px)] w-[calc(100vw-2rem)] sm:w-[460px]'} flex-col overflow-hidden rounded-2xl border shadow-sm border-neutral-200 bg-white text-neutral-900 ${styles.chat}`}>
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-neutral-200 border-t-4 border-t-red-700 bg-white px-5 py-4 text-neutral-950 sm:px-7">
        <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold tracking-tight">Study Planner Assistant</h2></div>
        {!embedded && <button type="button" onClick={close} aria-label="Minimize chat" className="rounded p-2 hover:bg-red-600"><XMarkIcon className="h-5 w-5" /></button>}
      </header>
      <div className="flex justify-between border-b border-neutral-200 bg-neutral-50 px-5 py-2.5 text-sm sm:px-7">
        <Link href={embedded ? '/view/dashboard' : '/view/ai-assistant'} className="underline">{embedded ? 'Back to dashboard' : 'Full chat / AI setup'}</Link>
        <button type="button" className={styles.workspaceToggle} aria-controls="planning-workspace-controls" aria-expanded={workspaceOpen} onClick={()=>{setWorkspaceOpen(value=>!value);setAiPanelOpen(false);}}>Tasks</button>
        <button type="button" disabled={busy || reading || planningBusy || toolsBusy} onClick={() => { clearChatSession(); setWorkspaceContext(null); setWorkspaceOpen(false); setSuggestionContext(null); setMessages([welcome]); setDocument(null); setPlannerDocument(null); setPlanningContext(null); setPrimaryPlannerId(null); setError(''); setInput(''); setWorkflow(null); setToolResult(null); setChatVersion(v=>v+1); field.current?.focus(); }} className="underline disabled:opacity-40">Clear chat</button>
      </div>
      <div className={styles.body+' '+(aiControls?styles.withAi:'')}>
      {aiControls && <aside aria-label="AI settings" className={styles.aiSidebar}>
        <div className={styles.aiSidebarHeader}>
          <h3 className="font-semibold text-neutral-950">AI &amp; setup</h3>
          <button type="button" className={styles.workspaceToggle} aria-expanded={aiPanelOpen} aria-controls="ai-sidebar-controls" onClick={()=>{setAiPanelOpen(value=>!value);setWorkspaceOpen(false);}}>{aiPanelOpen?'Hide':'Open'}</button>
        </div>
        <div id="ai-sidebar-controls" className={styles.aiSidebarContent+' '+(aiPanelOpen?styles.aiSidebarExpanded:'')}>{aiControls}</div>
      </aside>}
      <aside aria-label="Planning workspace" className={styles.workspace}>
        <div className={styles.workspaceHeader}>
          <h3 className="font-semibold text-neutral-950">Tasks</h3>
          <button type="button" className={styles.workspaceToggle} aria-expanded={workspaceOpen} aria-controls="planning-workspace-controls" onClick={()=>{setWorkspaceOpen(value=>!value);setAiPanelOpen(false);}}>{workspaceOpen?'Hide':'Open'}</button>
        </div>
        <div id="planning-workspace-controls" className={styles.workspaceContent+' '+(workspaceOpen?styles.workspaceExpanded:'')}>

        <ChatPlannerTools key={chatVersion} aiModel={aiModel} planningOnly={planningOnly} workflow={workflow} onWorkflow={setWorkflow} toolResult={toolResult} onResult={result => { follow.current=true; setUnread(false); setToolResult(result); setWorkflow(result.workflow); setSuggestionContext(current=>nextSuggestionContext(current,result)); if(result.data?.plan)setWorkspaceOpen(false); setMessages(current => appendToolReply(current,result.answer,{plannerPdf:plannerPdfSnapshot(result),verificationNotes:result.verificationNotes||[],unitChoices:result.data?.unitChoices||[],unitChoiceTool:result.data?.unitChoiceTool,followUps:chatFollowUps({document,toolResult:result,question:messages.findLast(m=>m.role==='user')?.content||'',suggestionContext:nextSuggestionContext(suggestionContext,result)})})); }} document={document} plannerDocument={plannerDocument} planningContext={planningContext} suggestionContext={suggestionContext} conversationHistory={currentDocumentHistory(messages)} onSelectionContext={setWorkspaceContext} busy={busy || reading || planningBusy} onBusy={setToolsBusy} />


        </div>
      </aside>
      <div className={styles.conversation}>

      {suggestionContext?.plannerName&&<details className={styles.planContext} aria-label="Current planning context"><summary>Current plan</summary>
        <p className="mt-2"><strong>{suggestionContext.plannerName}</strong>{!suggestionContext.plannerConfirmed&&' (provisional match)'}<br/>{suggestionContext.term} {suggestionContext.year} | {suggestionContext.preferences?.maxUnits||4} units / {suggestionContext.preferences?.maxCredits||50} CP</p>
        <button type="button" disabled={exportBusy||(!document&&!plannerDocument)} onClick={()=>send(null,'Plan all remaining semesters until I finish.',primaryPlannerId,{name:'plan_remaining_studies',arguments:{}})} className="mt-2 text-red-700 underline disabled:opacity-40">Plan until completion</button>
      </details>}

      <div ref={log} onScroll={()=>{const el=log.current;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;if(follow.current)setUnread(false);}} role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-neutral-50 p-4 sm:p-7">
        {messages.map((message, index) => <div key={index} className={`w-fit max-w-full rounded-2xl px-5 py-4 text-[15px] leading-7 shadow-sm sm:max-w-[85%] ${message.role === 'user' ? 'ml-auto bg-neutral-950 text-white' : 'border border-neutral-200 bg-white text-neutral-900'}`}>
          <p className="mb-2 text-xs font-semibold tracking-wide opacity-70">{message.role === 'user' ? 'You' : 'Assistant'}</p>
          {(message.plannerPdf||suggestionExportReference(message))&&!(index===messages.length-1&&message.followUps?.some(step=>step.action==='pdf'&&step.documentKey===attachmentKey(document)))&&<ChatPlannerDownload snapshot={message.plannerPdf} onPrepare={()=>preparePdf(message)} disabled={exportBusy||(!message.plannerPdf&&!document)}/>}
          <div className={styles.message}><ChatMessage content={message.content} /></div>
          {message.verificationNotes?.some(note=>typeof note==='string'&&note.trim())&&<details className="mt-3 text-sm text-neutral-600"><summary className="cursor-pointer font-medium">Checks and assumptions</summary><ul className="mt-2 list-disc space-y-2 pl-5">{message.verificationNotes.filter(note=>typeof note==='string'&&note.trim()).map((note,i)=><li key={i}>{note}</li>)}</ul></details>}
          {message.unitChoices?.length>0&&['inspect_unit','explain_next_semester'].includes(message.unitChoiceTool)&&<div className="mt-3 flex flex-wrap gap-2" aria-label="Choose the unit">{message.unitChoices.map(choice=><button type="button" key={choice.code} disabled={index!==messages.length-1||busy||reading||planningBusy||toolsBusy} onClick={()=>send(null,'Tell me about '+choice.code,primaryPlannerId,{name:message.unitChoiceTool,arguments:{code:choice.code}})} className="rounded-lg border border-red-200 px-3 py-2 text-left text-sm text-red-800 hover:bg-red-50 disabled:opacity-40">{choice.code} {choice.name}</button>)}</div>}
          {message.plannerChoices?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{message.plannerChoices.map(choice => <button key={choice.id} type="button" disabled={busy || reading || planningBusy || toolsBusy || !document} className="rounded border p-2 text-xs disabled:opacity-40" onClick={() => { setPrimaryPlannerId(choice.id); send(null, `Use ${choice.name} as my primary planner and compare second majors.`, choice.id); }}>{choice.name}</button>)}</div>}
          {index===messages.length-1&&!exportBusy&&message.followUps?.some(step=>step.documentKey===attachmentKey(document))&&<div className="mt-3 flex flex-wrap gap-2" aria-label="Related follow-up questions">{message.followUps.filter(step=>step.documentKey===attachmentKey(document)).map(step=>step.action==='pdf'?<ChatPlannerDownload key={step.id} snapshot={step.snapshot}/>:<button key={step.id} type="button" onClick={()=>send(null,step.prompt,primaryPlannerId,step.call,followUpContext(suggestionContext,step))} className="rounded-lg border border-red-200 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">{step.label}</button>)}</div>}
          {message.sources?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{message.sources.map(source => <Link key={source.id} href={source.href} className="text-xs underline">{source.title}</Link>)}</div>}
        </div>)}
        {(busy || toolsBusy || planningBusy) && <p role="status" className="text-sm opacity-70">{busy?'Finding an answer...':'Updating your plan...'}</p>}
      </div>
      {unread&&<button type="button" onClick={()=>{follow.current=true;setUnread(false);if(log.current)log.current.scrollTop=log.current.scrollHeight;}} className="mx-auto my-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm text-red-700">Jump to latest messages</button>}
      <form onSubmit={send} className="shrink-0 border-t border-neutral-200 bg-white p-3 sm:px-7">
        {recoveryWarning&&<p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{recoveryWarning}</p>}
        {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
        <div aria-label="Chat DPA attachment" className="max-h-[25dvh] overflow-y-auto"><ChatDocumentUpload compact document={document} onChange={next => { setDocument(next); setSuggestionContext(replacementDocumentContext); setToolResult(null); setPlanningContext(null); setDocumentVersion(v=>v+1); setPrimaryPlannerId(null); setMessages(current=>[...current,{role:'assistant',content:next?'DPA attached: '+next.name+'.':'DPA removed.'}]); setError(''); }} busy={busy || reading || planningBusy || toolsBusy} setReading={setReading} onError={setError} /><ChatDocumentUpload kind="planner" compact document={plannerDocument} onChange={next=>{setPlannerDocument(next);setSuggestionContext(replacementDocumentContext);setToolResult(null);setWorkspaceContext(null);setWorkflow(null);setMessages(current=>[...current,{role:'assistant',content:next?'Study planner attached: '+next.name+'. Ask me to plan three or four units per semester until you finish.':'Study planner removed.'}]);setError('');}} busy={busy||reading||planningBusy||toolsBusy} setReading={setReading} onError={setError}/>{reading && <p role="status" className="mb-2 text-sm text-neutral-600">Reading attachment...</p>}</div>
        <label htmlFor="dashboard-chat-input" className="sr-only">Your study planning question</label>
        <div className="flex gap-2">
          <input ref={field} id="dashboard-chat-input" value={input} onChange={event => setInput(event.target.value)} maxLength={2000} readOnly={busy} placeholder="Ask a planning question…" className={"min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base"} />
          <button type="submit" disabled={busy || reading || planningBusy || toolsBusy || (!input.trim() && !document && !plannerDocument)} className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40">Send</button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">Confirm academic decisions with your HOD.</p>
      </form>
      </div>
      </div>
    </section>}
    {!embedded && <button ref={launcher} type="button" onClick={() => open ? close() : setOpen(true)} aria-expanded={open} aria-controls="dashboard-chat" className="ml-auto flex items-center gap-2 rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-800">
      <ChatBubbleLeftRightIcon className="h-5 w-5" />{open ? 'Minimize chat' : 'Ask AI'}
    </button>}
  </div>;
}
