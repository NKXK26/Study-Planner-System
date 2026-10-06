'use client';
import {useState} from 'react';
export default function ChatPlannerDownload({snapshot,onPrepare,disabled=false}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function download(){
    setBusy(true);setError('');
    try{const {downloadChatPlannerPdf}=await import('@app/libs/chatPlannerPdf.mjs');downloadChatPlannerPdf(snapshot);}
    catch{setError('Could not generate the PDF. Your suggestions are retained; please retry.');}
    finally{setBusy(false);}
  }
  return <div className="my-2"><button type="button" disabled={busy||disabled} onClick={snapshot?download:onPrepare} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">{busy?'Generating PDF...':snapshot?'Download suggested planner PDF':'Prepare planner PDF'}</button>{!snapshot&&<p className="mt-1 text-xs text-neutral-600">Recheck this saved suggestion to enable its download.</p>}{error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
